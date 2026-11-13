<?php
// This example contains no real credentials. Keep the actual file OUTSIDE public_html.
return [
    'host' => '127.0.0.1',
    'port' => 3308,
    'database' => 'YOUR_DATABASE',
    'username' => 'YOUR_DATABASE_USER',
    'password' => 'YOUR_DATABASE_PASSWORD',
    'base_url' => 'https://study.brigecorp.ru',
    // Generate locally: php -r "echo bin2hex(random_bytes(32));"
    'app_secret' => 'REPLACE_WITH_RANDOM_SECRET_AT_LEAST_32_CHARACTERS',
    'setup_key' => 'REPLACE_WITH_ANOTHER_RANDOM_SECRET_AT_LEAST_32_CHARACTERS',
    'telegram_token' => '',
    'telegram_chat_id' => '',
];
