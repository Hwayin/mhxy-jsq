import test from 'node:test'
import assert from 'node:assert/strict'
import { ledger } from '../scripts/load-ledger.mjs'

function fixture() { return ledger.roleLedger(ledger.demoLedger(), 'demo-role-0') }
test('装备写入强制单件和明确部位，旧组合仍可读取和备份', () => {
  const data = fixture()
  const asset = data.assets[0]
  for (const extra of [{ purchaseKind: 'set', quantity: 2 }, { subtype: null }, { attributes: {} }, { attributes: { slot: '装备套装' } }, { subtype: 'ornament', attributes: { slot: '前排灵饰' } }, { subtype: 'jade', attributes: { jadeKind: '' } }]) {
    assert.throws(() => ledger.putRecord(data, 'assets', { ...asset, ...extra }))
  }
  const old = { ...asset, purchaseKind: 'set', quantity: 3 }
  data.assets[0] = old
  assert.deepEqual(ledger.importBackup(ledger.exportBackup(data)), data)
  assert.equal(ledger.equipmentCoverage(data.assets)[0].count, 0)
  assert.equal(data.assets[0].quantity, 3)
})
test('完整度按明确部位去重，组合和无部位记录不填补缺失部位', () => {
  const data = fixture()
  const asset = data.assets[0]
  data.assets.push({ ...asset, id: 'weapon-2' }, { ...asset, id: 'set', purchaseKind: 'set', attributes: { slot: '腰带' } }, { ...asset, id: 'head', attributes: { slot: '发钗' } }, { ...asset, id: 'ring', subtype: 'ornament', attributes: { slot: '戒指' } }, { ...asset, id: 'yin', subtype: 'jade', attributes: { jadeKind: '阴玉' } })
  const coverage = ledger.equipmentCoverage(data.assets)
  assert.equal(coverage[0].count, 2)
  assert.deepEqual(coverage[0].missing, ['项链','衣服','腰带','鞋'])
  assert.equal(coverage[1].count, 1); assert.equal(coverage[2].count, 1)
  assert.equal(ledger.summarize(data).total, 700000)
})
test('三类装备的完整属性按角色导出导入，不改变成本或计价标记', () => {
  const data = fixture()
  const gear = data.assets[0]
  Object.assign(gear, { subtype: 'gear', attributes: { slot: '项链', level: 100, gem: '舍利子', gemRank: 7, setEffect: '变身术之如意仙子', specialSkill: '晶清诀', specialEffects: ['简易','永不磨损'], effect: '旧自由属性' } })
  const ornament = { ...gear, id: 'ornament', subtype: 'ornament', attributes: { slot: '戒指', level: 100, starRank: 3, bellSet: '健步如飞', bellLevel: 4 } }
  const jade = { ...gear, id: 'jade', subtype: 'jade', attributes: { jadeKind: '阳玉', dustRank: 3, jadeEffects: ['奇袭法术','法伤化劲'], ambushSkills: ['奇袭法术：龙腾','奇袭特技：野兽之力'] } }
  data.assets.push(ornament, jade)
  const restored = ledger.mergeRoleBackup(ledger.emptyLedger(), ledger.exportRoleBackup(data, 'demo-role-0'))
  assert.deepEqual(restored, data)
  assert.equal(ledger.summarize(restored).total, 700000)
  assert.match(ledger.attributeText(gear), /套装 变身术之如意仙子.*特技 晶清诀.*特效 简易 \/ 永不磨损.*旧自由属性/)
  assert.match(ledger.attributeText(ornament), /星辉石 3锻.*钟灵石 健步如飞 4级/)
  assert.match(ledger.attributeText(jade), /阳玉.*五色灵尘 3锻.*龙腾.*野兽之力/)
})
test('旧 attachment 归入玉魄筛选与小计，原 ID 与属性原样保留', () => {
  const data = fixture()
  Object.assign(data.assets[0], { subtype: 'attachment', attributes: { gemRank: 3, effect: '原玉魄属性' } })
  const before = JSON.stringify(data)
  assert.equal(ledger.assetSubtype(data.assets[0]), 'jade')
  assert.equal(ledger.subtypeLabel(data.assets[0]), '上古玉魄')
  assert.equal(ledger.roleSummary(data, 'demo-role-0').subtypes.find(s => s.key === 'jade').referenceCents, 120000)
  assert.match(ledger.attributeText(data.assets[0]), /五色灵尘 3锻.*原玉魄属性/)
  assert.equal(JSON.stringify(data), before)
  assert.deepEqual(ledger.importBackup(ledger.exportBackup(data)), data)
})
test('新属性拒绝非整数、越界、异常数组、重复值；自定义名称能恢复', () => {
  for (const attributes of [{ starRank: 3.5 }, { bellLevel: 9 }, { dustRank: 16 }, { dustRank: -1 }, { specialEffects: '简易' }, { ambushSkills: [5] }, { jadeEffects: ['奇袭法术','奇袭法术'] }, { specialSkill: 2 }]) {
    const data = fixture(); data.assets[0].attributes = attributes
    assert.throws(() => ledger.validateLedger(data))
  }
  const data = fixture()
  data.assets[0].attributes = { setEffect: '新增套装名称', specialEffects: ['新增特效'], bellSet: null, dustRank: null, ambushSkills: null }
  assert.deepEqual(ledger.importBackup(ledger.exportBackup(data)).assets[0].attributes, { setEffect: '新增套装名称', specialEffects: ['新增特效'] })
})
