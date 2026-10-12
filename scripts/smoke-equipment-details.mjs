import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ledger } from './load-ledger.mjs'
import { createTestDataServer } from './test-data-server.mjs'
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const directory = await mkdtemp(join(tmpdir(), 'mhxy-detail-ui-'))
const server = createTestDataServer({ directory })
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await context.newPage()
page.setDefaultTimeout(20000)
const failures = []
page.on('pageerror', e => failures.push(e.message))
page.on('console', e => { if (e.type() === 'error') failures.push(e.text()) })
const base = process.env.PREVIEW_URL || 'http://localhost:5173'
await page.route('http://127.0.0.1:5179/api/test-data/role', async route => route.fulfill({ response: await route.fetch({ url: 'http://127.0.0.1:' + server.address().port + '/api/test-data/role' }) }))
const field = label => page.locator('.equipment-choice').filter({ has: page.getByText(label, { exact: true }) }).locator('.field')
const amount = () => page.locator('.field-group').filter({ has: page.getByText(/人民币元/) }).locator('input')
const save = () => page.getByText('保存记录', { exact: true }).click()
async function pick(label, value) {
  await field(label).click()
  await page.locator('.choice-search input').fill(value)
  await page.locator('.choice-row').getByText(value, { exact: true }).first().click()
}
async function stat(kind, value, negative = false) {
  await page.getByText('＋ 添加属性', { exact: true }).click()
  const row = page.locator('.numeric-row').last()
  await row.locator('.numeric-kind').click()
  await page.locator('.choice-row').getByText(kind, { exact: true }).click()
  await row.locator('input').fill(value)
  if (negative) await row.locator('.numeric-sign').click()
}
async function state() { return JSON.parse(await page.evaluate(() => uni.getStorageSync('mhxy-ledger-v1'))) }
try {
  const data = ledger.roleLedger(ledger.demoLedger(), 'demo-role-0')
  data.roles[0].purchaseMode = 'self'; data.roles[0].purchaseCents = 0; data.assets = []
  await page.goto(base)
  await page.evaluate(data => uni.setStorageSync('mhxy-ledger-v1', JSON.stringify(data)), data)
  await page.goto(base + '/#/pages/role/index?id=demo-role-0'); await page.reload()
  await page.getByText('＋ 记一笔', { exact: true }).click()
  assert.equal(await page.getByPlaceholder('请输入名称').count(), 0)
  await pick('部位', '衣服'); await pick('资产等级', '110级'); await pick('物品名称', '金蚕丝裙')
  await pick('宝石类型', '舍利子'); await pick('宝石锻数', '7锻')
  await stat('魔力', '27'); await stat('耐力', '10', true)
  await page.locator('.numeric-row').last().locator('input').fill('1.123')
  await save(); await page.getByText('第2条属性请选择类型并填写数值，最多两位小数', { exact: true }).waitFor()
  await page.locator('.numeric-row').last().locator('input').fill('10')
  await stat('力量', '3'); await page.locator('.numeric-row').last().getByText('删除', { exact: true }).click()
  const title = '110级 金蚕丝裙 · 魔力+27 / 耐力−10 · 舍利子7锻'
  await page.locator('.generated-title').filter({ hasText: title }).waitFor()
  await amount().fill('500'); await save()
  await page.locator('.asset-title').getByText('110级 金蚕丝裙', { exact: true }).waitFor()
  const gear = (await state()).assets[0]
  assert.deepEqual(gear.attributes.greenAttributes.map(r => ({kind:r.kind,value:r.value})), [{kind:'魔力',value:27},{kind:'耐力',value:-10}])
  await page.locator('#asset-' + gear.id).getByText('编辑明细', { exact: true }).click()
  assert.deepEqual(await page.locator('.numeric-row input').evaluateAll(nodes => nodes.map(n => n.value)), ['27','10'])
  assert.equal(await page.locator('.numeric-sign').last().innerText(), '−')
  await page.locator('.numeric-kind').first().click(); await page.locator('.choice-panel').getByText('取消', { exact: true }).click()
  await pick('资产等级', '120级')
  assert.match(await field('物品名称').innerText(), /通用物品/)
  await page.goBack()
  console.log('PASS: 无需输入名称、真实物品筛选、正负绿字、删除、数值校验、回填与更改等级清除不匹配物品')

  await page.locator('.subtype-filters').getByText('灵饰', { exact: true }).click()
  await page.getByText('＋ 记一笔', { exact: true }).click()
  await pick('部位','戒指'); await pick('资产等级','100级'); await pick('物品名称','金麟绕'); await pick('星辉石锻数','3锻')
  await stat('伤害','6'); await stat('伤害','8'); await amount().fill('120'); await save()
  await page.locator('.subtype-filters').getByText('上古玉魄', { exact: true }).click()
  await page.getByText('＋ 记一笔', { exact: true }).click()
  await pick('物品名称','上古玉魄·阴'); await pick('五色灵尘锻数','3锻')
  await stat('抗物理暴击等级','3.5'); await page.locator('.numeric-unit').click(); await amount().fill('40'); await save()
  await page.locator('.hero-money').filter({ hasText: '¥660.00' }).waitFor()
  await page.getByText('导出测试 JSON', { exact: true }).click()
  await page.getByText('已导出：test-data/roles/demo-role-0.json', { exact: true }).waitFor()
  const raw = await readFile(join(directory,'demo-role-0.json'),'utf8')
  const exported = ledger.parseRoleBackup(raw).data
  assert.equal(exported.assets[0].name, title)
  assert.equal(exported.assets[1].attributes.itemName,'金麟绕')
  assert.deepEqual(exported.assets[1].attributes.greenAttributes,[{kind:'伤害',value:6},{kind:'伤害',value:8}])
  assert.deepEqual(exported.assets[2].attributes.greenAttributes,[{kind:'抗物理暴击等级',value:3.5,unit:'%'}])
  assert.equal(ledger.summarize(exported).total,66000)
  await page.locator('.subtype-filters').getByText('全部', { exact: true }).click()
  await page.evaluate(() => window.scrollTo(0,600))
  await page.screenshot({ path:'docs/screenshots/equipment-details.png',fullPage:true })
  const fresh = await browser.newContext({ viewport:{width:390,height:844} })
  const restored = await fresh.newPage(); await restored.goto(base)
  await restored.getByText('备份',{exact:true}).click(); await restored.locator('textarea').fill(raw)
  await restored.getByText('检查并导入',{exact:true}).click(); await restored.getByText('确定',{exact:true}).click()
  const recovered = JSON.parse(await restored.evaluate(() => uni.getStorageSync('mhxy-ledger-v1')))
  // UTS 缺省单位为 null，JS 为 undefined；按实际导入白名单规范化后比较业务值。
  const canonical = ledger.importBackup(ledger.exportBackup(recovered))
  assert.deepEqual(canonical.assets.map(a=>a.attributes.greenAttributes),exported.assets.map(a=>a.attributes.greenAttributes))
  assert.deepEqual(failures,[])
  console.log('PASS: 灵饰重复附加属性、玉魄百分比、自动名称、金额不变、JSON 导出及空账本恢复；用户数据未修改')
} catch(e) { console.error(await page.locator('body').innerText()); console.error(failures); throw e }
finally { await browser.close(); await new Promise(resolve => server.close(resolve)); for(const file of await readdir(directory)) await unlink(join(directory,file)); await rmdir(directory) }
