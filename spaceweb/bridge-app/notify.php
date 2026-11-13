<?php
// Run only from the host's scheduled tasks, e.g. every five minutes.
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/bootstrap.php';
$c=config();
if(empty($c['telegram_token'])||empty($c['telegram_chat_id'])){fwrite(STDERR,"Telegram settings missing\n");exit(1);}
$lock=fopen(__DIR__.'/storage/notify.lock','c');if(!$lock||!flock($lock,LOCK_EX|LOCK_NB))exit;
foreach(rows('SELECT id,body,attempts FROM bridge_outbox WHERE sent_at IS NULL AND available_at<=? ORDER BY id LIMIT 20',[clock_ms()])as $job){
 try{
  $content=json_encode(['chat_id'=>$c['telegram_chat_id'],'text'=>$job['body'],'disable_web_page_preview'=>true],JSON_THROW_ON_ERROR);
  $context=stream_context_create(['http'=>['method'=>'POST','header'=>"Content-Type: application/json\r\n",'content'=>$content,'timeout'=>10,'ignore_errors'=>true],'ssl'=>['verify_peer'=>true,'verify_peer_name'=>true]]);
  $result=@file_get_contents('https://api.telegram.org/bot'.$c['telegram_token'].'/sendMessage',false,$context);
  $ok=$result!==false&&((json_decode($result,true)['ok']??false)===true);
  if(!$ok)throw new RuntimeException('Delivery failed');
  q('UPDATE bridge_outbox SET sent_at=?,attempts=attempts+1 WHERE id=?',[clock_ms(),$job['id']]);
 }catch(Throwable $e){q('UPDATE bridge_outbox SET attempts=attempts+1,available_at=? WHERE id=?',[clock_ms()+min(3600000,300000*(1+$job['attempts'])),$job['id']]);}
}
// Retain operational records for a bounded period, never message text in logs.
q('DELETE FROM bridge_outbox WHERE sent_at IS NOT NULL AND sent_at<?',[clock_ms()-30*86400000]);
q('DELETE FROM bridge_otp WHERE expires_at<?',[clock_ms()-86400000]);
q('DELETE FROM bridge_limits WHERE expires_at<?',[time()-86400]);
