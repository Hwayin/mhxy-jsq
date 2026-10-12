import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { stripTypeScriptTypes } from 'node:module'

async function moduleUrl(file) { return 'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(await readFile(new URL(file, import.meta.url), 'utf8'))).toString('base64') }
const catalogUrl = await moduleUrl('../lib/item-catalog.uts')
const idsUrl = await moduleUrl('../lib/item-icon-ids.uts')
const { EQUIPMENT_ITEMS } = await import(catalogUrl)
let source = stripTypeScriptTypes(await readFile(new URL('../lib/item-icons.uts', import.meta.url), 'utf8'))
source = source.replace('./item-catalog.uts', catalogUrl).replace('./item-icon-ids.uts', idsUrl)
const { itemIconSource } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
const manifest = JSON.parse(await readFile(new URL('../static/items/manifest.json', import.meta.url), 'utf8'))

test('现有目录的全部物品都有可校验的网易来源 PNG 图标', async () => {
  assert.equal(manifest.records.length, EQUIPMENT_ITEMS.length)
  assert.equal(manifest.missing.length, 0)
  assert.equal(new Set(manifest.records.map(item => item.id)).size, EQUIPMENT_ITEMS.length)
  for (const item of EQUIPMENT_ITEMS) {
    const record = manifest.records.find(row => row.id === item.id)
    assert.equal(record.name, item.name)
    assert.equal(new URL(record.source).hostname, 'cbg-xyq.res.netease.com')
    const bytes = await readFile(new URL('../static/items/' + item.id + '.png', import.meta.url))
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.pngSha256)
  }
})

test('图标按已下载 ID 和精确名称解析，不猜测通用部位', () => {
  assert.equal(itemIconSource('1550'), '/static/items/1550.png')
  assert.equal(itemIconSource('', '太极'), '/static/items/1550.png')
  assert.equal(itemIconSource('', '100级 武器'), '')
  assert.equal(itemIconSource('', '武器'), '')
})

test('未知或包含路径的 ID 不会加载任意文件，玉魄格式差异已覆盖', () => {
  for (const id of ['../secret', '/etc/passwd', 'https://example.com/a.png', 'unknown']) assert.equal(itemIconSource(id), '')
  assert.equal(itemIconSource('61718'), '/static/items/61718.png')
  assert.equal(itemIconSource('61717'), '/static/items/61717.png')
})
