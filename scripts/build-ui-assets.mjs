import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const { default: sharp } = await import(process.env.SHARP_MODULE ? pathToFileURL(process.env.SHARP_MODULE).href : 'sharp')
const dir = new URL('../static/ui/', import.meta.url)
await mkdir(dir, { recursive: true })
const paths = {
  overview: '<path d="M5 20V10h3v10M11 20V5h3v15M17 20V12h3v8"/>',
  accounts: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2Z"/>',
  backup: '<path d="M6 3h9l4 4v14H6Z"/><path d="M15 3v5h4M9 12h7M9 16h7"/>'
}
for (const [name, path] of Object.entries(paths)) {
  for (const [state, color] of [['normal', '#78847D'], ['active', '#287565']]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24"><g fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</g></svg>`
    await writeFile(new URL(name + '-' + state + '.png', dir), await sharp(Buffer.from(svg)).png().toBuffer())
  }
}
const cloud = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160"><g fill="none" stroke="#CFB87F" stroke-width="1.5" opacity=".28"><path d="M250 48H126c-27 0-30-34-5-39 20-5 34 12 24 26-5 8-22 7-22-4m127 35H139c-44 0-73-22-92-10-11 8-1 19 14 13m189 20H104c-31 0-35 27-15 29 13 2 18-13 8-18m153 39H137c-25 0-28-24-13-29 15-5 25 10 13 15M80 80H25m129 64H60"/></g></svg>'
await writeFile(new URL('cloud.png', dir), await sharp(Buffer.from(cloud)).png().toBuffer())
console.log('玉色主题导航图标与云纹已生成')
