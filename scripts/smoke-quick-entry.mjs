import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { ledger } from './load-ledger.mjs'
const { chromium }=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright')
const browser=await chromium.launch({channel:'msedge',headless:true})
const context=await browser.newContext({viewport:{width:390,height:844}})
const page=await context.newPage()
page.setDefaultTimeout(15000)
const errors=[]
page.on('pageerror',e=>errors.push(e.message))
const base=process.env.PREVIEW_URL||'http://127.0.0.1:5178'
async function stored(){return page.evaluate(()=>JSON.parse(localStorage.getItem('mhxy-ledger-v1')))}
async function save(){await page.getByText('保存并继续',{exact:true}).click();await page.waitForFunction(()=>document.querySelector('.quick-amount input')?.value==='');await page.locator('uni-toast').last().waitFor({state:'hidden'})}
async function returnToRole(){await page.getByText('完成',{exact:true}).click();await page.locator('.role-header').waitFor()}
async function enterQuick(){await page.getByText('快速录入',{exact:true}).click();await page.getByText('快速记下每一件',{exact:true}).waitFor()}
try {
  await page.goto(base);await page.getByText('成本总览',{exact:true}).waitFor()
  const seed=ledger.demoLedger()
  await page.evaluate(data=>localStorage.setItem('mhxy-ledger-v1',JSON.stringify(data)),seed)
  await page.reload();await page.locator('.rank-row').first().click();await page.locator('.role-header').waitFor()
  await enterQuick()
  assert.equal(await page.locator('.quick-slot-active .quick-slot-title').innerText(),'头部')
  // 刚进入就跨分类切换；未保存输入保持，页面/部位/细分类型正确且账本不写入。
  await page.locator('.quick-amount input').fill('12.34')
  for(let cycle=0;cycle<8;cycle++) {
    await page.locator('.chip-row').first().getByText('召唤兽',{exact:true}).click()
    assert.equal(await page.locator('.quick-name input').isVisible(),true)
    assert.equal(await page.locator('.quick-equipment').isVisible(),false)
    await page.locator('.quick-types').getByText('召唤兽装备',{exact:true}).click()
    assert.equal(await page.locator('.quick-types .chip-active').innerText(),'召唤兽装备')
    await page.locator('.chip-row').first().getByText('其他投入',{exact:true}).click()
    await page.locator('.quick-types').getByText('坐骑',{exact:true}).click()
    await page.locator('.chip-row').first().getByText('装备管理',{exact:true}).click()
    assert.equal(await page.locator('.quick-name input').isVisible(),false)
    assert.equal(await page.locator('.quick-equipment').isVisible(),true)
    assert.equal(await page.locator('.quick-slot-active .quick-slot-title').innerText(),'头部')
    assert.equal(await page.locator('.quick-amount input').inputValue(),'12.34')
    assert.match(page.url(),/pages\/quick\/index/)
    assert.equal(await page.getByText('快速记下每一件',{exact:true}).isVisible(),true)
    assert.deepEqual(await stored(),seed)
  }
  await page.locator('.quick-level input').fill('100')
  await page.locator('.quick-amount input').fill('128.90')
  await save()
  let data=await stored();assert.equal(data.assets.length,seed.assets.length+1,await page.locator('.page').innerText());assert.equal(data.assets.at(-1).costCents,12890)
  assert.equal(await page.locator('.quick-amount input').inputValue(),'')
  assert.equal(await page.locator('.quick-level input').inputValue(),'100')
  assert.equal(await page.locator('.quick-slot-active .quick-slot-title').innerText(),'项链')
  await page.getByText('保存并继续',{exact:true}).click();await page.getByText('请填写本件金额，可明确填写 0',{exact:true}).waitFor()
  assert.equal((await stored()).assets.length,seed.assets.length+1)
  await page.locator('.quick-amount input').fill('55');await save()
  data=await stored();assert.equal(ledger.summarize(data).total,ledger.summarize(seed).total+18390)
  assert.equal(data.assets.at(-1).attributes.slot,'项链')
  assert.equal(await page.locator('.quick-slot-active .quick-slot-title').innerText(),'衣服')
  await page.locator('.quick-types').getByText('灵饰',{exact:true}).click()
  assert.equal(await page.locator('.quick-slot-active .quick-slot-title').innerText(),'戒指')
  await page.locator('.quick-amount input').fill('20')
  await page.locator('.field-group').filter({has:page.getByText('购号价已包含此资产',{exact:true})}).locator('uni-switch').click()
  await save();assert.equal(ledger.summarize(await stored()).total,ledger.summarize(seed).total+18390)
  assert.equal((await stored()).assets.at(-1).included,true)
  await mkdir(new URL('../docs/screenshots/',import.meta.url),{recursive:true})
  for(const width of [390,320]) {
    await page.setViewportSize({width,height:844})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
    await page.screenshot({path:fileURLToPath(new URL('../docs/screenshots/quick-entry-'+width+'.png',import.meta.url))})
  }
  // 保留草稿和恢复，快速草稿与原三步录入草稿隔离。
  await page.locator('.quick-amount input').fill('66.60')
  await page.getByText('完成',{exact:true}).click()
  await page.getByText('保留草稿并返回',{exact:true}).click()
  await page.locator('.role-header').waitFor();await enterQuick()
  await page.getByText('恢复草稿',{exact:true}).click()
  assert.equal(await page.locator('.quick-amount input').inputValue(),'66.60')
  assert.equal(await page.locator('.quick-slot-active .quick-slot-title').innerText(),'耳饰')
  await save();await returnToRole();await enterQuick()
  assert.equal(await page.locator('.quick-level input').inputValue(),'100')
  await page.getByText('召唤兽',{exact:true}).first().click()
  await page.locator('.quick-name input').fill('测试画魂');await page.locator('.quick-amount input').fill('30');await save()
  assert.equal((await stored()).assets.at(-1).name,'测试画魂');assert.equal(await page.locator('.quick-name input').inputValue(),'')
  await page.locator('.quick-types').getByText('召唤兽装备',{exact:true}).click()
  await page.locator('.quick-name input').fill('测试召唤兽装备');await page.locator('.quick-amount input').fill('15');await save()
  assert.equal((await stored()).assets.at(-1).subtype,'petGear')
  await page.getByText('其他投入',{exact:true}).click()
  await page.locator('.quick-name input').fill('测试点修');await page.locator('.quick-amount input').fill('40');await save()
  assert.equal((await stored()).assets.at(-1).subtype,'misc')
  // 补齐最后一件仍使用原编辑器，名称和成本正确回填。
  await page.getByText('补齐上一件属性 / 编辑 ›',{exact:true}).click()
  assert.equal(await page.locator('.amount-group input').inputValue(),'40.00')
  assert.deepEqual(errors,[])
  console.log('PASS: 首次进入及8轮跨分类切换、保留未保存金额、召唤兽/召唤兽装备连续保存、自动下一部位、金额清空防重复、随号计价、补齐属性、草稿恢复及390/320px；未修改用户数据。')
} finally {await browser.close()}
