<?php
declare(strict_types=1);
class BridgeTelegramError extends RuntimeException {}

function telegram_settings(): array {
    $c=config();$token=trim($c['telegram_token']??'');$chat=trim((string)($c['telegram_chat_id']??''));$username='';
    $path=__DIR__.'/storage/telegram-binding.json';
    if(is_file($path)){
        $binding=json_decode(file_get_contents($path),true);
        if(is_array($binding)&&hash_equals($binding['token_fingerprint']??'',hash('sha256',$token))){$chat=(string)($binding['chat_id']??'');$username=(string)($binding['username']??'');}
    }
    if(!preg_match('/^-?[0-9]+$/D',$chat))$chat='';
    return ['token'=>$token,'chat_id'=>$chat,'username'=>$username];
}
function telegram_call(string $method,array $params=[]): array {
    if(!in_array($method,['getMe','getWebhookInfo','getUpdates','sendMessage'],true))throw new BridgeTelegramError('Unsupported Telegram method');
    $settings=telegram_settings();if($settings['token']==='')throw new BridgeTelegramError('Сначала сохраните токен бота в приватном файле настроек');
    $c=config();$base='https://api.telegram.org/bot';
    if(($c['environment']??'production')==='test'&&!empty($c['telegram_test_endpoint']))$base=rtrim($c['telegram_test_endpoint'],'/').'/bot';
    $context=stream_context_create(['http'=>['method'=>'POST','header'=>"Content-Type: application/json\r\n",'content'=>json_encode($params,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),'timeout'=>10,'ignore_errors'=>true],'ssl'=>['verify_peer'=>true,'verify_peer_name'=>true]]);
    // Suppress stream warnings: the URL contains the bot token and must never enter logs.
    $raw=@file_get_contents($base.$settings['token'].'/'.$method,false,$context);
    if($raw===false)throw new BridgeTelegramError('Telegram пока недоступен с хостинга — повторите позже');
    $data=json_decode($raw,true);
    if(!is_array($data)||($data['ok']??false)!==true){
        $code=(int)($data['error_code']??0);
        throw new BridgeTelegramError(match($code){401=>'Telegram не принял токен — проверьте его в приватном файле',403=>'Бот не может написать вам — откройте его и нажмите Start',409=>'У этого бота уже настроен другой способ получения сообщений — используйте отдельного бота',default=>'Telegram не выполнил запрос — повторите позже'});
    }
    return $data['result']??[];
}
function save_telegram_binding(string $chat,string $username): void {
    $s=telegram_settings();$dir=__DIR__.'/storage';if(!is_dir($dir)&&!mkdir($dir,0700,true))throw new BridgeTelegramError('Не удалось сохранить привязку');
    $tmp=tempnam($dir,'telegram-');if($tmp===false)throw new BridgeTelegramError('Не удалось сохранить привязку');
    try{
        chmod($tmp,0600);
        $data=json_encode(['chat_id'=>$chat,'username'=>$username,'token_fingerprint'=>hash('sha256',$s['token'])],JSON_THROW_ON_ERROR);
        if(file_put_contents($tmp,$data,LOCK_EX)===false||!rename($tmp,$dir.'/telegram-binding.json'))throw new BridgeTelegramError('Не удалось сохранить привязку');
    }finally{if(is_file($tmp))unlink($tmp);}
}
function telegram_status(): array {
    $s=telegram_settings();return ['token_present'=>$s['token']!=='','connected'=>$s['token']!==''&&$s['chat_id']!=='','username'=>$s['username'],'pending'=>(int)q('SELECT COUNT(*) FROM bridge_outbox WHERE sent_at IS NULL')->fetchColumn(),'worker_path'=>__DIR__.'/notify.php'];
}
function telegram_action(string $action,array $input): bool {
    if(!in_array($action,['telegram_status','telegram_pair_start','telegram_pair_finish','telegram_test'],true))return false;
    $u=admin();
    if($action==='telegram_status')respond(telegram_status());
    rate('telegram-setup:'.$u['id'],20,900);
    try{
        if($action==='telegram_pair_start'){
            $password=$input['current_password']??'';$r=one('SELECT password_hash FROM bridge_credentials WHERE user_id=?',[$u['id']]);
            if(!is_string($password)||strlen($password)>72||!password_verify($password,$r['password_hash']))fail('Подтвердите пароль организатора');
            $me=telegram_call('getMe');if(empty($me['is_bot'])||!preg_match('/^[A-Za-z0-9_]{5,32}$/D',$me['username']??''))throw new BridgeTelegramError('Токен не относится к боту');
            $webhook=telegram_call('getWebhookInfo');if(!empty($webhook['url']))throw new BridgeTelegramError('Бот используется другим приложением — создайте отдельного бота для БРИДЖ');
            $code=bin2hex(random_bytes(24));$settings=telegram_settings();
            $_SESSION['telegram_pair']=['code'=>$code,'expires'=>time()+600,'created'=>time(),'fingerprint'=>hash('sha256',$settings['token']),'username'=>$me['username']];
            respond(['link'=>'https://t.me/'.$me['username'].'?start='.$code,'expires_at'=>(time()+600)*1000]);
        }
        if($action==='telegram_pair_finish'){
            $pair=$_SESSION['telegram_pair']??null;$settings=telegram_settings();
            if(!$pair||$pair['expires']<time()||!hash_equals($pair['fingerprint'],hash('sha256',$settings['token'])))fail('Ссылка подключения истекла — начните подключение заново');
            $updates=telegram_call('getUpdates',['timeout'=>0,'limit'=>100]);
            foreach($updates as $update){
                $m=$update['message']??[];$text=$m['text']??'';
                if(($m['chat']['type']??'')!=='private'||!is_string($text)||!hash_equals('/start '.$pair['code'],$text)||($m['date']??0)<$pair['created']-30)continue;
                $chat=(string)($m['chat']['id']??'');if(!preg_match('/^[0-9]+$/D',$chat))continue;
                save_telegram_binding($chat,$pair['username']);unset($_SESSION['telegram_pair']);
                // A dedicated bot only: acknowledge setup updates without exposing chat data.
                try{telegram_call('getUpdates',['offset'=>(int)$update['update_id']+1,'timeout'=>0]);}catch(Throwable $e){}
                respond(telegram_status());
            }
            fail('Откройте ссылку бота, нажмите Start и затем «Проверить подключение»');
        }
        $s=telegram_settings();if($s['chat_id']==='')fail('Сначала подключите личный чат');
        telegram_call('sendMessage',['chat_id'=>$s['chat_id'],'text'=>'БРИДЖ — тестовое уведомление. Подключение работает' . "\n" . config()['base_url'],'disable_web_page_preview'=>true]);
        respond(['ok'=>true]);
    }catch(BridgeTelegramError $error){fail($error->getMessage(),503);}
}
