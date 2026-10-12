import { cp, mkdir, mkdtemp } from 'node:fs/promises'
import path from 'node:path'

const foundation = ['app-common','app-runtime','breakpad-build','uts-runtime','ext-component','uni-dialogPage','uni-event','uni-crash','uni-getElementById','uni-pullDownRefresh','uni-storage','uni-exit','uni-theme','uni-getAppBaseInfo','uni-getDeviceInfo','uni-getSystemInfo','uni-getAccessibilityInfo','uni-getAppAuthorizeSetting','uni-getSystemSetting','uni-openAppAuthorizeSetting','uni-prompt','uni-rpx2px','uni-secure-network']

export function offlineResourcePlan(manifest, identity, exported) {
  if (!/^__UNI__[A-Z0-9]+$/.test(manifest.appid) || identity.appId !== manifest.appid || exported.id !== manifest.appid
      || exported.version?.name !== manifest.versionName || Number(exported.version?.code) !== Number(manifest.versionCode)
      || !/^\d+\.\d+\.\d+$/.test(manifest.versionName) || !Number.isSafeInteger(Number(manifest.versionCode)) || Number(manifest.versionCode) < 1
      || exported['uni-app-x']?.compilerVersion !== '5.26' || exported['uni-app-x']?.vapor !== true) {
    throw Error('Exported resources do not match current version / HBuilderX 5.26 Vapor')
  }
  const modules = exported['app-android']?.distribute?.modules
  if (!modules || typeof modules !== 'object' || Array.isArray(modules)) throw Error('Missing exported native modules')
  const names = Object.keys(modules)
  if (names.some(name => !/^uni-[a-zA-Z0-9]+$/.test(name))) throw Error('Invalid exported native module name')
  return {
    versionName: manifest.versionName, versionCode: Number(manifest.versionCode),
    appId: manifest.appid, packageName: identity.packageName,
    libraries: [...new Set([...foundation, ...names])].map(name => name + '-release.aar')
  }
}

// Each build gets a fresh snapshot: removed resources cannot survive in the next APK.
export async function stageOfflineAssets(resource, output, appId) {
  if (!/^__UNI__[A-Z0-9]+$/.test(appId)) throw Error('Invalid AppID')
  await mkdir(output, { recursive: true })
  const stage = await mkdtemp(path.join(output, 'build-'))
  const assetsDir = path.join(stage, 'assets'), resDir = path.join(stage, 'res')
  const www = path.join(assetsDir, 'apps', appId, 'www')
  await mkdir(www, { recursive: true })
  await cp(resource, www, { recursive: true })
  return { assetsDir, resDir }
}
