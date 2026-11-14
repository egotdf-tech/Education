<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Frame-Options: DENY');
try {
 require dirname(__DIR__).'/bridge-app/bootstrap.php';
 require dirname(__DIR__).'/bridge-app/auth.php';
 require dirname(__DIR__).'/bridge-app/attendance.php';
 require dirname(__DIR__).'/bridge-app/rewards.php';
 $config=config();
 if(($config['environment']??'production')!=='test'&&empty($_SERVER['HTTPS'])&&($_SERVER['HTTP_X_FORWARDED_PROTO']??'')!=='https')fail('Откройте сайт через HTTPS',400);
 session_boot();
 $action=$_GET['action']??'state';$method=$_SERVER['REQUEST_METHOD'];
 if($method==='POST'){
  if(!hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN']??''))fail('Обновите страницу и повторите действие',403);
  if((int)($_SERVER['CONTENT_LENGTH']??0)>3500000)fail('Слишком большой запрос',413);
  $input=json_decode(file_get_contents('php://input'),true);if(!is_array($input))fail('Неверный формат запроса');
 }else{$input=[];}
 if($action==='session')respond(['user'=>session_user()?:null,'csrf'=>$_SESSION['csrf'],'server_time'=>clock_ms()]);
 if($method!=='POST'&&$action!=='state')fail('Неподдерживаемый метод',405);
 auth_action($action,$input);
 $u=user();
 if($u['role']==='admin'&&in_array($action,['join','attendance','homework','feedback'],true))fail('Это действие доступно участникам — организатор управляет курсом отдельно',403);
 if($action==='logout'){$_SESSION=[];session_destroy();respond(['ok'=>true]);}
 if($action==='profile'){q('UPDATE bridge_users SET name=? WHERE id=?',[field($input,'name',100,true),$u['id']]);respond(['ok'=>true]);}
 if($action==='state'){
  $courses=$u['role']==='admin'?rows('SELECT * FROM bridge_courses ORDER BY title'):rows('SELECT c.* FROM bridge_courses c JOIN bridge_memberships m ON m.course_id=c.id WHERE m.user_id=? ORDER BY c.title',[$u['id']]);
  $ls=$u['role']==='admin'?rows('SELECT * FROM bridge_lessons ORDER BY start_at'):rows('SELECT l.* FROM bridge_lessons l JOIN bridge_memberships m ON m.course_id=l.course_id WHERE m.user_id=? ORDER BY start_at',[$u['id']]);
  $attendance=[];foreach(rows('SELECT a.* FROM bridge_attendance a JOIN bridge_lessons l ON l.id=a.lesson_id JOIN bridge_memberships m ON m.course_id=l.course_id AND m.user_id=a.user_id WHERE a.user_id=?',[$u['id']]) as $a)$attendance[$a['lesson_id']]=$a['format'];
  $homework=[];foreach(rows('SELECT * FROM bridge_homework WHERE user_id=?',[$u['id']])as $h)$homework[$h['lesson_id']]=['text'=>$h['body'],'done'=>(bool)$h['done'],'comment'=>$h['comment']];
  $feedback=$u['role']==='admin'?rows('SELECT f.*,u.name FROM bridge_feedback f JOIN bridge_users u ON u.id=f.user_id ORDER BY f.created_at DESC'):rows("SELECT f.*,u.name FROM bridge_feedback f JOIN bridge_users u ON u.id=f.user_id JOIN bridge_lessons l ON l.id=f.lesson_id JOIN bridge_memberships m ON m.course_id=l.course_id WHERE m.user_id=? AND (f.user_id=? OR f.visibility='public') ORDER BY f.created_at DESC",[$u['id'],$u['id']]);
  foreach($feedback as &$f){$f['replies']=rows('SELECT r.id,r.body AS text,r.user_id,u.name,u.role,r.created_at FROM bridge_replies r JOIN bridge_users u ON u.id=r.user_id WHERE r.feedback_id=? ORDER BY r.id',[$f['id']]);}unset($f);
  $ready=rewards_ready();
  if($ready){
   if($u['role']==='admin')sync_all_rewards();else sync_user_rewards($u['id']);
   $awards=rows('SELECT award_key AS `key`,name,image,label,course_id,awarded_at,catalog_id FROM bridge_award_ledger WHERE user_id=? AND active=1 ORDER BY awarded_at,id',[$u['id']]);
   foreach($awards as &$aw){$aw['creature']=preg_match('/^builtin-([0-4])$/',$aw['catalog_id'],$m)?(int)$m[1]:0;}unset($aw);
  }else{$awards=awards($u['id'],$courses,$ls,$attendance,$homework,$feedback);}
  $normalizedCourses=array_map(function($c)use($u){$v=['id'=>$c['id'],'title'=>$c['title'],'description'=>$c['description'],'end'=>(int)$c['end_at'],'image'=>$c['image']];if($u['role']==='admin')$v['code']=$c['code'];return $v;},$courses);
  $data=['profile'=>$u,'csrf'=>$_SESSION['csrf'],'courses'=>$normalizedCourses,'lessons'=>array_map('normalized_lesson',$ls),'attendance'=>$attendance,'homework'=>$homework,'feedback'=>$feedback,'awards'=>$awards,'notifications'=>rows('SELECT id,lesson_id,body,is_read FROM bridge_notifications WHERE user_id=? ORDER BY id DESC LIMIT 100',[$u['id']]),'server_time'=>clock_ms(),'rewards_ready'=>$ready];
  if($u['role']==='admin'){
   $data['students']=rows('SELECT u.id,u.name,c.login,m.course_id FROM bridge_memberships m JOIN bridge_users u ON u.id=m.user_id LEFT JOIN bridge_credentials c ON c.user_id=u.id ORDER BY u.name');
   $data['all_attendance']=rows('SELECT * FROM bridge_attendance');$data['all_homework']=rows('SELECT * FROM bridge_homework');
   $data['attendance_metrics']=attendance_metrics($courses,$ls,$data['students'],$data['all_attendance'],clock_ms());
   if($ready){
    $data['reward_catalog']=rows('SELECT * FROM bridge_reward_catalog ORDER BY created_at,id');
    $data['reward_rules']=rows('SELECT * FROM bridge_reward_rules ORDER BY kind');
    $data['reward_pool']=array_column(rows('SELECT catalog_id FROM bridge_reward_pool'),'catalog_id');
    $data['student_awards']=rows('SELECT a.*,u.name AS student_name,c.title AS course_title FROM bridge_award_ledger a JOIN bridge_users u ON u.id=a.user_id JOIN bridge_courses c ON c.id=a.course_id ORDER BY a.awarded_at DESC,a.id DESC');
   }
   $data['outbox_pending']=(int)q('SELECT COUNT(*) FROM bridge_outbox WHERE sent_at IS NULL')->fetchColumn();
  }respond($data);
 }
 if($action==='join'){
  rate('join:'.$u['id'],10,900);$code=field($input,'code',80,true);$c=one('SELECT id FROM bridge_courses WHERE code=?',[$code]);if(!$c)fail('Код группы не найден');
  q('INSERT IGNORE INTO bridge_memberships(user_id,course_id) VALUES(?,?)',[$u['id'],$c['id']]);respond(['ok'=>true,'course'=>$c['id']]);
 }
 if($action==='read_notifications'){q('UPDATE bridge_notifications SET is_read=1 WHERE user_id=?',[$u['id']]);respond(['ok'=>true]);}
 if($action==='attendance'){
  $l=lesson(field($input,'lesson',40,true),$u);if($l['cancelled']||clock_ms()<$l['start_at']||clock_ms()>=$l['end_at'])fail('Сейчас отметка посещения недоступна');
  $format=field($input,'format',10,true);if(!in_array($format,['online','offline'],true))fail('Выберите формат участия');
  q('INSERT INTO bridge_attendance(user_id,lesson_id,format,updated_at) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE format=VALUES(format),updated_at=VALUES(updated_at)',[$u['id'],$l['id'],$format,clock_ms()]);respond(['ok'=>true]);
 }
 if($action==='homework'){
  $l=lesson(field($input,'lesson',40,true),$u);if($l['cancelled']||$l['homework']===''||clock_ms()>=$l['course_end'])fail('Приём задания закрыт');
  $body=field($input,'answer',15000,true);
  $saved=transaction(function()use($l,$u,$body){q('SELECT id FROM bridge_users WHERE id=? FOR UPDATE',[$u['id']]);$h=one('SELECT done FROM bridge_homework WHERE user_id=? AND lesson_id=? FOR UPDATE',[$u['id'],$l['id']]);if($h&&$h['done'])return false;q("INSERT INTO bridge_homework(user_id,lesson_id,body,comment,updated_at) VALUES(?,?,?,'',?) ON DUPLICATE KEY UPDATE body=VALUES(body),updated_at=VALUES(updated_at)",[$u['id'],$l['id'],$body,clock_ms()]);return true;});
  if(!$saved)fail('Задание уже проверено и закрыто для изменений');respond(['ok'=>true]);
 }
 if($action==='feedback'){
  $l=lesson(field($input,'lesson',40,true),$u);if($l['cancelled']||clock_ms()<$l['end_at']||clock_ms()>=$l['end_at']+172800000)fail('Обратная связь принимается 48 часов после занятия');
  $values=[];foreach(['takeaway','impression','question','liked','wishes']as $key)$values[]=field($input,$key,5000,$key==='takeaway');
  $visibility=field($input,'visibility',10,true);if(!in_array($visibility,['public','private'],true))fail('Выберите видимость');
  transaction(function()use($u,$l,$values,$visibility){
   q('SELECT id FROM bridge_users WHERE id=? FOR UPDATE',[$u['id']]);
   $f=one('SELECT id FROM bridge_feedback WHERE user_id=? AND lesson_id=? FOR UPDATE',[$u['id'],$l['id']]);
   if($f)q('UPDATE bridge_feedback SET takeaway=?,impression=?,question=?,liked=?,wishes=?,visibility=? WHERE id=?',[...$values,$visibility,$f['id']]);
   else{
    q('INSERT INTO bridge_feedback(id,user_id,lesson_id,takeaway,impression,question,liked,wishes,visibility,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',[uid(),$u['id'],$l['id'],...$values,$visibility,clock_ms()]);
    if(rewards_ready())grant_review($u['id'],$l['id']);
    q('INSERT IGNORE INTO bridge_rewards(user_id,lesson_id,creature) VALUES(?,?,?)',[$u['id'],$l['id'],random_int(0,4)]);
   }
   queue_telegram('Новый или обновлённый отзыв · '.$u['name'].' · '.$l['title'].' · '.($visibility==='public'?'для группы':'личный')."\n".config()['base_url']);
  });respond(['ok'=>true]);
 }
 if($action==='reply'){
  $id=field($input,'feedback',40,true);$f=one('SELECT * FROM bridge_feedback WHERE id=?',[$id]);if(!$f)fail('Запись не найдена',404);$l=lesson($f['lesson_id'],$u);
  if($u['role']!=='admin'&&(string)$f['user_id']!==(string)$u['id'])fail('Отвечать могут автор и организатор',403);
  $text=field($input,'text',5000,true);
  transaction(function()use($id,$u,$text,$f,$l){q('INSERT INTO bridge_replies(feedback_id,user_id,body,created_at) VALUES(?,?,?,?)',[$id,$u['id'],$text,clock_ms()]);if($u['role']==='admin')add_notification($f['user_id'],$l['id'],'Организатор ответил на ваш отзыв: '.$l['title']);else queue_telegram('Новое сообщение · '.$u['name'].' · '.$l['title']."\n".config()['base_url']);});respond(['ok'=>true]);
 }
 if($action==='change_password'){
  rate('password-change:'.$u['id'],10,900);
  $password=new_password($input);$current=$input['current_password']??'';
  $result=transaction(function()use($u,$password,$current){
   $r=one('SELECT * FROM bridge_credentials WHERE user_id=? FOR UPDATE',[$u['id']]);
   if(!is_string($current)||strlen($current)>72||!password_verify($current,$r['password_hash']))return false;
   q('UPDATE bridge_credentials SET password_hash=?,auth_version=auth_version+1,reset_hash=NULL,reset_expires_at=NULL WHERE user_id=?',[password_hash($password,PASSWORD_DEFAULT),$u['id']]);
   return one('SELECT user_id,auth_version FROM bridge_credentials WHERE user_id=?',[$u['id']]);
  });
  if(!$result)fail('Текущий пароль неверный');establish_session($result);respond(['csrf'=>$_SESSION['csrf']]);
 }
 if($action==='rotate_recovery'){
  rate('recovery-rotate:'.$u['id'],10,900);$current=$input['current_password']??'';$code=recovery_code();
  $result=transaction(function()use($u,$current,$code){
   $r=one('SELECT * FROM bridge_credentials WHERE user_id=? FOR UPDATE',[$u['id']]);
   if(!is_string($current)||strlen($current)>72||!password_verify($current,$r['password_hash']))return false;
   q('UPDATE bridge_credentials SET recovery_hash=?,auth_version=auth_version+1,reset_hash=NULL,reset_expires_at=NULL WHERE user_id=?',[recovery_hash($code),$u['id']]);
   return one('SELECT user_id,auth_version FROM bridge_credentials WHERE user_id=?',[$u['id']]);
  });
  if(!$result)fail('Текущий пароль неверный');establish_session($result);respond(['csrf'=>$_SESSION['csrf'],'recovery_code'=>$code]);
 }
 // All remaining operations are explicitly administrator-only.
 admin();
 if($action==='upgrade_features'){
  rate('upgrade-features:'.$u['id'],5,900);
  $password=$input['current_password']??'';$credentials=one('SELECT password_hash FROM bridge_credentials WHERE user_id=?',[$u['id']]);
  if(($input['backup_confirmed']??false)!==true||!is_string($password)||strlen($password)>72||!password_verify($password,$credentials['password_hash']))fail('Подтвердите резервную копию и пароль организатора');
  upgrade_rewards();respond(['ok'=>true]);
 }
 if(in_array($action,['reward_asset_save','reward_rules_save'],true)){
  if(!rewards_ready())fail('Сначала примените обновление наград',409);
  if($action==='reward_asset_save'){
   $id=field($input,'id',40)?:uid();$name=field($input,'name',120,true);$old=one('SELECT * FROM bridge_reward_catalog WHERE id=?',[$id]);
   $enabled=($input['enabled']??true)?1:0;
   if(!$enabled&&(one('SELECT kind FROM bridge_reward_rules WHERE catalog_id=?',[$id])||one('SELECT catalog_id FROM bridge_reward_pool WHERE catalog_id=?',[$id])))fail('Сначала уберите персонажа из правил и набора за отзыв');
   $image=!empty($input['image_data'])?reward_asset_image($input):($old['image']??'');
   if($image==='')fail('Загрузите картинку нового персонажа');
   sync_all_rewards();
   q('INSERT INTO bridge_reward_catalog(id,name,image,enabled,created_at) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),image=VALUES(image),enabled=VALUES(enabled)',[$id,$name,$image,$enabled,clock_ms()]);respond(['id'=>$id]);
  }
  $pool=$input['pool']??null;$rules=$input['rules']??null;
  if(!is_array($pool)||!$pool||count($pool)>100||!is_array($rules))fail('Выберите хотя бы одного персонажа за отзыв и все достижения');
  $ids=[];foreach($pool as $id){if(!is_string($id)||strlen($id)>40)fail('Некорректный персонаж');$ids[]=$id;}
  foreach(BRIDGE_REWARD_RULES as $kind=>$unused){if(!isset($rules[$kind])||!is_string($rules[$kind]))fail('Настройте каждое достижение');$ids[]=$rules[$kind];}
  foreach(array_unique($ids)as $id)if(!one('SELECT id FROM bridge_reward_catalog WHERE id=? AND enabled=1',[$id]))fail('Персонаж недоступен');
  // Capture all eligible awards with the OLD rules before changing future rewards.
  sync_all_rewards();
  transaction(function()use($pool,$rules){
   q('DELETE FROM bridge_reward_pool');foreach(array_unique($pool)as $id)q('INSERT INTO bridge_reward_pool(catalog_id) VALUES(?)',[$id]);
   foreach(BRIDGE_REWARD_RULES as $kind=>$unused)q('UPDATE bridge_reward_rules SET catalog_id=? WHERE kind=?',[$rules[$kind],$kind]);
  });respond(['ok'=>true]);
 }
 if($action==='admin_reset'){
  rate('admin-reset:'.$u['id'],15,900);
  $sid=(int)($input['student']??0);$current=$input['current_password']??'';
  $self=one('SELECT password_hash FROM bridge_credentials WHERE user_id=?',[$u['id']]);
  if(!is_string($current)||strlen($current)>72||!password_verify($current,$self['password_hash']))fail('Подтвердите ваш пароль');
  $target=one('SELECT id,role FROM bridge_users WHERE id=?',[$sid]);
  if(!$target||$target['role']!=='student')fail('Этот способ доступен только для восстановления студентов');
  $code=recovery_code();$expires=clock_ms()+900000;
  $changed=q('UPDATE bridge_credentials SET reset_hash=?,reset_expires_at=? WHERE user_id=?',[recovery_hash($code),$expires,$sid])->rowCount();
  if(!$changed)fail('У аккаунта ещё нет логина — требуется отдельная миграция');
  q("INSERT INTO bridge_audit(actor_id,subject_id,lesson_id,before_value,after_value,created_at) VALUES(?,?,'account-reset','', 'issued',?)",[$u['id'],$sid,clock_ms()]);
  respond(['reset_code'=>$code,'expires_at'=>$expires]);
 }
 if($action==='course_save'){
  $id=field($input,'id',40)?:uid();$title=field($input,'title',150,true);$desc=field($input,'description');$code=field($input,'code',80,true);$end=(int)($input['end']??0);if($end<=0)fail('Укажите окончание курса');
  if(one('SELECT id FROM bridge_lessons WHERE course_id=? AND end_at>?',[$id,$end]))fail('Курс не может закончиться раньше занятия');
  $other=one('SELECT id FROM bridge_courses WHERE code=? AND id<>?',[$code,$id]);if($other)fail('Код уже используется другим курсом');
  $existing=one('SELECT image FROM bridge_courses WHERE id=?',[$id]);
  $image=!empty($input['remove_image'])?'hero':($existing['image']??'hero');
  if(!empty($input['image_data'])){
   $raw=field($input,'image_data',800000);
   if(!preg_match('#^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$#',$raw,$m))fail('Выберите PNG, JPG или WebP');
   $bytes=base64_decode($m[2],true);$info=$bytes!==false?@getimagesizefromstring($bytes):false;
   if(!$info||strlen($bytes)>2000000||$info[0]>2000||$info[1]>2000||!in_array($info['mime'],['image/png','image/jpeg','image/webp'],true))fail('Картинка слишком большая или имеет неверный формат');
   $ext=['image/png'=>'png','image/jpeg'=>'jpg','image/webp'=>'webp'][$info['mime']];
   $dir=__DIR__.'/uploads';if(!is_dir($dir)&&!mkdir($dir,0755,true))throw new RuntimeException('Image directory unavailable');
   // 20 hex characters + extension fits the already installed VARCHAR(30).
   $image=bin2hex(random_bytes(10)).'.'.$ext;
   if(file_put_contents($dir.'/'.$image,$bytes)===false)throw new RuntimeException('Image storage failed');
  }
  q('INSERT INTO bridge_courses(id,title,description,code,end_at,image) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE title=VALUES(title),description=VALUES(description),code=VALUES(code),end_at=VALUES(end_at),image=VALUES(image)',[$id,$title,$desc,$code,$end,$image]);respond(['id'=>$id]);
 }
 if($action==='lesson_save'){
  $id=field($input,'id',40)?:uid();$cid=field($input,'course',40,true);$c=one('SELECT * FROM bridge_courses WHERE id=?',[$cid]);if(!$c)fail('Сначала создайте курс');
  $old=one('SELECT course_id,image FROM bridge_lessons WHERE id=?',[$id]);if($old&&$old['course_id']!==$cid)fail('Нельзя переносить занятие между курсами — создайте копию');
  $start=(int)($input['start']??0);$end=(int)($input['end']??0);if($start<=0||$end<=$start||$end>$c['end_at'])fail('Проверьте начало, окончание занятия и дату завершения курса');
  $url=field($input,'url',2000);if($url!==''&&(!filter_var($url,FILTER_VALIDATE_URL)||!in_array(parse_url($url,PHP_URL_SCHEME),['http','https'],true)))fail('Нужна ссылка http:// или https://');
  $image=$old['image']??'hero';
  if(!empty($input['image_data'])){
   $raw=field($input,'image_data',800000);if(!preg_match('#^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$#',$raw,$m))fail('Выберите PNG, JPG или WebP');
   $bytes=base64_decode($m[2],true);$info=$bytes!==false?@getimagesizefromstring($bytes):false;
   if(!$info||strlen($bytes)>2000000||$info[0]>2000||$info[1]>2000||!in_array($info['mime'],['image/png','image/jpeg','image/webp'],true))fail('Картинка слишком большая или имеет неверный формат');
   $ext=['image/png'=>'png','image/jpeg'=>'jpg','image/webp'=>'webp'][$info['mime']];$dir=__DIR__.'/uploads';if(!is_dir($dir))mkdir($dir,0755,true);$image=uid().'.'.$ext;if(file_put_contents($dir.'/'.$image,$bytes)===false)throw new RuntimeException('Image storage failed');
  }
  q('INSERT INTO bridge_lessons(id,course_id,title,start_at,end_at,teacher,address,url,description,homework,image,cancelled) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE title=VALUES(title),start_at=VALUES(start_at),end_at=VALUES(end_at),teacher=VALUES(teacher),address=VALUES(address),url=VALUES(url),description=VALUES(description),homework=VALUES(homework),image=VALUES(image),cancelled=VALUES(cancelled)',[$id,$cid,field($input,'title',150,true),$start,$end,field($input,'teacher',150,true),field($input,'address',300),$url,field($input,'description'),field($input,'homework',10000),$image,!empty($input['cancelled'])?1:0]);respond(['id'=>$id]);
 }
 if($action==='admin_attendance'){
  $l=lesson(field($input,'lesson',40,true),$u);$sid=(int)($input['student']??0);$format=field($input,'format',10);if(!in_array($format,['','online','offline'],true))fail('Неверный формат');
  if(!one('SELECT user_id FROM bridge_memberships WHERE user_id=? AND course_id=?',[$sid,$l['course_id']]))fail('Студент не состоит в группе');
  transaction(function()use($u,$l,$sid,$format){q('SELECT id FROM bridge_users WHERE id=? FOR UPDATE',[$sid]);$prev=one('SELECT format FROM bridge_attendance WHERE user_id=? AND lesson_id=?',[$sid,$l['id']]);if($format==='')q('DELETE FROM bridge_attendance WHERE user_id=? AND lesson_id=?',[$sid,$l['id']]);else q('INSERT INTO bridge_attendance(user_id,lesson_id,format,updated_at) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE format=VALUES(format),updated_at=VALUES(updated_at)',[$sid,$l['id'],$format,clock_ms()]);q('INSERT INTO bridge_audit(actor_id,subject_id,lesson_id,before_value,after_value,created_at) VALUES(?,?,?,?,?,?)',[$u['id'],$sid,$l['id'],$prev['format']??'',$format,clock_ms()]);});respond(['ok'=>true]);
 }
 if($action==='check_homework'){
  $sid=(int)($input['student']??0);$id=field($input,'lesson',40,true);lesson($id,$u);$comment=field($input,'comment');$done=!empty($input['done']);
  $ok=transaction(function()use($sid,$id,$comment,$done){q('SELECT id FROM bridge_users WHERE id=? FOR UPDATE',[$sid]);$h=one('SELECT * FROM bridge_homework WHERE user_id=? AND lesson_id=? FOR UPDATE',[$sid,$id]);if(!$h)return false;q('UPDATE bridge_homework SET done=?,comment=?,updated_at=? WHERE user_id=? AND lesson_id=?',[$done?1:0,$comment,clock_ms(),$sid,$id]);add_notification($sid,$id,$done?'Домашнее задание выполнено':'Проверка домашнего задания обновлена');return true;});if(!$ok)fail('Задание не отправлено');respond(['ok'=>true]);
 }
 fail('Действие не найдено',404);
} catch(Throwable $error) {
 if(isset($config)&&($config['environment']??'')==='test')error_log($error->getMessage());
 http_response_code(503);echo json_encode(['error'=>'Сервис временно недоступен — проверьте настройку приложения или обратитесь к организатору'],JSON_UNESCAPED_UNICODE);
}
