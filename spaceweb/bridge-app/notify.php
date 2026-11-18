<?php
// CLI worker, scheduled on the hosting account; never run through a public URL.
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
if(PHP_VERSION_ID<80400){fwrite(STDERR,"Use PHP 8.4 or newer for this task\n");exit(1);}
require __DIR__.'/bootstrap.php';require __DIR__.'/telegram.php';
$settings=telegram_settings();
if($settings['token']===''||$settings['chat_id']===''){fwrite(STDERR,"Telegram is not configured\n");exit(1);}
$dir=__DIR__.'/storage';if(!is_dir($dir)&&!mkdir($dir,0700,true))exit(1);
$lock=fopen($dir.'/notify.lock','c');if(!$lock||!flock($lock,LOCK_EX|LOCK_NB))exit;
foreach(rows('SELECT id,body,attempts FROM bridge_outbox WHERE sent_at IS NULL AND available_at<=? ORDER BY id LIMIT 20',[clock_ms()])as $job){
    try{
        telegram_call('sendMessage',['chat_id'=>$settings['chat_id'],'text'=>$job['body'],'disable_web_page_preview'=>true]);
        q('UPDATE bridge_outbox SET sent_at=?,attempts=attempts+1 WHERE id=?',[clock_ms(),$job['id']]);
    }catch(Throwable $e){q('UPDATE bridge_outbox SET attempts=attempts+1,available_at=? WHERE id=?',[clock_ms()+min(3600000,300000*(1+$job['attempts'])),$job['id']]);}
}
q('DELETE FROM bridge_outbox WHERE sent_at IS NOT NULL AND sent_at<?',[clock_ms()-30*86400000]);
q('DELETE FROM bridge_limits WHERE expires_at<?',[time()-86400]);
