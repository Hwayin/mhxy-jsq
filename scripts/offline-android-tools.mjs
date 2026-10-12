import { readFile, writeFile, mkdir, open, rename, cp, access } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { retryRead } from './apk-release-publisher.mjs'
import { offlineResourcePlan, stageOfflineAssets } from './offline-android-resources.mjs'

const root=fileURLToPath(new URL('../',import.meta.url))
const tools=path.join(root,'unpackage/android-toolchain')
const sdk=path.join(root,'unpackage/offline-android-sdk/sdk-5.26/Android-uni-app-x-vapor-SDK@101163-5.26')
const parseJson=text=>JSON.parse(text.replace(/^\uFEFF/,''))
async function exists(file){try{await access(file);return true}catch{return false}}
async function digest(file,algorithm='sha256'){const h=createHash(algorithm);for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex')}
async function textUrl(url){return retryRead(async()=>{const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('HTTP '+r.status+' '+url);return r.text()})}
async function download(url,file,expected,algorithm='sha256'){
  if(await exists(file)&&await digest(file,algorithm)===expected){console.log('Using verified cache: '+path.basename(file));return}
  await retryRead(async()=>{
    const response=await fetch(url,{signal:AbortSignal.timeout(600000)})
    if(!response.ok||!response.body)throw Error('Download HTTP '+response.status+' '+url)
    await mkdir(path.dirname(file),{recursive:true});const out=await open(file+'.part','w'),hash=createHash(algorithm)
    let size=0,last=0
    try{for await(const chunk of response.body){size+=chunk.length;if(size>1073741824)throw Error('Archive exceeds 1GB');hash.update(chunk);await out.writeFile(chunk);if(size-last>33554432){console.log(path.basename(file)+': '+(size/1048576).toFixed(1)+' MiB');last=size}}}finally{await out.close()}
    if(hash.digest('hex')!==expected)throw Error('Archive integrity mismatch: '+path.basename(file))
    await rename(file+'.part',file)
  })
}
async function extract(archive,target){
  if(!path.resolve(target).startsWith(path.join(root,'unpackage')+path.sep))throw Error('Extraction target outside workspace output')
  const helper=path.join(tools,'expand.ps1')
  await writeFile(helper,"param([string]$Archive,[string]$Target)\n$ErrorActionPreference = 'Stop'\nExpand-Archive -LiteralPath $Archive -DestinationPath $Target -Force\n")
  await new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',helper,'-Archive',archive,'-Target',target],{windowsHide:true,stdio:'inherit'});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error('Archive extraction failed')))})
}
async function setup(){
  await mkdir(tools,{recursive:true})
  const archive=path.join(root,'unpackage/offline-android-sdk/sdk-5.26.zip')
  const vendorUrl='https://web-ext-storage.dcloud.net.cn/uni-app-x/sdk/Android-Vapor/Android-uni-app-x-vapor-SDK@101163-5.26.zip'
  await download(vendorUrl,archive,'8613962af9b03789a4db29e42100887e83a996b69193407575d3c8143025727e')
  if(!await exists(path.join(sdk,'SDK/libs/app-runtime-release.aar')))await extract(archive,path.dirname(sdk))
  const repository=await textUrl('https://dl.google.com/android/repository/repository2-1.xml')
  const item=repository.match(/<remotePackage path="cmdline-tools;19\.0"[\s\S]*?<\/remotePackage>/)?.[0]
  const windows=[...(item??'').matchAll(/<archive>[\s\S]*?<\/archive>/g)].map(m=>m[0]).find(s=>s.includes('<host-os>windows</host-os>'))
  const url=windows?.match(/<url>([^<]+)<\/url>/)?.[1],hash=windows?.match(/<checksum[^>]*>([a-f0-9]{40})<\/checksum>/)?.[1]
  if(!url||!hash||!/^commandlinetools-win-\d+_latest\.zip$/.test(url))throw Error('Official cmdline-tools 19.0 package not found')
  const commandArchive=path.join(tools,'downloads',url)
  await download('https://dl.google.com/android/repository/'+url,commandArchive,hash,'sha1')
  const androidSdk=path.join(tools,'android-sdk'),cmd=path.join(androidSdk,'cmdline-tools/19.0')
  if(!await exists(path.join(cmd,'bin/sdkmanager.bat'))){const temp=path.join(tools,'commandline-extracted');await extract(commandArchive,temp);await cp(path.join(temp,'cmdline-tools'),cmd,{recursive:true})}
  const gradleUrl='https://downloads.gradle.org/distributions/gradle-9.2.1-bin.zip'
  const gradleHash=(await textUrl(gradleUrl+'.sha256')).trim()
  if(!/^[a-f0-9]{64}$/.test(gradleHash))throw Error('Invalid official Gradle checksum')
  const gradleArchive=path.join(tools,'downloads/gradle-9.2.1-bin.zip')
  await download(gradleUrl,gradleArchive,gradleHash)
  if(!await exists(path.join(tools,'gradle-9.2.1/bin/gradle.bat')))await extract(gradleArchive,tools)
  const javaCache=path.join(tools,'java-package.json')
  let javaPackage
  if(await exists(javaCache))javaPackage=parseJson(await readFile(javaCache,'utf8'))
  else {
    const assets=JSON.parse(await textUrl('https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse'))
    javaPackage={...assets[0].binary.package,version:assets[0].version.semver}
    await writeFile(javaCache,JSON.stringify(javaPackage,null,2)+'\n')
  }
  if(!javaPackage.link.startsWith('https://github.com/adoptium/temurin21-binaries/releases/download/')||!/^OpenJDK21U-jdk_x64_windows_hotspot_[\d._]+\.zip$/.test(javaPackage.name)||!/^[a-f0-9]{64}$/.test(javaPackage.checksum))throw Error('Unexpected official Java 21 package')
  const javaArchive=path.join(tools,'downloads',javaPackage.name),javaDir=path.join(tools,'java')
  await download(javaPackage.link,javaArchive,javaPackage.checksum)
  const {readdir}=await import('node:fs/promises')
  let javaFolders=await exists(javaDir)?await readdir(javaDir):[]
  if(!javaFolders.some(name=>name.startsWith('jdk-21.'))){await extract(javaArchive,javaDir);javaFolders=await readdir(javaDir)}
  const javaHome=path.join(javaDir,javaFolders.find(name=>name.startsWith('jdk-21.'))??'missing')
  await access(path.join(javaHome,'bin/java.exe'))
  await writeFile(path.join(tools,'toolchain.json'),JSON.stringify({androidSdk,gradle:path.join(tools,'gradle-9.2.1/bin/gradle.bat'),sdk,javaHome,gradleHash,commandline:{url,sha1:hash},java:{version:javaPackage.version,sha256:javaPackage.checksum,url:javaPackage.link}},null,2)+'\n')
  console.log('Verified local toolchain downloaded. Install Android API 36 and build-tools 36.0.0 with setup-offline-android.ps1.')
}
async function prepare(){
  const manifest=parseJson(await readFile(path.join(root,'manifest.json'),'utf8')),identity=parseJson(await readFile(path.join(root,'release/android-update-identity.json'),'utf8'))
  const resource=path.join(root,'unpackage/resources/app-android',manifest.appid,'www')
  const exported=parseJson(await readFile(path.join(resource,'manifest.json'),'utf8'))
  const plan=offlineResourcePlan(manifest,identity,exported),libraries=plan.libraries
  for(const name of libraries)await access(path.join(sdk,'SDK/libs',name))
  const out=path.join(root,'unpackage/offline-android')
  const {assetsDir,resDir}=await stageOfflineAssets(resource,out,manifest.appid)
  const xmlEscape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')
  await mkdir(path.join(resDir,'values'),{recursive:true})
  await writeFile(path.join(resDir,'values/strings.xml'),'<?xml version="1.0" encoding="utf-8"?>\n<resources><string name="app_name">'+xmlEscape(manifest.name)+'</string></resources>\n')
  for(const [density,file] of Object.entries(manifest['app-android'].distribute.icons)){
    if(!['hdpi','xhdpi','xxhdpi','xxxhdpi'].includes(density)||file.includes('..'))throw Error('Invalid launcher icon')
    const target=path.join(resDir,'mipmap-'+density);await mkdir(target,{recursive:true});await cp(path.join(root,file),path.join(target,'ic_launcher.png'))
  }
  const androidSdk=path.join(tools,'android-sdk')
  await writeFile(path.join(root,'android-offline/local.properties'),'sdk.dir='+androidSdk.replaceAll('\\','/')+'\ndcloud.sdk.dir='+sdk.replaceAll('\\','/')+'\n')
  await writeFile(path.join(out,'prepared.json'),JSON.stringify({...plan,assetsDir,resDir},null,2)+'\n')
  console.log('Offline resources prepared: '+manifest.versionName+' / '+manifest.versionCode+'; '+libraries.length+' native libraries.')
}
try{if(process.argv.includes('--setup'))await setup();else if(process.argv.includes('--prepare'))await prepare();else throw Error('Use --setup or --prepare')}catch(error){console.error(error.message);process.exitCode=1}
