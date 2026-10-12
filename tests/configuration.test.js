import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { ledger } from '../scripts/load-ledger.mjs'

test('v1 真实数据读取升级为 v2，角色 ID、名称、金额和旧起号方式均保留，原 JSON 不变', async () => {
  const raw = await readFile(new URL('./fixtures/legacy-v1.json', import.meta.url), 'utf8')
  const source = JSON.parse(raw).data
  const before = JSON.stringify(source)
  const current = ledger.validateLedger(source)
  assert.equal(current.version, 2)
  assert.equal(ledger.summarize(current).total, 213500)
  assert.equal(current.roles[0].id, 'muz8mwy5-hilnb0a9')
  assert.equal(current.roles[0].purchaseMode, source.roles[0].purchaseMode)
  assert.equal(JSON.stringify(source), before)
  assert.deepEqual(current.assets, source.assets)
})

test('自建起号能计入基础费用与养成，不能使用随号资产标记', () => {
  const data = ledger.roleLedger(ledger.demoLedger(), 'demo-role-0')
  data.roles[0].purchaseMode = 'self'; data.roles[0].purchaseCents = 0
  assert.throws(() => ledger.validateLedger(data))
  data.assets[0].included = false
  data.assets[2].subtype = 'training'
  assert.equal(ledger.summarize(ledger.validateLedger(data)).total, 220000)
  assert.equal(ledger.purchaseLabel('self'), '自建起号')
})

test('召唤兽组合购入的整单总价仅计入一次，件数和包含内容不会叠加金额', () => {
  const data = ledger.demoLedger()
  const set = { ...data.assets[1], id: 'set-1', included: false, costCents: 50000, purchaseKind: 'set', quantity: 3, contents: '召唤兽\n项圈\n铠甲', subtype: 'pet' }
  const next = ledger.putRecord(data, 'assets', set)
  assert.equal(ledger.summarize(next).total, 4150000)
  assert.equal(ledger.roleSummary(next, 'demo-role-0').total, 750000)
})

test('角色分类小计将随号参考价与新增投入分开，细分类型只影响分组', () => {
  const data = ledger.roleLedger(ledger.demoLedger(), 'demo-role-0')
  data.assets[0].subtype = 'gear'; data.assets[1].subtype = 'pet'; data.assets[2].subtype = 'mount'
  const result = ledger.roleSummary(data, 'demo-role-0')
  const equipment = result.breakdown.find(c => c.key === 'equipment')
  assert.equal(equipment.cents, 0)
  assert.equal(equipment.referenceCents, 120000)
  assert.equal(equipment.includedCents, 120000)
  assert.equal(result.subtypes.find(c => c.key === 'mount').cents, 20000)
  assert.equal(result.total, 700000)
})

test('组合、细分类型和装备及召唤兽属性能完整导出和按角色导入恢复', () => {
  const data = ledger.roleLedger(ledger.demoLedger(), 'demo-role-0')
  Object.assign(data.assets[0], { subtype: 'ornament', purchaseKind: 'set', quantity: 2, contents: '前排两件', attributes: { slot: '前排灵饰', level: 100, gem: '宝石', gemRank: 3, effect: '测试属性' } })
  Object.assign(data.assets[1], { subtype: 'pet', attributes: { petType: '全力', skills: '高级连击', growth: '1.275', effect: '高连套' } })
  const raw = ledger.exportRoleBackup(data, 'demo-role-0')
  assert.deepEqual(ledger.mergeRoleBackup(ledger.emptyLedger(), raw), data)
  assert.match(ledger.attributeText(data.assets[0]), /100级/)
  assert.match(ledger.attributeText(data.assets[1]), /成长 1.275/)
})

test('非法细分类型、数量、属性等级、锻数、成长及组合状态被拒绝', () => {
  for (const extra of [
    { subtype: 'pet' }, { purchaseKind: 'unknown' }, { quantity: 2 },
    { purchaseKind: 'set', quantity: 0 }, { purchaseKind: 'set', quantity: 1000 },
    { purchaseKind: 'set', quantity: 1.5 }, { contents: '不明确的组合' },
    { attributes: [] }, { attributes: { level: -1 } },
    { attributes: { gemRank: 31 } }, { attributes: { growth: '1.2345' } },
    { attributes: { skills: 123 } }
  ]) {
    const data = ledger.demoLedger(); Object.assign(data.assets[0], extra)
    assert.throws(() => ledger.validateLedger(data))
  }
})

test('分类建议不会修改旧记录；导入仅保留允许的属性字段', () => {
  const data = ledger.demoLedger()
  delete data.assets[0].subtype
  assert.equal(ledger.suggestSubtype('equipment', '前排灵饰3锻'), 'ornament')
  assert.equal(ledger.suggestSubtype('other', '坐骑成长'), 'mount')
  assert.equal(data.assets[0].subtype, undefined)
  data.assets[0].attributes = { gemRank: 7, arbitraryField: 'ignore' }
  const restored = ledger.importBackup(ledger.exportBackup(data))
  assert.deepEqual(restored.assets[0].attributes, { gemRank: 7 })
})

test('UTS 缺省可选字段为 null 时正常读取，导入规范化为未填写', () => {
  const data = ledger.demoLedger()
  Object.assign(data.assets[0], { subtype: null, purchaseKind: null, contents: null, quantity: null, attributes: null })
  ledger.validateLedger(data)
  const restored = ledger.importBackup(ledger.exportBackup(data))
  for (const key of ['subtype', 'purchaseKind', 'contents', 'quantity', 'attributes']) assert.equal(restored.assets[0][key], undefined)
  assert.equal(ledger.summarize(restored).total, 4100000)
})
