// 从已下载的网易公开配置提取名称；只解析 JSON，不执行远程 JavaScript。
import { readFile, writeFile } from 'node:fs/promises'
const raw = await readFile(new URL('../unpackage/references/game_auto_config.js', import.meta.url), 'utf8')
const config = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
const html = await readFile(new URL('../unpackage/references/ambush.html', import.meta.url), 'utf8')
const choices = (names, group = '') => names.filter(n => typeof n === 'string').map(value => ({ value, label: value, group }))
const sets = []
for (const [key, group] of [['suit_transform_skills', '变身术'], ['suit_transform_charms', '变化咒'], ['suit_added_status', '附加状态'], ['suit_append_skills', '追加法术']]) {
  for (const name of Object.values(config[key])) sets.push({ value: group + '之' + name, label: group + '之' + name, group })
}
const spells = []
for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
  const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => c[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim())
  if (cells.length !== 3 || cells[0] === '门派') continue
  const skill = cells[2].replace(/（[^）]*）/g, '').trim()
  const value = '奇袭法术：' + skill
  const group = '法术·' + cells[0]
  if (!spells.some(s => s.value === value && s.group === group)) spells.push({ value, label: skill, group })
}
if (spells.length < 100 || sets.length < 100) throw new Error('官方名称提取不完整')
const exports = {
  GEMS: choices(['光芒石','太阳石','月亮石','红宝石','黄宝石','蓝宝石','绿宝石','黑宝石','红玛瑙','舍利子','神秘石','翡翠石']),
  SET_EFFECTS: sets,
  SPECIAL_SKILLS: choices(config.equip_special_skills.map(row => row[1])),
  SPECIAL_EFFECTS: choices(Object.values(config.equip_special_effect)),
  BELL_SETS: choices(config.lingshi_suit_effects),
  JADE_EFFECTS: choices(Object.values(config.minghun_effect)),
  AMBUSH_SKILLS: [...spells, ...Object.values(config.minghun_teji).map(n => ({ value: '奇袭特技：' + n, label: n, group: '特技' })), ...Object.values(config.minghun_daoju).map(n => ({ value: '奇袭道具：' + n, label: n, group: '道具' }))]
}
let source = '// 离线选项，2026-10-08 依据网易官方藏宝阁配置及奇袭法术表整理。\n// 来源与更新方法见 docs/equipment-management.md。\nexport type EquipmentChoice = { value: string; label: string; group: string }\n'
for (const [key, value] of Object.entries(exports)) source += `export const ${key}: EquipmentChoice[] = ${JSON.stringify(value, null, 2)}\n`
source += `export function choices(names: string[]): EquipmentChoice[] { return names.map(value => ({ value, label: value, group: '' })) }\nexport function ranks(max: number): EquipmentChoice[] { return choices(Array.from({ length: max + 1 }, (_, i) => String(i))).map(c => ({ ...c, label: c.value + '锻' })) }\n`
await writeFile(new URL('../lib/equipment-options.uts', import.meta.url), source)
console.log(Object.fromEntries(Object.entries(exports).map(([key, value]) => [key, value.length])))
