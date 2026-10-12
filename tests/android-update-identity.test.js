import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
const readJson=async file=>JSON.parse(await readFile(new URL('../'+file,import.meta.url),'utf8'))
const [manifest,android,identity]=await Promise.all(['manifest.json','release/android.json','release/android-update-identity.json'].map(readJson))
const source=stripTypeScriptTypes(await readFile(new URL('../lib/update-model.uts',import.meta.url),'utf8'))
const model=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))
test('客户端更新识别、云打包与已安装 APK 的真实身份保持一致',()=>{
  assert.equal(model.UPDATE_PACKAGE,identity.packageName)
  assert.equal(android.packageName,identity.packageName)
  assert.equal(model.UPDATE_APP_ID,identity.appId)
  assert.equal(manifest.appid,identity.appId)
  assert.equal(android.certificateType,'cloud')
  assert.equal(identity.certificateType,'cloud')
  assert.match(identity.sha256,/^[a-f0-9]{64}$/)
  assert.match(identity.sha1,/^[a-f0-9]{40}$/)
  assert.equal(identity.baselineVersionCode,700)
})
