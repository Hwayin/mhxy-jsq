import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

// 直接加载实际 .uts 源码，只剥离 TS 类型，不复制业务实现。
const source = await readFile(new URL('../lib/ledger.uts', import.meta.url), 'utf8')
const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64')
const { emptyLedger, demoLedger, toCents, money, summarize, roleSummary, putRecord, removeRecord, validateLedger, exportBackup, importBackup } = await import(moduleUrl)

test('金额按分解析，拒绝负数、三位小数、科学计数法与无穷值', () => {
  assert.equal(toCents('0.1') + toCents('0.2'), 30)
  assert.equal(toCents('1234.56'), 123456)
  assert.equal(money(123456), '¥1,234.56')
  for (const value of ['-1', '1.001', 'NaN', 'Infinity', '', '1e3', '1000000000', '1,000']) assert.throws(() => toCents(value))
})
test('五开整号价加后续投入，随号装备不重复计价', () => {
  const data = demoLedger()
  const s = summarize(data)
  assert.equal(s.accountCount, 5)
  assert.equal(s.roleCount, 5)
  assert.equal(s.assetCount, 15)
  assert.equal(s.includedCount, 5)
  assert.equal(s.purchase, 3500000)
  assert.equal(s.total, 4100000)
  assert.equal(s.average, 820000)
  assert.equal(roleSummary(data, 'demo-role-0').total, 700000)
})
test('队伍过滤只统计所属账号与角色', () => {
  const data = demoLedger(); data.accounts[0].group = '单开'
  assert.equal(summarize(data, '单开').total, 700000)
  assert.equal(summarize(data, '示例五开队').roleCount, 4)
  assert.equal(summarize(data, '不存在').total, 0)
})
test('编辑金额更新汇总且不改写旧数据', () => {
  const data = demoLedger()
  const next = putRecord(data, 'assets', { ...data.assets[1], costCents: 180000 })
  assert.equal(summarize(next).total, 4200000)
  assert.equal(data.assets[1].costCents, 80000)
})
test('删除账号级联删除所属角色和资产，其他账号不变', () => {
  const next = removeRecord(demoLedger(), 'accounts', 'demo-account-0')
  assert.equal(next.accounts.length, 4); assert.equal(next.roles.length, 4); assert.equal(next.assets.length, 12)
  assert.equal(summarize(next).total, 3400000)
})
test('删除单角色或明细只影响相关成本', () => {
  const data = demoLedger()
  const noRole = removeRecord(data, 'roles', 'demo-role-0')
  assert.equal(noRole.accounts.length, 5); assert.equal(noRole.assets.length, 12)
  assert.equal(summarize(removeRecord(data, 'assets', 'demo-eq-0')).total, 4100000)
  assert.equal(summarize(removeRecord(data, 'assets', 'demo-pet-0')).total, 4020000)
})
test('备份往返保持全部业务数据与中文属性', () => {
  const data = demoLedger()
  assert.deepEqual(importBackup(exportBackup(data)), data)
  assert.deepEqual(importBackup(exportBackup(emptyLedger())), emptyLedger())
  assert.throws(() => importBackup('不是JSON'))
  assert.throws(() => importBackup('{"app":"other"}'))
})
test('损坏备份、孤立关系、重复 ID、错误价格与类型被拒绝', () => {
  for (const mutate of [
    d => { d.version = 99 },
    d => { d.roles[0].accountId = 'missing' },
    d => { d.assets[0].roleId = 'missing' },
    d => { d.accounts[1].id = d.accounts[0].id },
    d => { d.assets[0].costCents = -1 },
    d => { d.assets[0].included = 'false' },
    d => { d.roles[0].level = 1.5 },
    d => { d.roles[0].purchaseMode = 'bare' },
    d => { d.assets[0].date = '2026-02-30' },
    d => { d.assets[0].category = 'other' }
  ]) { const data = demoLedger(); mutate(data); assert.throws(() => validateLedger(data)) }
})

const storageSource = stripTypeScriptTypes(await readFile(new URL('../lib/storage.uts', import.meta.url), 'utf8')).replace("'./ledger.uts'", JSON.stringify(moduleUrl))
const storage = await import('data:text/javascript;base64,' + Buffer.from(storageSource).toString('base64'))
function mockStorage() {
  const values = new Map()
  globalThis.uni = { getStorageSync: key => values.get(key) ?? '', setStorageSync: (key, value) => values.set(key, value) }
  return values
}
test('本地保存和上一版本恢复；损坏数据不静默重置', () => {
  const values = mockStorage()
  assert.deepEqual(storage.loadLedger(), emptyLedger())
  storage.saveLedger(demoLedger())
  storage.saveLedger(removeRecord(demoLedger(), 'accounts', 'demo-account-0'))
  assert.equal(storage.loadLedger().accounts.length, 4)
  assert.equal(storage.previousLedger().accounts.length, 5)
  values.set('mhxy-ledger-v1', 'damaged')
  assert.throws(() => storage.loadLedger())
  assert.throws(() => storage.saveLedger(emptyLedger()))
  storage.saveLedger(storage.previousLedger(), true)
  assert.equal(storage.loadLedger().accounts.length, 5)
})
test('存储写入失败不报告成功，保留已保存账本', () => {
  mockStorage(); storage.saveLedger(demoLedger())
  globalThis.uni.setStorageSync = () => { throw new Error('disk full') }
  assert.throws(() => storage.saveLedger(emptyLedger()), /disk full/)
  assert.equal(storage.loadLedger().roles.length, 5)
})
