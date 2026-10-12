import { pathToFileURL, fileURLToPath } from 'node:url'
import { ledger } from './load-ledger.mjs'
import { saveRoleFile } from './role-file-store.mjs'
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://127.0.0.1:9777')
const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url() === process.env.LEDGER_PAGE_URL)
if (!page) throw new Error('未找到指定账本页')
const raw = await page.evaluate(() => uni.getStorageSync('mhxy-ledger-v1'))
const data = ledger.validateLedger(JSON.parse(raw))
const id = new URL(page.url()).hash.match(/[?&]id=([^&]+)/)?.[1]
if (!id) throw new Error('页面缺少角色 ID')
const roleId = decodeURIComponent(id)
const result = await saveRoleFile(fileURLToPath(new URL('../test-data/roles/', import.meta.url)), roleId, ledger.exportRoleBackup(data, roleId))
console.log(JSON.stringify(result))
process.exit(0)
