<?php
declare(strict_types=1);

function login_name(array $input): string {
    $login = strtolower(field($input, 'login', 32, true));
    if (!preg_match('/^[a-z0-9][a-z0-9._-]{2,31}$/D', $login)) {
        fail('Логин: 3–32 символа, латинские буквы, цифры, точка, дефис или подчёркивание');
    }
    return $login;
}

function new_password(array $input, string $field = 'password'): string {
    $value = $input[$field] ?? null;
    if (!is_string($value) || strlen($value) > 72 || preg_match_all('/./us', $value) < 12) {
        fail('Пароль: минимум 12 символов, максимум 72 байта — пробелы тоже считаются');
    }
    return $value;
}

function recovery_code(): string {
    return implode('-', str_split(bin2hex(random_bytes(32)), 8));
}

function recovery_hash(string $value): string {
    $normalized = strtolower(preg_replace('/[\s-]+/', '', $value));
    return hash_hmac('sha256', 'recovery:' . $normalized, config()['app_secret']);
}

function establish_session(array $credentials): void {
    session_regenerate_id(true);
    $_SESSION['user_id'] = $credentials['user_id'];
    $_SESSION['auth_version'] = (int)$credentials['auth_version'];
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}

function auth_action(string $action, array $input): bool {
    if (!in_array($action, ['register', 'login', 'recover'], true)) return false;
    $login = login_name($input);
    rate('auth:ip:' . ($_SERVER['REMOTE_ADDR'] ?? ''), 120, 900);
    rate('auth:login:' . $login, 15, 900);

    if ($action === 'register') {
        rate('register:ip:' . ($_SERVER['REMOTE_ADDR'] ?? ''), 30, 3600);
        $name = field($input, 'name', 100, true);
        $password = new_password($input);
        $passwordHash = password_hash($password, PASSWORD_DEFAULT);
        $code = recovery_code();
        try {
        $created = transaction(function () use ($login, $name, $passwordHash, $code) {
            if (one('SELECT user_id FROM bridge_credentials WHERE login=?', [$login])) return false;
            q("INSERT INTO bridge_users(email,name,role,created_at) VALUES(NULL,?,'student',?)", [$name, clock_ms()]);
            $id = db()->lastInsertId();
            q('INSERT INTO bridge_credentials(user_id,login,password_hash,recovery_hash) VALUES(?,?,?,?)',
                [$id, $login, $passwordHash, recovery_hash($code)]);
            return one('SELECT user_id,auth_version FROM bridge_credentials WHERE user_id=?', [$id]);
        });
        } catch (PDOException $error) {
            if ($error->getCode() === '23000') fail('Этот логин недоступен — выберите другой', 409);
            throw $error;
        }
        if (!$created) fail('Этот логин недоступен — выберите другой');
        establish_session($created);
        respond(['user' => user(), 'csrf' => $_SESSION['csrf'], 'recovery_code' => $code]);
    }

    if ($action === 'login') {
        $password = $input['password'] ?? '';
        if (!is_string($password) || strlen($password) > 72) fail('Неверный логин или пароль', 401);
        $credentials = one('SELECT * FROM bridge_credentials WHERE login=?', [$login]);
        // Same hashing cost for unknown logins; this public dummy hash grants no access.
        $dummy = '$2y$12$I2cnydHrFRrG0kBUNkBQquqp8xBO3mZkFpeLADj3mGU9EmfMJwjLG';
        if (!password_verify($password, $credentials['password_hash'] ?? $dummy) || !$credentials) {
            fail('Неверный логин или пароль', 401);
        }
        if (password_needs_rehash($credentials['password_hash'], PASSWORD_DEFAULT)) {
            // Keep this conditional to avoid reverting a concurrent password reset.
            q('UPDATE bridge_credentials SET password_hash=? WHERE user_id=? AND password_hash=?',
                [password_hash($password, PASSWORD_DEFAULT), $credentials['user_id'], $credentials['password_hash']]);
        }
        establish_session($credentials);
        respond(['user' => user(), 'csrf' => $_SESSION['csrf']]);
    }

    $password = new_password($input);
    $code = field($input, 'recovery_code', 120, true);
    $newCode = recovery_code();
    $passwordHash = password_hash($password, PASSWORD_DEFAULT);
    $recovered = transaction(function () use ($login, $passwordHash, $code, $newCode) {
        $r = one('SELECT * FROM bridge_credentials WHERE login=? FOR UPDATE', [$login]);
        if (!$r) return false;
        $hash = recovery_hash($code);
        $permanent = hash_equals($r['recovery_hash'], $hash);
        $temporary = $r['reset_hash'] !== null && (int)$r['reset_expires_at'] > clock_ms()
            && hash_equals($r['reset_hash'], $hash);
        if (!$permanent && !$temporary) return false;
        q('UPDATE bridge_credentials SET password_hash=?,recovery_hash=?,reset_hash=NULL,reset_expires_at=NULL,auth_version=auth_version+1 WHERE user_id=?',
            [$passwordHash, recovery_hash($newCode), $r['user_id']]);
        return true;
    });
    if (!$recovered) fail('Неверный логин или код восстановления');
    // All prior sessions are invalidated by auth_version, including this browser.
    $_SESSION = ['csrf' => bin2hex(random_bytes(32)), 'last_seen' => time()];
    session_regenerate_id(true);
    respond(['ok' => true, 'csrf' => $_SESSION['csrf'], 'recovery_code' => $newCode]);
}
