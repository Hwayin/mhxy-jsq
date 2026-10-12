// 优先使用玉色账本设计原图，统一生成 Android / Web 尺寸；旧 SVG 作为回退。
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const require = createRequire(process.env.ICON_NODE_MODULE_ROOT ? process.env.ICON_NODE_MODULE_ROOT + '/package.json' : process.env.USERPROFILE.replaceAll('\\', '/') + '/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const sharp = require('sharp')
const root = new URL('../', import.meta.url)
const dir = new URL('static/app-icons/', root)
await mkdir(dir, { recursive: true })
let generated = null
try { generated = await readFile(new URL('jade-ledger-v1-source.png', dir)) }
catch (error) { if (error.code !== 'ENOENT') throw error }
const original = generated ? null : await readFile(new URL('static/favicon.svg', root), 'utf8')
// 桌面图标采用不透明方形底色，圆角由 Android 桌面裁切。
const source = generated || Buffer.from(original.replace('rx="16"', 'rx="0"'))
const prefix = generated ? 'jade-ledger-v1-' : 'icon-'
const icons = {}
for (const [density, size] of [['hdpi',72],['xhdpi',96],['xxhdpi',144],['xxxhdpi',192],['store',512],['master',1024],['browser',64]]) {
  const name = prefix + size + '.png'
  await sharp(source).resize(size, size).flatten({ background: '#5266df' }).png().toFile(fileURLToPath(new URL(name, dir)))
  if (['hdpi','xhdpi','xxhdpi','xxxhdpi'].includes(density)) icons[density] = 'static/app-icons/' + name
}
const manifestPath = new URL('manifest.json', root)
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const release = JSON.parse(await readFile(new URL('release/android.json', root), 'utf8'))
manifest['app-android'].distribute.icons = icons
manifest['app-android'].distribute.abiFilters = release.abiFilters
manifest['app-android'].distribute.minSdkVersion = release.minSdkVersion
manifest['app-android'].distribute.targetSdkVersion = release.targetSdkVersion
manifest['app-android'].distribute.splashScreens.background = '#f7f8fc'
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log('图标已生成并配置：Android 72 / 96 / 144 / 192 px，主图 1024 px，商店 512 px，Web 64 px。')
