import assert from 'node:assert/strict'
import { readFile, mkdtemp, readdir, unlink, rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { ledger } from './load-ledger.mjs'
import { createTestDataServer } from './test-data-server.mjs'
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const fixturePath = fileURLToPath(new URL('../test-data/roles/muz8mwy5-hilnb0a9.json', import.meta.url))
const fixture = ledger.parseRoleBackup(await readFile(fixturePath, 'utf8'))
const initialTotal = ledger.summarize(fixture.data).total
const directory = await mkdtemp(join(tmpdir(), 'mhxy-role-ui-'))
const server = createTestDataServer({ directory })
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const endpoint = 'http://127.0.0.1:' + server.address().port + '/api/test-data/role'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await context.newPage()
page.setDefaultTimeout(30000)
const failures = []
page.on('pageerror', error => failures.push(error.message))
page.on('console', message => { if (message.type() === 'error') failures.push(message.text()) })
// 文件导出请求使用相同真实接口实现，但落盘到临时目录，避免测试改写用户的 JSON。
await page.route('http://127.0.0.1:5179/api/test-data/role', async route => {
  const response = await route.fetch({ url: endpoint })
  await route.fulfill({ response })
})
async function importFixture() {
  const chooser = page.waitForEvent('filechooser')
  await page.getByText('从 JSON 文件导入', { exact: true }).click()
  await (await chooser).setFiles(fixturePath)
  await page.getByText('导入角色备份？', { exact: true }).waitFor()
  await page.getByText('确定', { exact: true }).click()
  await page.getByText('6 个账号 · 6 个角色 · ' + (15 + fixture.data.assets.length) + ' 笔明细', { exact: true }).waitFor()
}
async function state() { return JSON.parse(await page.evaluate(() => uni.getStorageSync('mhxy-ledger-v1'))) }
try {
  await page.goto(process.env.PREVIEW_URL || 'http://localhost:5173', { waitUntil: 'networkidle' })
  await page.getByText('备份', { exact: true }).click()
  await page.getByText('载入示例数据', { exact: true }).click()
  await page.getByText('确定', { exact: true }).click()
  await page.getByText('¥41,000.00', { exact: true }).waitFor()
  const demo = await state()
  await page.getByText('备份', { exact: true }).click()
  await importFixture()
  assert.deepEqual(ledger.roleSummary(await state(), 'demo-role-0'), ledger.roleSummary(demo, 'demo-role-0'))
  console.log('PASS: 从文件导入角色，保留已有五开角色')

  await page.getByText('账号', { exact: true }).click()
  await page.getByText(fixture.data.roles[0].name, { exact: true }).click()
  await page.locator('.hero-money').filter({ hasText: ledger.money(initialTotal) }).waitFor()
  await page.getByText('导出测试 JSON', { exact: true }).click()
  await page.getByText('已导出：test-data/roles/' + fixture.roleId + '.json', { exact: true }).waitFor()
  const outputPath = join(directory, fixture.roleId + '.json')
  assert.deepEqual(ledger.importBackup(await readFile(outputPath, 'utf8')), fixture.data)

  const firstAsset = fixture.data.assets.find(a => a.category === 'other' && !a.included)
  assert.ok(firstAsset)
  await page.locator('.tabs').getByText('其他投入', { exact: true }).click()
  const card = page.locator('.card').filter({ has: page.getByText(firstAsset.name, { exact: true }) })
  await card.getByText('编辑明细', { exact: true }).click()
  await page.locator('.field-group').filter({ has: page.getByText(/人民币元/) }).locator('input').fill(ledger.amountInput(firstAsset.costCents + 100))
  await page.getByText('保存记录', { exact: true }).click()
  await page.locator('.hero-money').filter({ hasText: ledger.money(initialTotal + 100) }).waitFor()
  await page.getByText('导出测试 JSON', { exact: true }).click()
  await page.getByText('已覆盖：test-data/roles/' + fixture.roleId + '.json', { exact: true }).waitFor()
  const exported = ledger.importBackup(await readFile(outputPath, 'utf8'))
  assert.equal(exported.assets.find(a => a.id === firstAsset.id).costCents, firstAsset.costCents + 100)
  assert.deepEqual(await readdir(directory), [fixture.roleId + '.json'])
  console.log('PASS: 角色页按钮导出，修改后按同 ID 覆盖，未生成重复文件')

  await page.goBack()
  await page.getByText('备份', { exact: true }).click()
  await importFixture()
  const restored = await state()
  assert.equal(ledger.roleSummary(restored, fixture.roleId).total, initialTotal)
  assert.deepEqual(ledger.roleSummary(restored, 'demo-role-0'), ledger.roleSummary(demo, 'demo-role-0'))
  assert.equal(restored.roles.filter(r => r.id === fixture.roleId).length, 1)
  console.log('PASS: 同 ID 角色恢复原金额，其他角色和明细保留')
  assert.deepEqual(failures, [])
} catch (error) {
  console.error(await page.locator('body').innerText())
  console.error('Page errors:', failures)
  throw error
} finally {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
  for (const file of await readdir(directory)) await unlink(join(directory, file))
  await rmdir(directory)
}
