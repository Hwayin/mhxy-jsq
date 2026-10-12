import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { ledger, ledgerModuleUrl } from '../scripts/load-ledger.mjs'
const source = stripTypeScriptTypes(await readFile(new URL('../lib/equipment-calc.uts',import.meta.url),'utf8')).replace("'./ledger.uts'",JSON.stringify(ledgerModuleUrl))
const calc = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))
const calcUrl = 'data:text/javascript;base64,'+Buffer.from(source).toString('base64')
const displaySource = stripTypeScriptTypes(await readFile(new URL('../lib/equipment-display.uts',import.meta.url),'utf8')).replace("'./ledger.uts'",JSON.stringify(ledgerModuleUrl)).replace("'./equipment-calc.uts'",JSON.stringify(calcUrl))
const display = await import('data:text/javascript;base64,'+Buffer.from(displaySource).toString('base64'))
const role = {...ledger.demoLedger().roles[0],race:'human'}
const weapon = extra => ({category:'equipment',subtype:'gear',attributes:{slot:'武器',baseAttributes:[{kind:'伤害',value:400},{kind:'命中',value:450}],...extra}})
const metric = (asset,key,who=role) => calc.equipmentCalculation(asset,who).metrics.find(m=>m.key===key)
test('武器初伤命中与混合宝石分别加成，玛瑙不增加法伤，力量按种族估算',()=>{
  const a=weapon({gem:'太阳石',gemRank:2,extraGem:'红玛瑙',extraGemRank:3,greenAttributes:[{kind:'力量',value:10},{kind:'魔力',value:20}]})
  assert.equal(metric(a,'base:伤害').value,416)
  assert.equal(metric(a,'base:命中').value,525)
  assert.equal(metric(a,'weapon:total').value,591)
  assert.equal(metric(a,'weapon:magic').value,122)
  assert.equal(metric(a,'weapon:power').value,597.7)
  assert.equal(metric(a,'weapon:power',{...role,race:'immortal'}).value,596.7)
  a.attributes.extraGemRank=4
  assert.equal(metric(a,'weapon:magic').value,122)
})
test('项链舍利与防具月亮属性独立，缺基础数值或不合法宝石不伪造零值',()=>{
  const necklace={category:'equipment',subtype:'gear',attributes:{slot:'项链',baseAttributes:[{kind:'灵力',value:182}],gem:'舍利子',gemRank:7}}
  assert.equal(metric(necklace,'base:灵力').value,224)
  const armor={category:'equipment',subtype:'gear',attributes:{slot:'衣服',baseAttributes:[{kind:'防御',value:200}],gem:'月亮石',gemRank:8,greenAttributes:[{kind:'耐力',value:20}]}}
  assert.equal(metric(armor,'base:防御').value,296)
  assert.equal(metric(armor,'contribution:defense').value,326)
  assert.equal(metric(weapon({baseAttributes:[{kind:'伤害',value:400}]}),'weapon:total').value,null)
  necklace.attributes.gem='月亮石'; assert.equal(metric(necklace,'base:防御').value,null)
  assert.equal(metric(weapon({gem:'未知宝石',gemRank:5}),'weapon:total').value,null)
})
test('成品灵饰不重复强化，初始模式每条用录入增量，未填增量保持待计算，重复词条按类别汇总',()=>{
  const a={category:'equipment',subtype:'ornament',attributes:{slot:'戒指',starRank:3,baseAttributes:[{kind:'伤害',value:20}],greenAttributes:[{kind:'伤害',value:10,perRank:4},{kind:'伤害',value:12,perRank:4}]}}
  assert.equal(metric(a,'green:0:伤害').value,10)
  a.attributes.valuesStage='initial'
  assert.equal(metric(a,'green:0:伤害').value,22)
  assert.equal(calc.comparisonMetrics(a,role).find(m=>m.key==='addon:伤害:').value,46)
  delete a.attributes.greenAttributes[1].perRank
  assert.equal(calc.comparisonMetrics(a,role).find(m=>m.key==='addon:伤害:').value,null)
})
test('玉魄初始模型处理同属性赠送等级及高于人物等级部分的折减，成品值不再次处理',()=>{
  const a={category:'equipment',subtype:'jade',attributes:{jadeKind:'阳玉',dustRank:10,valuesStage:'initial',baseAttributes:[{kind:'伤害',value:10}],greenAttributes:[{kind:'伤害',value:5,perRank:2},{kind:'速度',value:6,perRank:1}]}}
  assert.equal(metric(a,'green:0:伤害',{...role,level:100}).value,26)
  assert.equal(metric(a,'green:1:速度',{...role,level:100}).value,16.5)
  a.attributes.valuesStage='finished'
  assert.equal(metric(a,'green:0:伤害').value,5)
})
test('固伤需显式启用，门派系数与NPC经脉条件单独说明，命中不会提高固伤',()=>{
  const a=weapon({greenAttributes:[{kind:'敏捷',value:20}]})
  assert.equal(metric(a,'contribution:fixed'),undefined)
  const who={...role,school:'女儿村',calculation:{fixedEnabled:true}}
  assert.equal(metric(a,'contribution:fixed',who).value,82)
  a.attributes.gem='红玛瑙';a.attributes.gemRank=5
  assert.equal(metric(a,'contribution:fixed',who).value,82)
  assert.equal(metric(a,'contribution:fixed',{...who,school:'龙宫'}).value,null)
  assert.equal(metric(a,'contribution:fixed',{...who,calculation:{fixedEnabled:true,fixedDamageRate:0.3,fixedAgilityRate:1}}).value,140)
})
test('初始值、成品口径、每级增量、混合镶嵌和角色系数完整恢复，成本不变',()=>{
  const data=ledger.roleLedger(ledger.demoLedger(),'demo-role-0')
  data.roles[0].race='immortal';data.roles[0].calculation={fixedEnabled:true,fixedDamageRate:0.24,magicDamageRate:0.25,powerRate:0.57}
  Object.assign(data.assets[0].attributes,{baseAttributes:[{kind:'伤害',value:400},{kind:'命中',value:450}],gem:'太阳石',gemRank:2,extraGem:'红玛瑙',extraGemRank:3,valuesStage:'initial',greenAttributes:[{kind:'魔力',value:20,perRank:0}]})
  assert.deepEqual(ledger.mergeRoleBackup(ledger.emptyLedger(),ledger.exportRoleBackup(data,data.roles[0].id)),data)
  assert.equal(ledger.summarize(data).total,700000)
  data.roles[0].calculation.magicDamageRate=-1;assert.throws(()=>ledger.validateLedger(data))
})

test('装备卡片按门派筛选且最多三项，切换关注不会改写角色或装备',()=>{
  const a=weapon({gem:'太阳石',gemRank:2,greenAttributes:[{kind:'力量',value:10},{kind:'魔力',value:20},{kind:'敏捷',value:20}]})
  const who={...role,school:'龙宫'}
  const before=JSON.stringify({a,who})
  const magic=display.equipmentCardMetrics(a,who)
  assert.equal(magic.find(m=>m.key==='weapon:magic').value,122)
  assert.ok(magic.length<=3); assert.ok(!magic.some(m=>m.label.includes('总伤') || m.label==='命中'))
  const physical=display.equipmentCardMetrics(a,who,'physical')
  assert.ok(physical.some(m=>m.key==='weapon:power'));assert.ok(!physical.some(m=>m.key==='weapon:magic'))
  const fixed=display.equipmentCardMetrics(a,{...who,school:'女儿村',calculation:{fixedEnabled:true}})
  assert.equal(fixed.find(m=>m.key==='contribution:fixed').value,84.88)
  assert.ok(fixed.some(m=>m.label==='敏捷'));assert.ok(!fixed.some(m=>m.key==='weapon:magic'))
  const pending=display.equipmentCardMetrics(a,{...who,school:'女儿村'})
  assert.equal(pending.find(m=>m.label==='强化后伤害').value,416)
  assert.ok(!pending.some(m=>m.key==='contribution:fixed'))
  assert.equal(JSON.stringify({a,who}),before)
})

test('卡片合计灵饰同名词条，未知强化保持未知，通用生存属性仍可见',()=>{
  const a={category:'equipment',subtype:'ornament',attributes:{slot:'耳饰',baseAttributes:[{kind:'法术伤害',value:20}],greenAttributes:[{kind:'法术伤害',value:10},{kind:'法术伤害',value:12},{kind:'气血',value:100}]}}
  const rows=display.equipmentCardMetrics(a,{...role,school:'龙宫'})
  assert.equal(rows.find(m=>m.label==='法术伤害').value,42)
  assert.equal(rows.find(m=>m.label==='气血').value,100)
  a.attributes.valuesStage='initial';a.attributes.starRank=3
  assert.equal(display.equipmentCardMetrics(a,{...role,school:'龙宫'}).find(m=>m.label==='法术伤害').value,null)
})

test('精简卡片名称使用物品和等级，不泄露自动名称中的全部属性；旧组合不生成单件摘要',()=>{
  const a=weapon({itemName:'碧血干戚',level:100});a.name='100级 碧血干戚 · 力量+10 / 魔力+20 · 初伤害400 · 太阳石2锻'
  assert.equal(display.equipmentCardTitle(a),'100级 碧血干戚')
  assert.equal(display.equipmentCardTitle({...a,category:'pet',name:'全力幻姬'}),'全力幻姬')
  assert.deepEqual(display.equipmentCardMetrics({...a,purchaseKind:'set'},role),[])
})
