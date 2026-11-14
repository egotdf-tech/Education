<?php
declare(strict_types=1);

const BRIDGE_REWARD_DEFAULTS = [
    ['Глаз да практика','hero'], ['Тихий наблюдатель','observer'],
    ['Рыба вне шаблона','fish'], ['Не открывать до озарения','bottle'], ['Совет неочевидных','owl'],
];
const BRIDGE_REWARD_RULES = [
    'streak5'=>[4,'5 встреч без пропусков'], 'streak10'=>[3,'10 встреч без пропусков'],
    'online5'=>[2,'5 встреч онлайн'], 'offline5'=>[1,'5 встреч очно'], 'allhw'=>[0,'Все задания курса'],
];

function rewards_ready(): bool {
    if (!q("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='bridge_features'")->fetchColumn()) return false;
    $row = one("SELECT version FROM bridge_features WHERE name='rewards'");
    return $row && (int)$row['version'] >= 1;
}

function insert_award(int|string $user, string $course, ?string $lesson, string $key, string $kind, array $asset, string $label, ?int $at=null): void {
    // Duplicate detection never replaces the image/name the participant already earned.
    q('INSERT INTO bridge_award_ledger(user_id,course_id,lesson_id,award_key,kind,catalog_id,name,image,label,awarded_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE active=1',
        [$user,$course,$lesson,$key,$kind,$asset['id'],$asset['name'],$asset['image'],$label,$at??clock_ms()]);
}

function grant_review(int|string $user, string $lesson): void {
    if (one('SELECT id FROM bridge_award_ledger WHERE user_id=? AND award_key=?',[$user,'review-'.$lesson])) return;
    $pool = rows('SELECT c.* FROM bridge_reward_catalog c JOIN bridge_reward_pool p ON p.catalog_id=c.id WHERE c.enabled=1 ORDER BY c.id');
    if (!$pool) throw new RuntimeException('Reward pool is empty');
    $l = one('SELECT course_id FROM bridge_lessons WHERE id=?',[$lesson]);
    $f = one('SELECT created_at FROM bridge_feedback WHERE user_id=? AND lesson_id=?',[$user,$lesson]);
    if (!$l || !$f) return;
    $legacy=one('SELECT creature FROM bridge_rewards WHERE user_id=? AND lesson_id=?',[$user,$lesson]);
    $asset=$legacy?one('SELECT * FROM bridge_reward_catalog WHERE id=?',['builtin-'.max(0,min(4,(int)$legacy['creature']))]):$pool[random_int(0,count($pool)-1)];
    insert_award($user,$l['course_id'],$lesson,'review-'.$lesson,'review',$asset,'За обратную связь',(int)$f['created_at']);
}

function sync_user_rewards(int|string $user): void {
    transaction(function()use($user){
        q('SELECT id FROM bridge_users WHERE id=? FOR UPDATE',[$user]);
        $courses=rows('SELECT c.* FROM bridge_courses c JOIN bridge_memberships m ON m.course_id=c.id WHERE m.user_id=?',[$user]);
        $ls=rows('SELECT l.* FROM bridge_lessons l JOIN bridge_memberships m ON m.course_id=l.course_id WHERE m.user_id=? ORDER BY l.start_at,l.id',[$user]);
        $attendance=[];foreach(rows('SELECT lesson_id,format FROM bridge_attendance WHERE user_id=?',[$user])as $a)$attendance[$a['lesson_id']]=$a['format'];
        $homework=[];foreach(rows('SELECT lesson_id,done FROM bridge_homework WHERE user_id=?',[$user])as $h)$homework[$h['lesson_id']]=['done'=>(bool)$h['done']];
        // Reuse the original, tested eligibility calculation; only the awarded picture becomes persistent.
        $eligible=awards($user,$courses,$ls,$attendance,$homework,[]);
        q("UPDATE bridge_award_ledger SET active=0 WHERE user_id=? AND kind<>'review'",[$user]);
        foreach($eligible as $a){
            foreach($courses as $c)foreach(BRIDGE_REWARD_RULES as $kind=>[$default,$label]){
                if($a['key']!==$c['id'].$kind)continue;
                $asset=one('SELECT c.* FROM bridge_reward_rules r JOIN bridge_reward_catalog c ON c.id=r.catalog_id WHERE r.kind=?',[$kind]);
                if(!$asset)throw new RuntimeException('Reward rule missing');
                insert_award($user,$c['id'],null,$a['key'],$kind,$asset,$label);
            }
        }
        foreach(rows('SELECT lesson_id FROM bridge_feedback WHERE user_id=?',[$user])as $f)grant_review($user,$f['lesson_id']);
    });
}

function sync_all_rewards(): void {
    foreach(rows("SELECT id FROM bridge_users WHERE role='student' ORDER BY id") as $s)sync_user_rewards($s['id']);
}

function upgrade_rewards(): void {
    // Serialise upgrades without holding a transaction across MySQL DDL (implicit commits).
    $lock='bridge-reward-upgrade-'.substr(hash('sha256',config()['database']),0,24);
    if((int)q('SELECT GET_LOCK(?,10)',[$lock])->fetchColumn()!==1)throw new RuntimeException('Upgrade is busy');
    try {
        if(rewards_ready())return;
        foreach(explode(';',file_get_contents(__DIR__.'/rewards-schema.sql'))as $sql)if(trim($sql)!=='')db()->exec($sql);
        transaction(function(){
            foreach(BRIDGE_REWARD_DEFAULTS as $i=>[$name,$image]){
                q('INSERT IGNORE INTO bridge_reward_catalog(id,name,image,created_at) VALUES(?,?,?,?)',['builtin-'.$i,$name,$image,clock_ms()]);
                q('INSERT IGNORE INTO bridge_reward_pool(catalog_id) VALUES(?)',['builtin-'.$i]);
            }
            foreach(BRIDGE_REWARD_RULES as $kind=>[$i,$label])q('INSERT IGNORE INTO bridge_reward_rules(kind,catalog_id) VALUES(?,?)',[$kind,'builtin-'.$i]);
            // Preserve the exact characters from legacy feedback awards, not fresh random choices.
            foreach(rows('SELECT r.user_id,r.lesson_id,r.creature,l.course_id,f.created_at FROM bridge_rewards r JOIN bridge_lessons l ON l.id=r.lesson_id JOIN bridge_feedback f ON f.user_id=r.user_id AND f.lesson_id=r.lesson_id')as $r){
                $i=max(0,min(4,(int)$r['creature']));$asset=one('SELECT * FROM bridge_reward_catalog WHERE id=?',['builtin-'.$i]);
                insert_award($r['user_id'],$r['course_id'],$r['lesson_id'],'review-'.$r['lesson_id'],'review',$asset,'За обратную связь',(int)$r['created_at']);
            }
        });
        // Freeze currently eligible achievements before an organizer can change the defaults.
        sync_all_rewards();
        q("INSERT INTO bridge_features(name,version) VALUES('rewards',1) ON DUPLICATE KEY UPDATE version=1");
    } finally {q('SELECT RELEASE_LOCK(?)',[$lock]);}
}

function reward_asset_image(array $input): string {
    $raw=field($input,'image_data',800000,true);
    if(!preg_match('#^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$#',$raw,$m))fail('Выберите PNG, JPG или WebP');
    $bytes=base64_decode($m[2],true);$info=$bytes!==false?@getimagesizefromstring($bytes):false;
    if(!$info||strlen($bytes)>2000000||$info[0]>2000||$info[1]>2000||!in_array($info['mime'],['image/png','image/jpeg','image/webp'],true))fail('Картинка слишком большая или имеет неверный формат');
    $ext=['image/png'=>'png','image/jpeg'=>'jpg','image/webp'=>'webp'][$info['mime']];
    $dir=dirname(__DIR__).'/public_html/uploads';
    if(!is_dir($dir)&&!mkdir($dir,0755,true))throw new RuntimeException('Upload directory unavailable');
    $name=bin2hex(random_bytes(10)).'.'.$ext;
    if(file_put_contents($dir.'/'.$name,$bytes)===false)throw new RuntimeException('Image storage failed');
    return $name;
}
