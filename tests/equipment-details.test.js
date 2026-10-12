import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { ledger } from '../scripts/load-ledger.mjs'
const source = await readFile(new URL('../lib/item-catalog.uts', import.meta.url), 'utf8')
const { EQUIPMENT_ITEMS } = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64'))
test('官方物品目录覆盖三类，物品 ID 唯一且选择等级准确', () => {
  assert.equal(EQUIPMENT_ITEMS.length, new Set(EQUIPMENT_ITEMS.map(i => i.id)).size)
  assert.equal(EQUIPMENT_ITEMS.find(i => i.name === '金蚕丝裙').levels.includes(110), true)
  assert.equal(EQUIPMENT_ITEMS.find(i => i.name === '金麟绕').slot, '戒指')
  assert.deepEqual(EQUIPMENT_ITEMS.find(i => i.name === '金麟绕').levels, [100])
  assert.equal(EQUIPMENT_ITEMS.find(i => i.name === '上古玉魄·阴').slot, '阴玉')
})
test('名称由游戏物品及配置生成，正数负数和零值均展示，长度不会超过备份限制', () => {
  const asset = { category: 'equipment', subtype: 'gear', attributes: { itemName: '金蚕丝裙', slot: '衣服', level: 110, gem: '舍利子', gemRank: 7, greenAttributes: [{ kind: '魔力', value: 27 }, { kind: '耐力', value: -10 }, { kind: '敏捷', value: 0 }] } }
  assert.equal(ledger.equipmentName(asset), '110级 金蚕丝裙 · 魔力+27 / 耐力−10 / 敏捷+0 · 舍利子7锻')
  assert.match(ledger.attributeText(asset), /魔力\+27.*耐力−10.*敏捷\+0/)
  asset.attributes.setEffect = '长'.repeat(500)
  assert.equal(ledger.equipmentName(asset).length, 200)
  assert.equal(ledger.equipmentName({ category: 'equipment', subtype: 'jade', attributes: { jadeKind: '阳玉', dustRank: 3 } }), '上古玉魄·阳 · 五色灵尘3锻')
})
test('绿字、游戏物品、原名和自动名称标记能完整备份恢复，成本和原对象保持不变', () => {
  const data = ledger.roleLedger(ledger.demoLedger(), 'demo-role-0')
  const asset = data.assets[0]
  Object.assign(asset.attributes, { slot: '衣服', itemId: '2663', itemName: '金蚕丝裙', greenAttributes: [{kind:'魔力',value:27},{kind:'耐力',value:-10}] })
  asset.originalName = asset.name; asset.nameGenerated = true; asset.name = ledger.equipmentName(asset)
  const before = JSON.stringify(data)
  assert.deepEqual(ledger.mergeRoleBackup(ledger.emptyLedger(), ledger.exportRoleBackup(data, asset.roleId)), data)
  assert.equal(JSON.stringify(data), before)
  assert.equal(ledger.roleSummary(data, asset.roleId).total, 700000)
  const duplicate = { ...asset, attributes: { ...asset.attributes, greenAttributes: [{kind:'魔力',value:3},{kind:'魔力',value:4}] } }
  assert.throws(() => ledger.putRecord(data, 'assets', duplicate), /重复/)
  duplicate.subtype = 'ornament'; duplicate.attributes.slot = '戒指'
  duplicate.attributes.greenAttributes = [{kind:'伤害',value:3},{kind:'伤害',value:4}]
  ledger.putRecord(data, 'assets', duplicate)
})
test('数值属性拒绝缺字段、非法数值、三位小数、非法单位；导入清除未知嵌套字段', () => {
  for (const greenAttributes of ['魔力27', [{kind:'魔力'}], [{kind:'',value:3}], [{kind:'魔力',value:'27'}], [{kind:'魔力',value:Infinity}], [{kind:'魔力',value:1000000}], [{kind:'魔力',value:1.123}], [{kind:'魔力',value:3,unit:'元'}]]) {
    const data = ledger.demoLedger(); data.assets[0].attributes.greenAttributes = greenAttributes
    assert.throws(() => ledger.validateLedger(data))
  }
  const data = ledger.demoLedger()
  data.assets[0].attributes.greenAttributes = [{kind:'魔力',value:0,extra:'ignore'}]
  assert.deepEqual(ledger.importBackup(ledger.exportBackup(data)).assets[0].attributes.greenAttributes, [{kind:'魔力',value:0}])
  data.assets[0].attributes.level = 0
  ledger.validateLedger(data)
})
