// 本机生成并验证签名；不会提交云打包，不会输出密码或覆盖已有证书。
import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { randomBytes, X509Certificate } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
const root = fileURLToPath(new URL('../', import.meta.url))
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'))
const release = JSON.parse(await readFile(join(root, 'release/android.json'), 'utf8'))
if (!/^__UNI__[A-Z0-9]+$/i.test(manifest.appid)) throw new Error('请先在 HBuilderX 配置有效 AppID')
if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*){2,}$/.test(release.packageName)) throw new Error('Android 包名格式不正确')
if (!/^[a-z0-9]+$/i.test(release.certificateAlias)) throw new Error('证书别名应为英文字母或数字')
if (release.format !== 'apk') throw new Error('当前脚本仅配置 APK')
// 用户已安装的 0.7.0 使用 DCloud 云端证书，覆盖更新须延续该证书；本机自有证书保留作备份。
if (release.certificateType === 'cloud') {
  const identity = JSON.parse(await readFile(join(root,'release/android-update-identity.json'),'utf8'))
  if (identity.appId!==manifest.appid || identity.packageName!==release.packageName || identity.certificateType!=='cloud') throw new Error('已安装版身份配置不匹配')
  await mkdir(join(root,'.local'),{recursive:true})
  await writeFile(join(root,'.local/android-cloud-pack.json'),JSON.stringify({
    project:root.replaceAll('\\','/').replace(/\/$/,''),platform:'android',iscustom:false,sourceMap:false,splashads:false,unimpads:false,
    android:{packagename:release.packageName,androidpacktype:'3',channels:''}
  },null,2)+'\n')
  console.log('Android 云端证书配置通过：'+release.packageName+'，沿用已安装 0.7.0 的 AppID 与云端证书。')
  console.log('本机自有证书及密码保持原文件；本次云打包不使用它们。')
  process.exit(0)
}
const signing = join(root, '.local', 'signing')
const keystore = join(signing, 'mhxy-ledger-release.keystore')
const passwordFile = join(signing, 'password.txt')
const keytool = process.env.ANDROID_KEYTOOL || join(process.env.USERPROFILE, 'Desktop/HBuilderX/plugins/amazon-corretto/bin/keytool.exe')
await access(keytool)
await mkdir(signing, { recursive: true })
const exists = async path => { try { await access(path); return true } catch { return false } }
if (await exists(keystore)) {
  if (!await exists(passwordFile)) throw new Error('已有证书缺少密码文件，停止生成以保留原证书')
} else {
  if (await exists(passwordFile)) throw new Error('已有密码文件但缺少证书，请核对本机签名备份')
  await writeFile(passwordFile, randomBytes(24).toString('base64url'), { flag: 'wx' })
  const result = spawnSync(keytool, ['-genkeypair', '-storetype', 'JKS', '-keystore', keystore, '-storepass:file', passwordFile, '-keypass:file', passwordFile, '-alias', release.certificateAlias, '-keyalg', 'RSA', '-keysize', '2048', '-sigalg', 'SHA256withRSA', '-validity', '36500', '-dname', 'CN=MHXY Cost Ledger, O=MHXY Cost Ledger, C=CN', '-noprompt'], { windowsHide: true, encoding: 'utf8' })
  if (result.status !== 0) throw new Error('生成签名证书失败，请核对 keytool 环境；已生成的密码文件保留在本机')
}
const validation = spawnSync(keytool, ['-list', '-keystore', keystore, '-storepass:file', passwordFile, '-alias', release.certificateAlias], { windowsHide: true, encoding: 'utf8' })
if (validation.status !== 0 || !/PrivateKeyEntry/.test(validation.stdout)) throw new Error('签名证书别名、密码或私钥验证失败')
const keyValidation = spawnSync(keytool, ['-certreq', '-keystore', keystore, '-storepass:file', passwordFile, '-keypass:file', passwordFile, '-alias', release.certificateAlias], { windowsHide: true })
if (keyValidation.status !== 0) throw new Error('签名私钥密码验证失败')
const exported = spawnSync(keytool, ['-exportcert', '-keystore', keystore, '-storepass:file', passwordFile, '-alias', release.certificateAlias], { windowsHide: true })
if (exported.status !== 0) throw new Error('读取证书公钥失败')
const certificate = new X509Certificate(exported.stdout)
if (new Date(certificate.validTo).getTime() <= Date.now()) throw new Error('签名证书已过期')
const password = (await readFile(passwordFile, 'utf8')).trim()
if (password.length < 12) throw new Error('签名密码文件格式异常')
await writeFile(join(root, '.local/android-cloud-pack.json'), JSON.stringify({
  project: root.replaceAll('\\', '/').replace(/\/$/, ''), platform: 'android', iscustom: false, sourceMap: false, splashads: false, unimpads: false,
  android: { packagename: release.packageName, androidpacktype: '0', certalias: release.certificateAlias, certfile: keystore.replaceAll('\\', '/'), certpassword: password, storePassword: password, channels: '' }
}, null, 2) + '\n')
await writeFile(join(root, '.local/android-signing.json'), JSON.stringify({ appId: manifest.appid, packageName: release.packageName, alias: release.certificateAlias, keystore, passwordFile, cloudConfig: join(root, '.local/android-cloud-pack.json') }, null, 2) + '\n')
await writeFile(join(root, 'release/android-signing-public.json'), JSON.stringify({ appId: manifest.appid, packageName: release.packageName, alias: release.certificateAlias, subject: certificate.subject, sha1: certificate.fingerprint, sha256: certificate.fingerprint256, validFrom: certificate.validFrom, validTo: certificate.validTo, keyAlgorithm: certificate.publicKey.asymmetricKeyType, keyBits: certificate.publicKey.asymmetricKeyDetails.modulusLength }, null, 2) + '\n')
console.log('Android 签名验证通过：' + release.packageName + '，别名 ' + release.certificateAlias)
console.log('证书与密码：.local/signing/；本机云打包配置：.local/android-cloud-pack.json')
console.log('已有证书不会重新生成，密码未写入 manifest.json 或公开配置。')
