<?php
/**
 * Reference backend: PHP (built-in dev server + curl extension, no Composer
 * dependencies).
 *
 * Implements the 3 endpoints the frontend needs for the real Ninja Flows
 * integration. Holds NINJA_SANDBOX_SECRET_KEY server-side -- it is never
 * sent to the browser. Routes have no /api/ prefix because `ham proxy`
 * strips API_PROXY_PREFIX ("/api/") before forwarding to this backend.
 *
 *   POST /flows                  -> POST   {NINJA_API_BASE}/api/flows
 *   POST /flows/:flowId/links    -> POST   {NINJA_API_BASE}/api/flows/:flowId/links
 *   GET  /verifications/:id      -> GET    {NINJA_API_BASE}/api/verifications/:id
 *
 * Run (PHP's built-in server, routed through this file):
 *   php -S 0.0.0.0:8080 backends/php/server.php
 * Then, in another terminal, from the repo root:
 *   ham proxy
 * Open http://localhost:8082
 *
 * Config (reads repo-root .env, or real environment variables):
 *   NINJA_API_BASE              default https://api.sandbox.ninja.boucloud.io
 *   NINJA_SANDBOX_SECRET_KEY    required -- your sk_sandbox_... key
 */

function load_env(): void {
    $envPath = __DIR__ . '/../../.env';
    if (!file_exists($envPath)) {
        return;
    }
    foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (preg_match('/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/', $line, $m)) {
            if (getenv($m[1]) === false) {
                putenv($m[1] . '=' . trim($m[2]));
            }
        }
    }
}

load_env();

$ninjaApiBase = getenv('NINJA_API_BASE') ?: 'https://api.sandbox.ninja.boucloud.io';
$secretKey = getenv('NINJA_SANDBOX_SECRET_KEY') ?: null;

/**
 * Forwards a request to the real Ninja sandbox API with the secret key
 * attached, then relays its exact status and body back as-is.
 */
function proxy_to_ninja(string $method, string $upstreamPath, ?string $body = null): void {
    global $ninjaApiBase, $secretKey;

    if (!$secretKey) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'NINJA_SANDBOX_SECRET_KEY is not set']);
        return;
    }

    $ch = curl_init($ninjaApiBase . $upstreamPath);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $secretKey,
            'Content-Type: application/json',
        ],
    ]);
    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body ?? '{}');
    }

    $responseBody = curl_exec($ch);
    if ($responseBody === false) {
        http_response_code(502);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'upstream request to Ninja sandbox failed', 'detail' => curl_error($ch)]);
        curl_close($ch);
        return;
    }

    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    http_response_code($status);
    header('Content-Type: application/json');
    echo $responseBody;
}

function not_found(string $method, string $path): void {
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode(['error' => "no such route: $method $path"]);
}

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if ($method === 'POST' && $path === '/flows') {
    proxy_to_ninja('POST', '/api/flows', file_get_contents('php://input'));
} elseif ($method === 'POST' && preg_match('#^/flows/([^/]+)/links$#', $path, $m)) {
    $flowId = rawurldecode($m[1]);
    proxy_to_ninja('POST', '/api/flows/' . rawurlencode($flowId) . '/links', file_get_contents('php://input'));
} elseif ($method === 'GET' && preg_match('#^/verifications/([^/]+)$#', $path, $m)) {
    $verificationId = rawurldecode($m[1]);
    proxy_to_ninja('GET', '/api/verifications/' . rawurlencode($verificationId));
} else {
    not_found($method, $path);
}
