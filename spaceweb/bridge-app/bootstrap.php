<?php
declare(strict_types=1);
date_default_timezone_set('Asia/Yekaterinburg');
ini_set('display_errors', '0');
function config(): array {
 static $c;
 if ($c === null) {
  $path = getenv('BRIDGE_CONFIG') ?: dirname(__DIR__) . '/bridge-config.php';
  if (!is_file($path)) throw new RuntimeException('Configuration missing');
  $c = require $path;
  if (!is_array($c) || strlen($c['app_secret'] ?? '') < 32 || str_starts_with($c['app_secret'] ?? '', 'REPLACE_')) throw new RuntimeException('Configuration incomplete');
 }
 return $c;
}
function clock_ms(): int { return (int)floor(microtime(true) * 1000); }
function db(): PDO {
 static $db;
 if (!$db) { $c=config(); $db=new PDO(sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',$c['host'],$c['port'],$c['database']),$c['username'],$c['password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]); }
 return $db;
}
function q(string $sql,array $args=[]): PDOStatement { $st=db()->prepare($sql);$st->execute($args);return $st; }
function rows(string $sql,array $args=[]): array {return q($sql,$args)->fetchAll();}
function one(string $sql,array $args=[]): array|false {return q($sql,$args)->fetch();}
function uid(): string {return bin2hex(random_bytes(16));}
function fail(string $message,int $status=422): never { http_response_code($status);echo json_encode(['error'=>$message],JSON_UNESCAPED_UNICODE);exit; }
function respond(array $data=[]): never { echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE);exit; }
function transaction(callable $callback): mixed {db()->beginTransaction();try{$r=$callback();db()->commit();return $r;}catch(Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}}
function field(array $data,string $key,int $max=5000,bool $required=false): string {
 $v=$data[$key]??'';if(!is_string($v))fail('Некорректное поле: '.$key);$v=trim($v);
 if(($required&&$v==='')||strlen($v)>$max*4)fail('Проверьте поле: '.$key);return $v;
}
function session_boot(): void {
 $storage=__DIR__.'/storage';if(!is_dir($storage)&&!mkdir($storage,0700,true))throw new RuntimeException('Session storage unavailable');
 session_save_path($storage);ini_set('session.use_strict_mode','1');ini_set('session.use_only_cookies','1');
 $local=(config()['environment']??'production')==='test';
 session_name('bridge_session');session_set_cookie_params(['lifetime'=>0,'path'=>'/','secure'=>!$local,'httponly'=>true,'samesite'=>'Lax']);session_start();
 if(isset($_SESSION['last_seen'])&&$_SESSION['last_seen']<time()-7200){$_SESSION=[];session_regenerate_id(true);}
 $_SESSION['last_seen']=time();$_SESSION['csrf']??=bin2hex(random_bytes(32));
}
function user(): array { $u=isset($_SESSION['user_id'])?one('SELECT id,email,name,role FROM bridge_users WHERE id=?',[$_SESSION['user_id']]):false;if(!$u)fail('Войдите в кабинет',401);return $u; }
function admin(): array {$u=user();if($u['role']!=='admin')fail('Доступ только организатору',403);return $u;}
function member(string $course,array $u): void {if($u['role']!=='admin'&&!one('SELECT user_id FROM bridge_memberships WHERE user_id=? AND course_id=?',[$u['id'],$course]))fail('Курс недоступен',403);}
function lesson(string $id,array $u): array {$l=one('SELECT l.*,c.end_at AS course_end FROM bridge_lessons l JOIN bridge_courses c ON c.id=l.course_id WHERE l.id=?',[$id]);if(!$l)fail('Занятие не найдено',404);member($l['course_id'],$u);return $l;}
function rate(string $key,int $max,int $seconds): void {
 $bucket=hash_hmac('sha256',$key,config()['app_secret']);
 $blocked=transaction(function()use($bucket,$max,$seconds){q('INSERT IGNORE INTO bridge_limits(bucket,hits,expires_at) VALUES(?,0,?)',[$bucket,time()+$seconds]);$r=one('SELECT * FROM bridge_limits WHERE bucket=? FOR UPDATE',[$bucket]);$hits=$r['expires_at']<time()?1:(int)$r['hits']+1;$expiry=$r['expires_at']<time()?time()+$seconds:$r['expires_at'];q('UPDATE bridge_limits SET hits=?,expires_at=? WHERE bucket=?',[$hits,$expiry,$bucket]);return $hits>$max;});
 if($blocked)fail('Слишком много попыток — попробуйте позже',429);
}
function add_notification(int|string $id,string $lesson,string $text): void {q('INSERT INTO bridge_notifications(user_id,lesson_id,body,created_at) VALUES(?,?,?,?)',[$id,$lesson,$text,clock_ms()]);}
function queue_telegram(string $body): void {q('INSERT INTO bridge_outbox(body,available_at) VALUES(?,?)',[$body,clock_ms()]);}
function send_code(string $email,string $code): void {
 $c=config();
 if(($c['environment']??'production')==='test'){
  if(empty($c['test_mailbox']))throw new RuntimeException('Test mailbox required');
  file_put_contents($c['test_mailbox'],json_encode(['email'=>$email,'code'=>$code])."\n",FILE_APPEND|LOCK_EX);return;
 }
 $from=$c['mail_from']??'';
 if(!filter_var($from,FILTER_VALIDATE_EMAIL)||preg_match('/[\r\n]/',$from))throw new RuntimeException('Mail sender not configured');
 $subject='=?UTF-8?B?'.base64_encode('БРИДЖ — код входа').'?=';
 $text="Ваш код входа: $code\n\nКод действует 10 минут и используется один раз\nЕсли вы не запрашивали вход, проигнорируйте письмо";
 if(!mail($email,$subject,$text,"From: $from\r\nContent-Type: text/plain; charset=UTF-8\r\nMIME-Version: 1.0"))throw new RuntimeException('Mail delivery unavailable');
}
function normalized_lesson(array $l): array {return ['id'=>$l['id'],'course'=>$l['course_id'],'title'=>$l['title'],'start'=>(int)$l['start_at'],'end'=>(int)$l['end_at'],'teacher'=>$l['teacher'],'address'=>$l['address'],'url'=>$l['url'],'description'=>$l['description'],'homework'=>$l['homework'],'image'=>$l['image'],'cancelled'=>(bool)$l['cancelled']];}
function awards(int|string $userId,array $courses,array $lessons,array $attendance,array $homework,array $feedback): array {
 $out=[];
 foreach($feedback as $f){if((string)$f['user_id']!==(string)$userId)continue;$r=one('SELECT creature FROM bridge_rewards WHERE user_id=? AND lesson_id=?',[$userId,$f['lesson_id']]);if($r)$out[]=['key'=>'review-'.$f['lesson_id'],'creature'=>(int)$r['creature'],'label'=>'За обратную связь'];}
 foreach($courses as $c){$run=0;$online=0;$offline=0;$max=0;$mon=0;$moff=0;$tasks=[];
  foreach($lessons as $l){if($l['course_id']!==$c['id']||$l['cancelled'])continue;if(trim($l['homework'])!=='')$tasks[]=$l['id'];if($l['end_at']>clock_ms())continue;$a=$attendance[$l['id']]??'';$run=$a?$run+1:0;$online=$a==='online'?$online+1:0;$offline=$a==='offline'?$offline+1:0;$max=max($max,$run);$mon=max($mon,$online);$moff=max($moff,$offline);}
  foreach([[$max>=5,'streak5',4,'5 встреч без пропусков'],[$max>=10,'streak10',3,'10 встреч без пропусков'],[$mon>=5,'online5',2,'5 встреч онлайн'],[$moff>=5,'offline5',1,'5 встреч очно']] as [$ok,$key,$creature,$label])if($ok)$out[]=['key'=>$c['id'].$key,'creature'=>$creature,'label'=>$label];
  if($tasks&&$c['end_at']<=clock_ms()&&count(array_filter($tasks,fn($id)=>!empty($homework[$id]['done'])))===count($tasks))$out[]=['key'=>$c['id'].'allhw','creature'=>0,'label'=>'Все задания курса'];
 }return $out;
}
