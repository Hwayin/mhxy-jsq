import { readFile, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const root = new URL('../', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'))
const release = JSON.parse(await readFile(new URL('release/android.json', root), 'utf8'))
const profile = JSON.parse(await readFile(new URL('.local/android-cloud-pack.json', root), 'utf8'))
const expected = { hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
if (!manifest['uni-app-x'].vapor || manifest['uni-app-x']['vapor-render-target'] !== 'bytecode') throw new Error('Android 蒸汽模式字节码配置异常')
if (!/^__UNI__[A-Z0-9]+$/i.test(manifest.appid)) throw new Error('AppID 格式不正确')
if (manifest['app-android'].distribute.minSdkVersion !== release.minSdkVersion || release.minSdkVersion < 23 || manifest['app-android'].distribute.targetSdkVersion !== release.targetSdkVersion) throw new Error('蒸汽模式最低要求 Android 6.0 / API 23，请核对 SDK 配置')
if (JSON.stringify(manifest['app-android'].distribute.abiFilters) !== JSON.stringify(release.abiFilters)) throw new Error('CPU 架构配置不一致')
const cloud = release.certificateType === 'cloud'
if (profile.platform !== 'android' || profile.iscustom || profile.android.androidpacktype !== (cloud ? '3' : '0')) throw new Error('必须使用 Android 正式包与已安装版的证书类型')
if (profile.android.packagename !== release.packageName) throw new Error('包名不一致')
if (cloud) {
  const identity = JSON.parse(await readFile(new URL('release/android-update-identity.json',root),'utf8'))
  if (identity.appId!==manifest.appid || identity.packageName!==release.packageName || !/^[a-f0-9]{64}$/.test(identity.sha256)) throw new Error('已安装版的签名身份配置异常')
} else {
  if (profile.android.certalias !== release.certificateAlias || !profile.android.certpassword || profile.android.storePassword !== profile.android.certpassword) throw new Error('证书配置异常')
  await access(profile.android.certfile)
}
for (const [density, size] of Object.entries(expected)) {
  const path = manifest['app-android'].distribute.icons[density]
  if (!path || path.startsWith('/') || path.includes('..')) throw new Error('图标路径不正确')
  const png = await readFile(new URL(path, root))
  if (png.subarray(0,8).toString('hex') !== '89504e470d0a1a0a' || png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size) throw new Error('图标尺寸不正确：' + density)
}
const publicFiles = ['manifest.json','release/android.json','release/android-signing-public.json']
for (const path of publicFiles) if (profile.android.certpassword && (await readFile(new URL(path,root),'utf8')).includes(profile.android.certpassword)) throw new Error('签名密码误入公开配置：' + path)
console.log('打包配置检查通过：' + manifest.name + ' ' + manifest.versionName + '（' + manifest.versionCode + '），' + release.packageName)
console.log('正式 APK / '+(cloud ? '原云端证书' : '自有签名')+' / 32 位及 64 位 ARM / 图标路径及尺寸正确。')
console.log('本机配置：' + fileURLToPath(new URL('.local/android-cloud-pack.json', root)))
