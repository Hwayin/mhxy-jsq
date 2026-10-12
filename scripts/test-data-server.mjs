import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { saveRoleFile } from './role-file-store.mjs'

const defaultOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5178', 'http://127.0.0.1:5178']
export function createTestDataServer({ directory = fileURLToPath(new URL('../test-data/roles/', import.meta.url)), origins = defaultOrigins } = {}) {
  // 同一服务内串行落盘，连续点击或多个标签页导出不会交错写入。
  let writes = Promise.resolve()
  return createServer(async (req, res) => {
    const origin = req.headers.origin
    if (origin && !origins.includes(origin)) { res.writeHead(403); res.end(); return }
    if (req.headers.host && !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host)) { res.writeHead(403); res.end(); return }
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin') }
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    const reply = (code, data) => { res.writeHead(code); res.end(JSON.stringify(data)) }
    if (req.url === '/health' && req.method === 'GET') { reply(200, { service: 'mhxy-test-data', ready: true }); return }
    if (req.url !== '/api/test-data/role') { reply(404, { message: '接口不存在' }); return }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      reply(204, null); return
    }
    if (req.method !== 'POST') { reply(405, { message: '仅支持 POST' }); return }
    if (!(req.headers['content-type'] || '').startsWith('application/json')) { reply(415, { message: '请发送 JSON' }); return }
    try {
      const chunks = []; let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > 10000000) { reply(413, { message: '备份超过大小限制' }); return }
        chunks.push(chunk)
      }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      const job = writes.then(() => saveRoleFile(directory, input.roleId, input.backup))
      writes = job.catch(() => {})
      const result = await job
      reply(200, { ...result, relativePath: 'test-data/roles/' + result.fileName })
    } catch (error) { reply(400, { message: error.message }) }
  })
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createTestDataServer()
  server.on('error', error => { console.error(error.message); process.exitCode = 1 })
  server.listen(5179, '127.0.0.1', () => console.log('测试 JSON 导出服务：http://127.0.0.1:5179\n保存目录：test-data/roles/<角色ID>.json'))
}
