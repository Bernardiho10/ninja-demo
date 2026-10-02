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
 *   GET  /webhook-events?verification_id=vs_...
 *                                -> reads the webhook.site inbox (NINJA_WEBHOOK_URL) and returns
 *                                   the verification.completed deliveries for that verification
 *
 * Run (PHP's built-in server, routed through this file):
 *   php -S 0.0.0.0:8080 backends/php/server.php
 * Then, in another terminal, from the repo root:
 *   ham proxy
 * Open http://localhost:8082
 *
 * Needs the curl and openssl extensions. A fresh Windows PHP install has no
 * php.ini, so they're off; enable them per run without touching php.ini:
 *   php -d extension_dir=ext -d extension=curl -d extension=openssl -S 0.0.0.0:8080 backends/php/server.php
 * (`npm run dev -- php` does this for you.)
 *
 * Config (reads repo-root .env, or real environment variables):
 *   NINJA_API_BASE              default https://api.sandbox.ninja.boucloud.io
 *   NINJA_SANDBOX_SECRET_KEY    required -- your sk_sandbox_... key
 *   NINJA_WEBHOOK_URL           where Ninja delivers webhooks; set on every flow this backend creates
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

// Warnings/deprecations must never be printed into a JSON response body.
ini_set('display_errors', 'stderr');

if (!extension_loaded('curl')) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'PHP curl extension is not loaded. Run with: php -d extension_dir=ext -d extension=curl -d extension=openssl -S ...']);
    return;
}

load_env();

$ninjaApiBase = getenv('NINJA_API_BASE') ?: 'https://api.sandbox.ninja.boucloud.io';
$secretKey = getenv('NINJA_SANDBOX_SECRET_KEY') ?: null;
$webhookUrl = getenv('NINJA_WEBHOOK_URL') ?: '';

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
        // Trust the OS certificate store. Windows PHP ships without a CA bundle,
        // so without this every HTTPS call fails with "unable to get local issuer certificate".
        CURLOPT_SSL_OPTIONS => CURLSSLOPT_NATIVE_CA,
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
        return;
    }

    // No curl_close(): it has been a no-op since PHP 8.0 and is deprecated in 8.5.
    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);

    http_response_code($status);
    header('Content-Type: application/json');
    echo $responseBody;
}

// Same as the Node/Python backends: a missing or malformed JSON body becomes {}.
function read_json_body(bool $setWebhookUrl = false): string {
    global $webhookUrl;
    $decoded = json_decode(file_get_contents('php://input'), true);
    if (!is_array($decoded)) {
        $decoded = [];
    }
    if ($setWebhookUrl && $webhookUrl !== '') {
        $decoded['webhook_url'] = $webhookUrl;
    }
    return $decoded === [] ? '{}' : json_encode($decoded, JSON_UNESCAPED_SLASHES);
}

function send_json(int $status, array $body): void {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($body, JSON_UNESCAPED_SLASHES);
}

/**
 * Ninja delivers webhooks to a public URL, which a localhost backend can't be.
 * For the demo that URL is a webhook.site inbox, and webhook.site has a read
 * API, so we fetch the deliveries from there and hand them to the browser.
 */
function webhook_events(string $verificationId): void {
    global $webhookUrl;
    if (!preg_match('#^https://webhook\.site/([0-9a-fA-F-]{36})#', $webhookUrl, $m)) {
        send_json(200, ['source' => 'unsupported', 'inbox_url' => $webhookUrl ?: null, 'events' => []]);
        return;
    }
    $token = $m[1];

    $ch = curl_init("https://webhook.site/token/$token/requests?sorting=newest&per_page=50");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_OPTIONS => CURLSSLOPT_NATIVE_CA,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ]);
    $raw = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $inbox = is_string($raw) ? json_decode($raw, true) : null;
    if ($status !== 200 || !is_array($inbox)) {
        send_json(502, ['error' => 'could not read webhook.site inbox', 'detail' => $raw === false ? curl_error($ch) : "webhook.site responded $status"]);
        return;
    }

    $header = fn(array $r, string $name) => $r['headers'][$name][0] ?? null;
    $events = [];
    foreach ($inbox['data'] ?? [] as $r) {
        if (($r['method'] ?? '') !== 'POST') {
            continue;
        }
        $payload = json_decode($r['content'] ?? '', true);
        if (!is_array($payload)) {
            continue;
        }
        if ($verificationId !== '' && ($payload['data']['verification_id'] ?? null) !== $verificationId) {
            continue;
        }
        $events[] = [
            'delivery_id' => $header($r, 'x-ninja-delivery'),
            'event' => $header($r, 'x-ninja-event') ?? ($payload['event'] ?? null),
            'signature' => $header($r, 'x-ninja-signature'),
            'received_at' => $r['created_at'] ?? null,
            'payload' => $payload,
        ];
    }
    send_json(200, ['source' => 'webhook.site', 'inbox_url' => "https://webhook.site/#!/view/$token", 'events' => $events]);
}

function not_found(string $method, string $path): void {
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode(['error' => "no such route: $method $path"]);
}

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if ($method === 'POST' && $path === '/flows') {
    proxy_to_ninja('POST', '/api/flows', read_json_body(true));
} elseif ($method === 'POST' && preg_match('#^/flows/([^/]+)/links$#', $path, $m)) {
    $flowId = rawurldecode($m[1]);
    proxy_to_ninja('POST', '/api/flows/' . rawurlencode($flowId) . '/links', read_json_body());
} elseif ($method === 'GET' && preg_match('#^/verifications/([^/]+)$#', $path, $m)) {
    $verificationId = rawurldecode($m[1]);
    proxy_to_ninja('GET', '/api/verifications/' . rawurlencode($verificationId));
} elseif ($method === 'GET' && $path === '/webhook-events') {
    webhook_events((string)($_GET['verification_id'] ?? ''));
} else {
    not_found($method, $path);
}
