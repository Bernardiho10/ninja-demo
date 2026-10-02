// Starts the full local stack in one terminal:
//   1. a reference backend from backends/ on :8080 (default: node)
//   2. `ham proxy` on :8082 — serves public/ and forwards /api/* to :8080
//
// Usage:
//   npm run dev                 # node backend
//   npm run dev -- python       # or: go | rust | php
//   API_PORT=8090 npm run dev   # if :8080 is taken by something else
//
// Ctrl+C stops both processes.
import { spawn, spawnSync } from 'node:child_process'
import net from 'node:net'

const API_PORT = process.env.API_PORT || '8080'

const backends = {
  node: ['node', ['backends/node/server.mjs']],
  python: [process.platform === 'win32' ? 'py' : 'python3', ['backends/python/server.py']],
  go: ['go', ['run', 'backends/go/main.go']],
  rust: ['cargo', ['run', '--quiet', '--manifest-path', 'backends/rust/Cargo.toml']],
  // Fresh Windows PHP installs have no php.ini, so curl/openssl are off; enable them per run.
  php: ['php', [
    ...(process.platform === 'win32' ? ['-d', 'extension_dir=ext', '-d', 'extension=curl', '-d', 'extension=openssl'] : []),
    '-S', `0.0.0.0:${API_PORT}`, 'backends/php/server.php',
  ]],
}

const choice = process.argv[2] || 'node'
if (!backends[choice]) {
  console.error(`Unknown backend "${choice}". Pick one of: ${Object.keys(backends).join(', ')}`)
  process.exit(1)
}

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer().once('error', () => resolve(false))
    srv.listen(Number(port), () => srv.close(() => resolve(true)))
  })
}

for (const port of [API_PORT, '8082']) {
  if (!(await portFree(port))) {
    console.error(`Port ${port} is already in use. Stop whatever is using it` +
      (port === API_PORT ? `, or pick another backend port, e.g. API_PORT=8090 npm run dev` : '') + '.')
    process.exit(1)
  }
}

const env = { ...process.env, API_PORT, API_ENDPOINT: `http://localhost:${API_PORT}` }
const children = []
function run(label, cmd, args) {
  const child = spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
  child.on('error', (err) => {
    console.error(`[${label}] could not start "${cmd}": ${err.message}. Is it installed and on your PATH?`)
    shutdown(1)
  })
  const prefix = (chunk) =>
    chunk
      .toString()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => `[${label}] ${line}`)
      .join('\n') + '\n'
  child.stdout.on('data', (c) => process.stdout.write(prefix(c)))
  child.stderr.on('data', (c) => process.stderr.write(prefix(c)))
  child.on('exit', (code) => {
    console.log(`[${label}] exited with code ${code}`)
    shutdown(code ?? 0)
  })
  children.push(child)
}

let stopping = false
function shutdown(code) {
  if (stopping) return
  stopping = true
  for (const c of children) {
    if (c.exitCode !== null) continue
    // /T also stops grandchildren, e.g. the compiled binary that `go run` / `cargo run` starts.
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' })
    else c.kill()
  }
  process.exit(code)
}
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

const [cmd, args] = backends[choice]
run(`api:${choice}`, cmd, args)
run('ham', 'ham', ['proxy'])
console.log(`\n  Open http://localhost:8082  (${choice} backend on :${API_PORT}, ham proxy on :8082)\n`)
