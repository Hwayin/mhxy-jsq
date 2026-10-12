// 从已核实的网易藏宝阁 PC 端公开图片地址生成离线图标，不执行远程脚本。
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { stripTypeScriptTypes } from 'node:module'
import { pathToFileURL } from 'node:url'
const { default: sharp } = await import(process.env.SHARP_MODULE ? pathToFileURL(process.env.SHARP_MODULE).href : 'sharp')
const source = await readFile(new URL('../lib/item-catalog.uts', import.meta.url), 'utf8')
const { EQUIPMENT_ITEMS } = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64'))
const output = new URL('../static/items/', import.meta.url)
await mkdir(output, { recursive: true })
const records = []
const missing = []
let previous = []
try { previous = JSON.parse(await readFile(new URL('manifest.json', output), 'utf8')).records } catch {}
let cursor = 0
async function fetchItem(item) {
  const target = new URL(item.id + '.png', output)
  const old = previous.find(record => record.id === item.id)
  if (old) {
    try {
      const png = await readFile(target)
      if (createHash('sha256').update(png).digest('hex') === old.pngSha256) { records.push(old); return }
    } catch {}
  }
  for (const path of ['images/big/', 'images/equip/small/']) {
    const url = 'https://cbg-xyq.res.netease.com/' + path + item.id + '.gif'
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
        if (!response.ok) break
        const bytes = Buffer.from(await response.arrayBuffer())
        const isGif = /^GIF8[79]a/.test(bytes.subarray(0, 6).toString())
        const isPng = bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
        if (!isGif && !isPng) throw new Error('不是 GIF / PNG 图片')
        const png = await sharp(bytes).png().toBuffer()
        const metadata = await sharp(png).metadata()
        if (!metadata.width || metadata.width < 20 || metadata.height < 20) throw new Error('图片尺寸异常')
        await writeFile(target, png)
        records.push({ id: item.id, name: item.name, source: url, width: metadata.width, height: metadata.height, sourceSha256: createHash('sha256').update(bytes).digest('hex'), pngSha256: createHash('sha256').update(png).digest('hex') })
        return
      } catch (error) {
        if (attempt === 1 && path.includes('small')) missing.push({ id: item.id, name: item.name, reason: error.message })
      }
    }
  }
  if (!missing.some(i => i.id === item.id)) missing.push({ id: item.id, name: item.name, reason: '官方图片地址未提供可用文件' })
}
await Promise.all(Array.from({ length: 6 }, async () => {
  while (cursor < EQUIPMENT_ITEMS.length) {
    const item = EQUIPMENT_ITEMS[cursor++]
    await fetchItem(item)
    if ((records.length + missing.length) % 50 === 0) console.log('已检查', records.length + missing.length, '/', EQUIPMENT_ITEMS.length)
  }
}))
records.sort((a,b) => Number(a.id) - Number(b.id))
await writeFile(new URL('manifest.json', output), JSON.stringify({ source: '网易梦幻西游电脑版藏宝阁', fetchedAt: new Date().toISOString(), conversion: '原始 GIF / PNG 无缩放转换为 PNG，GIF 取首帧，保留透明度；玉魄的 .gif 地址实际返回 PNG', records, missing }, null, 2) + '\n')
await writeFile(new URL('../lib/item-icon-ids.uts', import.meta.url), '// 由 scripts/fetch-item-icons.mjs 生成，来源详见 static/items/manifest.json。\nexport const ITEM_ICON_IDS: string[] = ' + JSON.stringify(records.map(i => i.id)) + '\n')
console.log(JSON.stringify({ total: EQUIPMENT_ITEMS.length, downloaded: records.length, missing }))
