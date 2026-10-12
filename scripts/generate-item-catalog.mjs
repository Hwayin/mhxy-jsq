// 只解析网易公开名称及等级配置，生成离线选择表；不执行远程 JS。
import { readFile, writeFile } from 'node:fs/promises'
const raw = await readFile(new URL('../unpackage/references/game_auto_config.js', import.meta.url), 'utf8')
const data = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
const kinds = new Map(data.weapon_armors.map(([id, name]) => [String(id), name]))
const items = new Map()
function add(id, name, subtype, slot, kind, level) {
  const key = String(id)
  if (!items.has(key)) items.set(key, { id: key, name, subtype, slot, kind, levels: [] })
  const item = items.get(key)
  if (level != null && !item.levels.includes(level)) item.levels.push(level)
}
for (const [key, rows] of Object.entries(data.wjd_equip_equip_type)) {
  const [level, kind] = key.split('_')
  for (const row of rows) add(row.value, row.label, 'gear', '武器', kinds.get(kind) || '武器', Number(level))
}
const weaponPrefixes = { 10:'剑',11:'刀',12:'锤',13:'爪刺',14:'斧',15:'扇',16:'枪',17:'鞭',18:'魔棒',19:'飘带',20:'双环',21:'双剑',22:'法杖',23:'宝珠',24:'弓',310:'巨剑',312:'灯笼',313:'伞' }
for (const [id, item] of Object.entries(data.equip_info)) {
  const number = Number(id)
  const match = item.desc.match(/【装备条件】\s*等级\s*(\d+)/)
  const level = match ? Number(match[1]) : null
  if ((number >= 1000 && number < 2500) || (number >= 31000 && number < 31400 && weaponPrefixes[Math.floor(number / 100)])) {
    if (level != null || items.has(id)) add(id, item.name, 'gear', '武器', weaponPrefixes[Math.floor(number / 100)] || '武器', level)
  } else if (number >= 2500 && number < 3000 && level != null) {
    const prefix = Math.floor(number / 100)
    const slot = {25:'头部',26:'衣服',27:'鞋',28:'项链',29:'腰带'}[prefix]
    const female = /【装备角色】\s*女/.test(item.desc)
    const kind = prefix === 25 ? female ? '发钗' : '头盔' : prefix === 26 ? female ? '女衣' : '铠甲' : slot
    add(id, item.name, 'gear', slot, kind, level)
  } else if (number >= 27000 && number < 27400 && level != null) {
    const slot = item.desc.match(/【类型】(戒指|耳饰|手镯|佩饰)/)?.[1]
    if (slot) add(id, item.name, 'ornament', slot, slot, level)
  } else if (/^上古玉魄·[阴阳]$/.test(item.name)) {
    const slot = item.name.endsWith('阳') ? '阳玉' : '阴玉'
    add(id, item.name, 'jade', slot, slot, null)
  }
}
const catalog = [...items.values()].map(i => ({ ...i, levels: i.levels.sort((a,b) => a-b) }))
if (catalog.length < 400 || !catalog.some(i => i.name === '金麟绕') || !catalog.some(i => i.name === '金蚕丝裙')) throw new Error('物品目录提取异常')
await writeFile(new URL('../lib/item-catalog.uts', import.meta.url), '// 网易公开物品配置离线名称表，读取于 2026-10-08。来源见 docs/equipment-details.md。\nexport type EquipmentItem = { id: string; name: string; subtype: string; slot: string; kind: string; levels: number[] }\nexport const EQUIPMENT_ITEMS: EquipmentItem[] = ' + JSON.stringify(catalog, null, 2) + '\n')
console.log(JSON.stringify({ items: catalog.length, gear: catalog.filter(i => i.subtype === 'gear').length, ornament: catalog.filter(i => i.subtype === 'ornament').length, jade: catalog.filter(i => i.subtype === 'jade').length }))
