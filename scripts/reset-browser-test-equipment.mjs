// 用户明确选择清理旧装备测试记录后运行；仅移除旧样本中这一个角色的装备 ID。
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ledger } from './load-ledger.mjs'
import { saveRoleFile } from './role-file-store.mjs'
const roleId = 'muz8mwy5-hilnb0a9'
const target = 'http://localhost:5173/#/pages/role/index?id=' + roleId
const fixture = JSON.parse(await readFile(new URL('../tests/fixtures/legacy-v1.json', import.meta.url), 'utf8')).data
const oldIds = new Set(fixture.assets.filter(a => a.roleId === roleId && a.category === 'equipment').map(a => a.id))
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser = await chromium.connectOverCDP('http://127.0.0.1:9777')
const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url() === target)
if (!page) throw new Error('没有找到指定龙宫角色页面，未清理数据')
const raw = await page.evaluate(() => uni.getStorageSync('mhxy-ledger-v1'))
const current = ledger.validateLedger(JSON.parse(raw))
if (!current.roles.some(r => r.id === roleId && r.name === '龙宫')) throw new Error('目标角色不匹配，未清理数据')
const removed = current.assets.filter(a => a.roleId === roleId && a.category === 'equipment' && oldIds.has(a.id))
console.log(JSON.stringify({ roleId, removeCount: removed.length, names: removed.map(a => a.name) }))
if (!process.argv.includes('--apply') || !removed.length) process.exit(0)
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const history = new URL('../test-data/history/', import.meta.url)
await mkdir(history, { recursive: true })
const snapshot = new URL(roleId + '-' + stamp + '-browser-before-clear.json', history)
await writeFile(snapshot, ledger.exportBackup(current), { flag: 'wx' })
const filePath = new URL('../test-data/roles/' + roleId + '.json', import.meta.url)
try {
  const oldFile = await readFile(filePath, 'utf8')
  await writeFile(new URL(roleId + '-' + stamp + '-file-before-clear.json', history), oldFile, { flag: 'wx' })
} catch (e) { if (e.code !== 'ENOENT') throw e }
const next = ledger.clone(current)
next.assets = next.assets.filter(a => !(a.roleId === roleId && a.category === 'equipment' && oldIds.has(a.id)))
ledger.validateLedger(next)
const nextRaw = JSON.stringify(next)
await page.evaluate(({ before, after }) => {
  if (uni.getStorageSync('mhxy-ledger-v1') !== before) throw new Error('账本刚被修改，请重新核对后清理')
  uni.setStorageSync('mhxy-ledger-previous-v1', before)
  uni.setStorageSync('mhxy-ledger-v1', after)
  if (uni.getStorageSync('mhxy-ledger-v1') !== after) throw new Error('清理写入未成功')
}, { before: raw, after: nextRaw })
await saveRoleFile(fileURLToPath(new URL('../test-data/roles/', import.meta.url)), roleId, ledger.exportRoleBackup(next, roleId))
await page.reload({ waitUntil: 'networkidle' })
const result = JSON.parse(await page.evaluate(() => uni.getStorageSync('mhxy-ledger-v1')))
if (JSON.stringify(result) !== nextRaw) throw new Error('清理后数据发生变化，请核对')
console.log(JSON.stringify({ removed: removed.length, remaining: result.assets.filter(a => a.roleId === roleId).length, total: ledger.roleSummary(result, roleId).total, snapshot: fileURLToPath(snapshot), file: fileURLToPath(filePath) }))
process.exit(0) // 仅断开 CDP，不关闭用户浏览器。
