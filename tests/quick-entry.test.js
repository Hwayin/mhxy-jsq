import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { ledger, ledgerModuleUrl } from '../scripts/load-ledger.mjs'
const catalogUrl='data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(await readFile(new URL('../lib/item-catalog.uts',import.meta.url),'utf8'))).toString('base64')
let source=stripTypeScriptTypes(await readFile(new URL('../lib/quick-entry.uts',import.meta.url),'utf8'))
source=source.replace("'./ledger.uts'",JSON.stringify(ledgerModuleUrl)).replace("'./item-catalog.uts'",JSON.stringify(catalogUrl))
const quick=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))
const form=extra=>({...quick.emptyQuickForm(),position:'头部',level:'100',amount:'128.90',...extra})

test('快速连续录入生成独立单件，保留共同选项，清空金额/名称/物品/备注，不复制上一件属性',()=>{
  const data=ledger.demoLedger(), before=JSON.stringify(data)
  const saved=form({date:'2026-10-12',note:'只属于头部'})
  const a=quick.buildQuickEntry(data,'demo-role-0',saved,'quick-head')
  assert.equal(a.asset.costCents,12890);assert.equal(a.asset.name,'100级 头部')
  const next=quick.continueQuickForm(a.data,'demo-role-0',saved)
  assert.equal(next.position,'项链');assert.equal(next.level,'100');assert.equal(next.date,'2026-10-12')
  for(const field of ['amount','name','itemId','note']) assert.equal(next[field],'')
  assert.throws(()=>quick.buildQuickEntry(a.data,'demo-role-0',next,'quick-empty'),/填写本件金额/)
  const b=quick.buildQuickEntry(a.data,'demo-role-0',{...next,amount:'55'},'quick-necklace')
  assert.equal(b.data.assets.length,data.assets.length+2)
  assert.equal(ledger.summarize(b.data).total,ledger.summarize(data).total+18390)
  assert.equal(JSON.stringify(data),before)
})
test('缺省等级与属性不伪造数值，明确 0 金额可保存，后续能完整编辑和备份恢复',()=>{
  const entry=quick.buildQuickEntry(ledger.demoLedger(),'demo-role-0',form({level:'',amount:'0'}),'quick-zero')
  assert.deepEqual(entry.asset.attributes,{slot:'头部'})
  const updated=ledger.putRecord(entry.data,'assets',{...entry.asset,attributes:{slot:'头部',level:100,baseAttributes:[{kind:'防御',value:100}],gem:'月亮石',gemRank:7}})
  assert.deepEqual(ledger.importBackup(ledger.exportBackup(updated)),updated)
})
test('随号参考价不重复计价，裸号与其他投入不可随号包含',()=>{
  const data=ledger.demoLedger()
  const entry=quick.buildQuickEntry(data,'demo-role-0',form({included:true}),'quick-included')
  assert.equal(ledger.summarize(entry.data).total,ledger.summarize(data).total)
  const bare=ledger.demoLedger();bare.roles[0].purchaseMode='bare';bare.assets=bare.assets.filter(a=>a.roleId!=='demo-role-0')
  assert.throws(()=>quick.buildQuickEntry(bare,'demo-role-0',form({included:true}),'quick-invalid'),/仅整号/)
  assert.throws(()=>quick.buildQuickEntry(data,'demo-role-0',{...quick.emptyQuickForm('other'),name:'点修',amount:'20',included:true},'quick-other'),/仅整号/)
})
test('官方物品匹配与单件部位约束保持，等级改变后不接受旧物品',()=>{
  const data=ledger.demoLedger(), weapon=form({position:'武器',itemId:'1550'})
  assert.equal(quick.buildQuickEntry(data,'demo-role-0',weapon,'quick-weapon').asset.attributes.itemName,'太极')
  for(const changes of [{position:'头部'},{level:'120'},{subtype:'ornament',position:'戒指'},{itemId:'../1550'}]) assert.throws(()=>quick.buildQuickEntry(data,'demo-role-0',{...weapon,...changes},'quick-bad'),/物品/)
  for(const changes of [{position:'装备套装'},{amount:''},{amount:'10.555'},{level:'-1'},{date:'2026-02-30'},{subtype:'unknown'}]) assert.throws(()=>quick.buildQuickEntry(data,'demo-role-0',form(changes),'quick-invalid'))
})
test('下一部位只依据当前角色和单件类型，忽略旧组合及其他角色，全部录入后允许同部位方案',()=>{
  const data=ledger.demoLedger()
  assert.equal(quick.nextQuickPosition(data,'demo-role-0','gear'),'头部')
  for(const position of ['头部','项链','衣服','腰带','鞋']) data.assets.push(quick.buildQuickEntry(data,'demo-role-0',form({position}),position).asset)
  assert.equal(quick.nextQuickPosition(data,'demo-role-0','gear','鞋'),'鞋')
  assert.equal(quick.nextQuickPosition(data,'demo-role-1','gear'),'头部')
  assert.equal(quick.nextQuickPosition(data,'demo-role-0','ornament'),'戒指')
})
test('灵饰、玉魄、召唤兽和其他投入都能快速录入，缺名称或角色删除被拒绝',()=>{
  let data=ledger.demoLedger()
  const rows=[form({subtype:'ornament',position:'戒指'}),form({subtype:'jade',position:'阳玉',level:''}),{...quick.emptyQuickForm('pet'),name:'画魂',amount:'20'},{...quick.emptyQuickForm('other'),name:'点修',amount:'30'}]
  for(const [i,row] of rows.entries()) data=quick.buildQuickEntry(data,'demo-role-0',row,'quick-'+i).data
  assert.equal(data.assets.at(-3).attributes.jadeKind,'阳玉')
  assert.equal(data.assets.at(-2).name,'画魂');assert.equal(data.assets.at(-1).name,'点修')
  assert.throws(()=>quick.buildQuickEntry(data,'demo-role-0',{...rows[2],name:''},'bad'),/名称/)
  assert.throws(()=>quick.buildQuickEntry(data,'deleted',rows[0],'bad'),/角色已删除/)
})
