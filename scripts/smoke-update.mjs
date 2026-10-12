import assert from 'node:assert/strict'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { ledger } from './load-ledger.mjs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await context.newPage()
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:5178'
const failures = []
page.on('pageerror', e => failures.push(e.message))
page.setDefaultTimeout(15000)
let status = 404
let payload = {}
await page.route('https://github.com/Hwayin/mhxy-jsq/releases/latest/download/update.json*', route => route.fulfill({status,headers:{'access-control-allow-origin':'*','content-type':'application/json'},body:JSON.stringify(payload)}))
try {
  await page.goto(base)
  await page.getByText('成本总览',{exact:true}).waitFor()
  const saved = ledger.demoLedger()
  await page.evaluate(data => localStorage.setItem('mhxy-ledger-v1',JSON.stringify(data)),saved)
  await page.getByText('备份',{exact:true}).click()
  await page.getByText('当前版本 v0.8.0',{exact:true}).waitFor()
  await page.getByText('检查更新 ›',{exact:true}).click()
  await page.getByText('尚未发布可下载的更新',{exact:true}).waitFor()
  payload={type:'apk',platform:'android',appId:'__UNI__A9783A2',packageName:'uni.app.UNIA9783A2',versionName:'0.9.0',versionCode:900,url:'https://github.com/Hwayin/mhxy-jsq/releases/download/v0.9.0/mhxy-ledger-0.9.0.apk',size:50000000,sha256:'a'.repeat(64),notes:'改进快速录入\n优化装备类型选择'}
  status=200
  await page.getByText('检查更新',{exact:true}).click()
  await page.getByText('发现新版本',{exact:true}).waitFor()
  await page.getByText('v0.9.0',{exact:true}).waitFor()
  assert.match(await page.locator('.update-notes').innerText(),/改进快速录入/)
  assert.equal(await page.getByText('下载更新',{exact:true}).count(),0)
  await mkdir(new URL('../docs/screenshots/',import.meta.url),{recursive:true})
  for(const width of [390,320]) {
    await page.setViewportSize({width,height:844})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
    await page.screenshot({path:fileURLToPath(new URL('../docs/screenshots/update-'+width+'.png',import.meta.url)),fullPage:true})
  }
  payload={...payload,versionCode:800}
  await page.getByText('检查更新',{exact:true}).click()
  await page.getByText('当前已是最新版本',{exact:true}).waitFor()
  assert.equal(await page.getByText('发现新版本',{exact:true}).count(),0)
  payload={...payload,versionCode:900,sha256:'bad'}
  await page.getByText('检查更新',{exact:true}).click()
  await page.getByText('更新校验信息无效',{exact:true}).waitFor()
  assert.equal(await page.getByText('发现新版本',{exact:true}).count(),0)
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('mhxy-ledger-v1'))),saved)
  assert.deepEqual(failures,[])
  console.log('更新页：404、新版本、同版本、无效元数据、浏览器限制、390/320px及账本保留均通过。')
} finally { await browser.close() }
