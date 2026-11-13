<?php
declare(strict_types=1);
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
$message='';$ready=false;$recovery='';
try {
 require dirname(__DIR__).'/bridge-app/bootstrap.php';
 require dirname(__DIR__).'/bridge-app/auth.php';
 $c=config();
 if(($c['environment']??'production')!=='test'&&empty($_SERVER['HTTPS'])&&($_SERVER['HTTP_X_FORWARDED_PROTO']??'')!=='https')throw new RuntimeException('Open HTTPS');
 $lockPath=dirname(__DIR__).'/bridge-app/storage/password-install.lock';
 if(is_file($lockPath)){$message='Установка уже завершена — удалите install.php из публичной папки';}
 elseif($_SERVER['REQUEST_METHOD']==='POST'){
  if(strlen($c['setup_key']??'')<32||str_starts_with($c['setup_key']??'','REPLACE_')||!hash_equals($c['setup_key'],$_POST['key']??''))throw new RuntimeException('Setup key');
  if(!str_starts_with($c['base_url']??'','https://'))throw new RuntimeException('Settings incomplete');
  $login=strtolower(trim($_POST['login']??''));$name=trim($_POST['name']??'');$password=$_POST['password']??'';
  if(!preg_match('/^[a-z0-9][a-z0-9._-]{2,31}$/D',$login)||$name===''||strlen($name)>400||!is_string($password)||strlen($password)>72||preg_match_all('/./us',$password)<12)throw new RuntimeException('Invalid credentials');
  foreach(explode(';',file_get_contents(dirname(__DIR__).'/bridge-app/schema.sql'))as $sql)if(trim($sql)!=='')db()->exec($sql);
  // Additive upgrade: old email records remain; no student data is deleted.
  db()->exec('ALTER TABLE bridge_users MODIFY email VARCHAR(190) NULL');
  $recovery=recovery_code();
  transaction(function()use($login,$name,$password,$recovery){
   $admins=rows("SELECT id FROM bridge_users WHERE role='admin' FOR UPDATE");
   if(count($admins)>1)throw new RuntimeException('Multiple legacy admins require migration');
   if($admins){$id=$admins[0]['id'];if(one('SELECT user_id FROM bridge_credentials WHERE user_id=?',[$id]))throw new RuntimeException('Already installed');}
   else{q("INSERT INTO bridge_users(email,name,role,created_at) VALUES(NULL,?,'admin',?)",[$name,clock_ms()]);$id=db()->lastInsertId();}
   q('INSERT INTO bridge_credentials(user_id,login,password_hash,recovery_hash) VALUES(?,?,?,?)',[$id,$login,password_hash($password,PASSWORD_DEFAULT),recovery_hash($recovery)]);
   q('UPDATE bridge_users SET name=? WHERE id=?',[$name,$id]);
  });
  $dir=dirname(__DIR__).'/bridge-app/storage';if(!is_dir($dir)&&!mkdir($dir,0700,true))throw new RuntimeException('Storage');
  if(file_put_contents($lockPath,date('c'),LOCK_EX)===false)throw new RuntimeException('Install lock');
  $ready=true;$message='Кабинет организатора создан — сохраните код восстановления, затем удалите install.php и войдите на сайт';
 }
}catch(Throwable $e){http_response_code(400);$recovery='';$message='Установка не выполнена — проверьте настройки, ключ, уникальность логина и пароль (от 12 символов, до 72 байт)';}
?>
<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Установка БРИДЖ</title><style>body{font:16px/1.6 system-ui;background:#f5f5f2;color:#303b39;max-width:600px;margin:40px auto;padding:20px}input{padding:12px;box-sizing:border-box;width:100%;margin:8px 0 16px}button{padding:12px;background:#287c76;color:white;border:0;border-radius:6px}p{white-space:pre-wrap}code{display:block;overflow-wrap:anywhere;padding:15px;background:#e4eee6}</style><h1>Установка кабинета БРИДЖ</h1><p><?=htmlspecialchars($message,ENT_QUOTES,'UTF-8')?></p>
<?php if($ready): ?><h2>Ваш личный код восстановления</h2><code id="recovery-code"><?=htmlspecialchars($recovery,ENT_QUOTES,'UTF-8')?></code><p>Сохраните его в менеджере паролей — он показывается один раз и позволяет сменить пароль без почты</p><?php endif; ?>
<?php if(!$ready&&$message===''): ?><p>Ключ установки берётся из приватного bridge-config.php — это не пароль базы</p><form method="post"><label>Ключ установки<input type="password" name="key" required minlength="32" autocomplete="off"></label><label>Ваше имя<input name="name" required maxlength="100" autocomplete="name"></label><label>Логин организатора<input name="login" required pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,31}" maxlength="32" autocomplete="username"></label><label>Пароль — от 12 символов<input type="password" name="password" required minlength="12" autocomplete="new-password"></label><button>Создать таблицы и кабинет организатора</button></form><?php endif; ?></html>
