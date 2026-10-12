// 只读指定浏览器标签页中的账本，不导航、不写入存储、不关闭浏览器。
import { pathToFileURL } from 'node:url'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://127.0.0.1:9777')
const target = process.env.LEDGER_PAGE_URL
const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url() === target)
if (!page) throw new Error('没有找到指定的账本标签页')
const raw = await page.evaluate(() => uni.getStorageSync('mhxy-ledger-v1'))
if (!raw) throw new Error('该浏览器标签页没有账本数据')
const source = await readFile(new URL('../lib/ledger.uts', import.meta.url), 'utf8')
const ledger = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64'))
const data = ledger.validateLedger(JSON.parse(raw))
const roleId = new URL(target).hash.match(/[?&]id=([^&]+)/)?.[1]
const role = data.roles.find(role => role.id === decodeURIComponent(roleId || ''))
console.log(JSON.stringify({
  page: target,
  summary: ledger.summarize(data),
  accounts: data.accounts.map(account => ({ id: account.id, name: account.name, group: account.group, noteLength: account.note.length })),
  roles: data.roles.map(role => ({ ...role, note: undefined, noteLength: role.note.length })),
  assets: data.assets,
  targetRoleSummary: role ? ledger.roleSummary(data, role.id) : null
}, null, 2))
process.exit(0)
