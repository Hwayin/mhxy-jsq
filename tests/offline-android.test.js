import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, access, unlink, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { offlineResourcePlan, stageOfflineAssets } from '../scripts/offline-android-resources.mjs'

const manifest = { appid: '__UNI__A9783A2', versionName: '0.8.2', versionCode: '802' }
const identity = { appId: manifest.appid, packageName: 'uni.app.UNIA9783A2' }
const exported = { id: manifest.appid, version: { name: '0.8.2', code: 802 }, 'uni-app-x': { compilerVersion: '5.26', vapor: true }, 'app-android': { distribute: { modules: { 'uni-storage': {}, 'uni-installApk': {}, 'uni-fileSystemManager': {} } } } }

test('离线打包拒绝旧版本、错 AppID、不同编译器与缺失原生模块', () => {
  const plan = offlineResourcePlan(manifest, identity, exported)
  assert.equal(plan.packageName, identity.packageName)
  assert.equal(plan.libraries.filter(name => name === 'uni-storage-release.aar').length, 1)
  assert.ok(plan.libraries.includes('uni-installApk-release.aar'))
  const changes = [
    { id: '__UNI__OTHER' }, { version: { name: '0.8.1', code: 801 } },
    { version: { name: '0.8.2', code: 801 } }, { 'uni-app-x': { compilerVersion: '5.25', vapor: true } },
    { 'uni-app-x': { compilerVersion: '5.26', vapor: false } }, { 'app-android': {} },
    { 'app-android': { distribute: { modules: { '../other': {} } } } }
  ]
  for (const change of changes) assert.throws(() => offlineResourcePlan(manifest, identity, { ...exported, ...change }))
  assert.throws(() => offlineResourcePlan(manifest, { ...identity, appId: '__UNI__OTHER' }, exported))
})

test('5.26 导出仅标记 uni-prompt 时仍打入独立菜单与确认弹窗桥接库', () => {
  const resource = { ...exported, 'app-android': { distribute: { modules: { 'uni-prompt': {} } } } }
  const plan = offlineResourcePlan(manifest, identity, resource)
  for (const name of ['uni-prompt', 'uni-dialogPage', 'uni-actionSheet', 'uni-modal']) {
    assert.equal(plan.libraries.filter(file => file === name + '-release.aar').length, 1)
  }
})

test('连续构建使用独立资源快照，已删除的物品/脚本不会进入下一安装包', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'mhxy-offline-test-'))
  try {
    const resource = path.join(temp, 'resource'), output = path.join(temp, 'output')
    await mkdir(resource)
    await writeFile(path.join(resource, 'app-service.js'), 'first')
    await writeFile(path.join(resource, 'removed.png'), 'old')
    const first = await stageOfflineAssets(resource, output, manifest.appid)
    await unlink(path.join(resource, 'removed.png'))
    await writeFile(path.join(resource, 'app-service.js'), 'second')
    const second = await stageOfflineAssets(resource, output, manifest.appid)
    const www = snapshot => path.join(snapshot.assetsDir, 'apps', manifest.appid, 'www')
    assert.notEqual(first.assetsDir, second.assetsDir)
    assert.equal(await readFile(path.join(www(first), 'app-service.js'), 'utf8'), 'first')
    assert.equal(await readFile(path.join(www(second), 'app-service.js'), 'utf8'), 'second')
    await assert.rejects(access(path.join(www(second), 'removed.png')), { code: 'ENOENT' })
    await assert.rejects(stageOfflineAssets(resource, output, '../other'))
  } finally {
    const resolved = path.resolve(temp)
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep + 'mhxy-offline-test-'))
    await rm(resolved, { recursive: true, force: true })
  }
})
