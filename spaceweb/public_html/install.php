<?php
declare(strict_types=1);
header('Content-Type: text/html; charset=utf-8');header('Cache-Control: no-store');header('X-Frame-Options: DENY');header('Referrer-Policy: no-referrer');
$message='';$ready=false;
try{
 require dirname(__DIR__).'/bridge-app/bootstrap.php';$c=config();
 if(($c['environment']??'production')!=='test'&&empty($_SERVER['HTTPS'])&&($_SERVER['HTTP_X_FORWARDED_PROTO']??'')!=='https')throw new RuntimeException('Open HTTPS');
 if(is_file(dirname(__DIR__).'/bridge-app/storage/installed.lock')){$message='Установка уже завершена — удалите install.php из публичной папки';}
 elseif($_SERVER['REQUEST_METHOD']==='POST'){
  if(strlen($c['setup_key']??'')<32||str_starts_with($c['setup_key']??'','REPLACE_')||!hash_equals($c['setup_key'],$_POST['key']??''))throw new RuntimeException('Setup key');
  if(!filter_var($c['admin_email']??'',FILTER_VALIDATE_EMAIL)||!filter_var($c['mail_from']??'',FILTER_VALIDATE_EMAIL)||!str_starts_with($c['base_url']??'','https://'))throw new RuntimeException('Settings incomplete');
  foreach(explode(';',file_get_contents(dirname(__DIR__).'/bridge-app/schema.sql'))as $sql)if(trim($sql)!=='')db()->exec($sql);
  $role=one('SELECT id,role FROM bridge_users WHERE email=?',[$c['admin_email']]);
  if($role&&$role['role']!=='admin')throw new RuntimeException('Admin address already assigned');
  q("INSERT IGNORE INTO bridge_users(email,name,role,created_at) VALUES(?,?,'admin',?)",[strtolower($c['admin_email']),'Организатор БРИДЖ',clock_ms()]);
  $dir=dirname(__DIR__).'/bridge-app/storage';if(!is_dir($dir)&&!mkdir($dir,0700,true))throw new RuntimeException('Storage');
  if(file_put_contents($dir.'/installed.lock',date('c'),LOCK_EX)===false)throw new RuntimeException('Install lock');
  $ready=true;$message='Таблицы созданы — удалите install.php и войдите на сайт по почте организатора';
 }
}catch(Throwable $e){http_response_code(400);$message='Установка не выполнена — проверьте приватный файл настроек, ключ установки и доступность базы';}
?>
<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Установка БРИДЖ</title><style>body{font:16px/1.6 system-ui;background:#f5f5f2;color:#303b39;max-width:600px;margin:50px auto;padding:20px}input{padding:12px;box-sizing:border-box;width:100%}button{margin-top:15px;padding:12px;background:#287c76;color:white;border:0;border-radius:6px}p{white-space:pre-wrap}</style><h1>Установка кабинета БРИДЖ</h1><p><?=htmlspecialchars($message,ENT_QUOTES,'UTF-8')?></p><?php if(!$ready&&$message===''): ?><p>Введите ключ установки из приватного bridge-config.php — не пароль базы</p><form method="post"><label>Ключ установки<input type="password" name="key" required minlength="32" autocomplete="off"></label><button>Создать таблицы и кабинет организатора</button></form><?php endif; ?></html>
