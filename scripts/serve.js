import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const publicDir = path.resolve(rootDir, 'public')

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json'
}

const PORT = parseInt(process.env.PORT || '5671', 10)

const server = http.createServer((req, res) => {
  let parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  let pathname = decodeURIComponent(parsedUrl.pathname)

  // Map root to index.html
  if (pathname === '/' || pathname === '') {
    pathname = '/index.html'
  }

  let filePath = path.join(publicDir, pathname)

  // Security: prevent directory traversal
  if (!filePath.startsWith(publicDir)) {
    res.statusCode = 403
    res.end('Forbidden')
    return
  }

  // If path is a directory, look for index.html inside
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html')
  }

  // If file doesn't exist, try appending .html (cleanUrls support)
  if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) {
    filePath = filePath + '.html'
  }

  if (!fs.existsSync(filePath)) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(`<h1>404 Not Found</h1><p>${pathname}</p>`)
    return
  }

  const ext = path.extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[ext] || 'application/octet-stream'

  res.statusCode = 200
  res.setHeader('Content-Type', contentType)
  res.setHeader('Cache-Control', 'no-cache')
  fs.createReadStream(filePath).pipe(res)
})

server.listen(PORT, () => {
  console.log(`\n🚀 Ninja Demo server running at:`)
  console.log(`   ➜ Local:   http://localhost:${PORT}`)
  console.log(`   ➜ Network: http://127.0.0.1:${PORT}\n`)
})
