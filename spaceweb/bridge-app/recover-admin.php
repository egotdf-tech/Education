<?php
// Offline emergency recovery: only via host SSH/CLI, never a public URL.
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/bootstrap.php';
require __DIR__.'/auth.php';
fwrite(STDOUT,"Логин организатора: ");$login=strtolower(trim((string)fgets(STDIN)));
$u=one("SELECT c.user_id FROM bridge_credentials c JOIN bridge_users u ON u.id=c.user_id WHERE c.login=? AND u.role='admin'",[$login]);
if(!$u){fwrite(STDERR,"Организатор не найден\n");exit(1);}
$code=recovery_code();
q('UPDATE bridge_credentials SET reset_hash=?,reset_expires_at=? WHERE user_id=?',[recovery_hash($code),clock_ms()+900000,$u['user_id']]);
fwrite(STDOUT,"Одноразовый код на 15 минут — передайте владельцу по защищённому каналу:\n".$code."\n");
