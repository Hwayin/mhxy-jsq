// 本地查看 HBuilderX 构建的 Web 产物，仅监听回环地址。
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../unpackage/dist/build/web/', import.meta.url))
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' }
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    const target = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname))
    if (!target.startsWith(resolve(root) + sep)) { res.writeHead(403); res.end(); return }
    const content = await readFile(target)
    res.writeHead(200, { 'Content-Type': mime[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
    res.end(content)
  } catch { res.writeHead(404); res.end('Not found') }
}).listen(5178, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:5178'))
