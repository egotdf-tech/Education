<?php
declare(strict_types=1);

function feedback_notice_body(string $feedback, string $text): string {
    return json_encode(['type'=>'feedback','feedback_id'=>$feedback,'text'=>$text],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
}
function decode_notice(array $n): array {
    $v=json_decode($n['body'],true);
    if(is_array($v)&&($v['type']??'')==='feedback'&&isset($v['feedback_id'],$v['text'])&&is_string($v['text'])&&is_string($v['feedback_id'])&&preg_match('/^[a-f0-9]{32}$/D',$v['feedback_id'])){
        $n['body']=$v['text'];$n['feedback_id']=$v['feedback_id'];
    }
    return $n;
}
function notify_organizers(string $lesson,string $feedback,string $text): void {
    $body=feedback_notice_body($feedback,$text);
    foreach(rows("SELECT id FROM bridge_users WHERE role='admin'")as $a)add_notification($a['id'],$lesson,$body);
}
function backfill_feedback_notices(int|string $admin): int {
    $lock='bridge-feedback-backfill-'.substr(hash('sha256',config()['database'].':'.$admin),0,24);
    if((int)q('SELECT GET_LOCK(?,5)',[$lock])->fetchColumn()!==1)throw new RuntimeException('Backfill busy');
    try{return transaction(function()use($admin){
        $known=[];
        foreach(rows('SELECT body FROM bridge_notifications WHERE user_id=?',[$admin])as $n){$d=decode_notice($n);if(isset($d['feedback_id']))$known[$d['feedback_id']]=true;}
        $count=0;
        foreach(rows('SELECT f.id,f.lesson_id,u.name,l.title FROM bridge_feedback f JOIN bridge_users u ON u.id=f.user_id JOIN bridge_lessons l ON l.id=f.lesson_id ORDER BY f.created_at')as $f){
            if(isset($known[$f['id']]))continue;
            add_notification($admin,$f['lesson_id'],feedback_notice_body($f['id'],'Полученный отзыв · '.$f['name'].' · '.$f['title']));$count++;
        }
        return $count;
    });}finally{q('SELECT RELEASE_LOCK(?)',[$lock]);}
}
function read_feedback_notices(int|string $admin,string $feedback): void {
    foreach(rows('SELECT id,body FROM bridge_notifications WHERE user_id=? AND is_read=0',[$admin])as $n){
        $d=decode_notice($n);if(($d['feedback_id']??'')===$feedback)q('UPDATE bridge_notifications SET is_read=1 WHERE id=? AND user_id=?',[$n['id'],$admin]);
    }
}
