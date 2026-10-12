import { readFile, mkdir, copyFile, writeFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { apkManifest } from './apk-metadata.mjs'

const root=fileURLToPath(new URL('../',import.meta.url))
const args=process.argv.slice(2)
const value=name=>{const at=args.indexOf(name);return at>=0 ? args[at+1] : null}
const parseJson=text=>JSON.parse(text.replace(/^\uFEFF/,''))
if (!value('--apk') || args.includes('--help')) {
  console.log('用法：node scripts/prepare-update-release.mjs --apk "云打包得到的.apk" --notes "更新说明.txt" [--hbuilder "HBuilderX目录"]')
  process.exit(args.includes('--help') ? 0 : 1)
}
try {
  const apk=path.resolve(value('--apk'))
  const manifest=parseJson(await readFile(path.join(root,'manifest.json'),'utf8'))
  const releaseProfile=parseJson(await readFile(path.join(root,'release/android.json'),'utf8'))
  const signing=parseJson(await readFile(path.join(root,releaseProfile.certificateType==='cloud' ? 'release/android-update-identity.json' : 'release/android-signing-public.json'),'utf8'))
  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(manifest.versionName) || !Number.isInteger(Number(manifest.versionCode)) || Number(manifest.versionCode)<1 || Number(manifest.versionCode)>2147483647 || manifest.appid!==signing.appId) throw Error('项目版本或 AppID 配置无效')
  const size=(await stat(apk)).size
  if (size<4 || size>536870912) throw Error('APK 大小超出支持范围')
  const actual=apkManifest(await readFile(apk))
  if (actual.package!==signing.packageName || actual.versionName!==manifest.versionName || actual.versionCode!==Number(manifest.versionCode)) throw Error('APK 包名或版本与当前项目不一致，请重新云打包：'+JSON.stringify(actual))
  const hx=path.resolve(value('--hbuilder') ?? path.join(process.env.USERPROFILE,'Desktop','HBuilderX'))
  const verified=execFileSync(path.join(hx,'plugins/amazon-corretto/bin/java.exe'),['-jar',path.join(hx,'plugins/app-safe-pack/apksigner.jar'),'verify','--print-certs',apk],{encoding:'utf8',maxBuffer:1048576,stdio:['ignore','pipe','pipe']})
  const certs=[...verified.matchAll(/Signer #\d+ certificate SHA-256 digest:\s*([a-fA-F0-9]+)/g)].map(m=>m[1].toLowerCase())
  if (certs.length!==1 || certs[0]!==signing.sha256.replaceAll(':','').toLowerCase()) throw Error('APK 签名与原安装版不一致，无法覆盖更新')
  const notes=value('--notes') ? (await readFile(path.resolve(value('--notes')),'utf8')).trim() : '优化体验与修复问题。'
  if (notes.length>6000) throw Error('更新说明不能超过 6000 字符')
  const hash=createHash('sha256')
  for await (const chunk of createReadStream(apk)) hash.update(chunk)
  const tag='v'+manifest.versionName, name='mhxy-ledger-'+manifest.versionName+'.apk'
  const update={type:'apk',platform:'android',appId:manifest.appid,packageName:actual.package,versionName:actual.versionName,versionCode:actual.versionCode,url:'https://github.com/Hwayin/mhxy-jsq/releases/download/'+tag+'/'+name,size,sha256:hash.digest('hex'),notes}
  const out=path.join(root,'unpackage/update-release',tag)
  await mkdir(out,{recursive:true})
  await copyFile(apk,path.join(out,name))
  await writeFile(path.join(out,'update.json'),JSON.stringify(update,null,2)+'\n')
  await writeFile(path.join(out,'notes.md'),notes+'\n')
  console.log('已验证 APK 版本、签名和 SHA-256。发布目录：'+out)
  console.log('GitHub Release 标签：'+tag+'；上传 '+name+' 与 update.json 两个附件，再发布为 Latest。')
} catch(e) {console.error(e.message);process.exitCode=1}
