import { readFile, writeFile, mkdir, stat, open, rename, unlink, access } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { UPDATE_REPO, MAX_APK_BYTES, redactCloudOutput, waitForCloud, validateTicket, validateRemoteUpdate, assertVersionForward, publishPreparedRelease } from './apk-release-publisher.mjs'

const root=fileURLToPath(new URL('../',import.meta.url))
const parseJson=text=>JSON.parse(text.replace(/^\uFEFF/,''))
const help=`用法：
  node scripts/publish-apk-update.mjs --ticket "云打包ticket" [--notes "更新说明.md"] [--dry-run]
  node scripts/publish-apk-update.mjs --apk "已下载.apk" [--dry-run]
  无 --ticket/--apk 时使用本项目脚本记录的最近一次云任务。
  --preflight 仅检查新版本发布条件，供 pack-android.ps1 -Publish 使用。
  --hbuilder "HBuilderX目录"  --timeout-minutes 40  --poll-seconds 20
  --source-sha "提交SHA" 用于核对本次云打包时锁定的源码。`
function argumentsFrom(argv) {
  const flags=new Set(['--dry-run','--preflight','--help'])
  const values=new Set(['--ticket','--apk','--notes','--hbuilder','--timeout-minutes','--poll-seconds','--source-sha'])
  const options={}
  for(let i=0;i<argv.length;i++) {
    const key=argv[i]
    if(flags.has(key)) options[key]=true
    else if(values.has(key) && argv[i+1] && !argv[i+1].startsWith('--')) options[key]=argv[++i]
    else throw Error('未知参数或缺少值：'+key+'\n'+help)
  }
  if(options['--ticket'] && options['--apk']) throw Error('--ticket 与 --apk 只能选一个')
  return options
}
async function command(exe,args,{allowFailure=false}={}) {
  const result=await new Promise((resolve,reject)=>{
    const child=spawn(exe,args,{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']})
    let stdout='',stderr=''
    child.stdout.on('data',b=>{stdout+=b});child.stderr.on('data',b=>{stderr+=b})
    child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}))
  })
  if(result.code!==0 && !allowFailure) throw Error(path.basename(exe)+' 执行失败：'+redactCloudOutput(result.stderr||result.stdout).trim())
  return result
}
async function github(endpoint,{allow404=false}={}) {
  const result=await command('gh',['api',endpoint],{allowFailure:true})
  let parsed
  try {parsed=JSON.parse(result.stdout)} catch {}
  if(result.code!==0) {
    if(allow404 && (String(parsed?.status)==='404' || /\(HTTP 404\)/.test(result.stderr))) return null
    throw Error('GitHub 请求失败，请确认 gh auth login 与仓库权限：'+redactCloudOutput(result.stderr||result.stdout).trim())
  }
  if(parsed==null) throw Error('GitHub 未返回有效 JSON')
  return parsed
}
async function jsonUrl(url) {
  const response=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'mhxy-apk-publisher','Cache-Control':'no-cache'}})
  if(response.status!==200) throw Error('无法读取更新描述，HTTP '+response.status)
  const text=await response.text()
  if(text.length>20000) throw Error('更新描述超出大小限制')
  return JSON.parse(text)
}
async function sha256(file) {
  const hash=createHash('sha256')
  for await(const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}
async function exists(file) {try{await access(file);return true}catch{return false}}
async function download(url,destination) {
  const part=destination+'.part'
  const response=await fetch(url,{signal:AbortSignal.timeout(300000),headers:{'User-Agent':'mhxy-apk-publisher'}})
  if(response.status!==200 || !response.body) throw Error('APK 下载失败，HTTP '+response.status)
  if(Number(response.headers.get('content-length'))>MAX_APK_BYTES) throw Error('APK 超过 512MB 限制')
  const file=await open(part,'w')
  let size=0,lastProgress=0
  try {
    for await(const chunk of response.body) {
      size+=chunk.length
      if(size>MAX_APK_BYTES) throw Error('APK 超过 512MB 限制')
      await file.writeFile(chunk)
      if(Date.now()-lastProgress>3000) {console.log('已下载 '+(size/1048576).toFixed(1)+' MB');lastProgress=Date.now()}
    }
  } catch(error) {await file.close();await unlink(part).catch(()=>{});throw error}
  await file.close()
  if(size<4) {await unlink(part);throw Error('APK 下载为空')}
  await unlink(destination).catch(error=>{if(error.code!=='ENOENT')throw error})
  await rename(part,destination)
}
async function main(options) {
  if(options['--help']) {console.log(help);return}
  const manifest=parseJson(await readFile(path.join(root,'manifest.json'),'utf8'))
  const profile=parseJson(await readFile(path.join(root,'release/android.json'),'utf8'))
  const identity=parseJson(await readFile(path.join(root,profile.certificateType==='cloud'?'release/android-update-identity.json':'release/android-signing-public.json'),'utf8'))
  const candidate={versionName:manifest.versionName,versionCode:Number(manifest.versionCode)}
  if(!/^\d+\.\d+\.\d+$/.test(candidate.versionName) || !Number.isInteger(candidate.versionCode) || candidate.versionCode<1 || candidate.versionCode>2147483647 || identity.appId!==manifest.appid || identity.packageName!==profile.packageName) throw Error('项目版本或更新身份配置不正确')
  const hx=path.resolve(options['--hbuilder']||path.join(process.env.USERPROFILE,'Desktop/HBuilderX'))
  const cli=path.join(hx,'cli.exe')
  await access(cli)
  const timeout=Number(options['--timeout-minutes']||40)*60000,poll=Number(options['--poll-seconds']||20)*1000
  if(!Number.isFinite(timeout) || timeout<60000 || timeout>7200000 || !Number.isFinite(poll) || poll<1000 || poll>60000) throw Error('等待时间应为 1～120 分钟，查询间隔应为 1～60 秒')
  const git=async args=>(await command('git',args)).stdout.trim()
  const origin=await git(['remote','get-url','origin'])
  if(!new RegExp('^(https://github\\.com/|git@github\\.com:)'+UPDATE_REPO+'(?:\\.git)?/?$','i').test(origin)) throw Error('Git origin 与客户端更新仓库不一致')
  const head=await git(['rev-parse','HEAD'])
  const assertSource=async()=>{
    if(await git(['status','--porcelain','--untracked-files=normal'])) throw Error('工作区有未提交修改，请先提交并推送本次源码，再自动发布')
    if(await git(['rev-parse','HEAD'])!==head) throw Error('等待期间源码提交已改变，停止发布；请核对本次 APK 后重新运行')
  }
  await assertSource()
  if(options['--source-sha'] && options['--source-sha']!==head) throw Error('源码与提交云打包时的 SHA 不一致，停止发布')
  const repo=await github('repos/'+UPDATE_REPO)
  if(repo.private || !repo.permissions?.push) throw Error('更新仓库必须公开，且 gh 登录账号需要发布权限')
  await github('repos/'+UPDATE_REPO+'/commits/'+head)
  const prefix='repos/'+UPDATE_REPO+'/releases'
  const updateFrom=async release=>{
    const asset=release.assets.find(a=>a.name==='update.json' && a.state==='uploaded')
    if(!asset || !asset.browser_download_url.startsWith(`https://github.com/${UPDATE_REPO}/releases/download/`)) throw Error('现有 Release 缺少有效 update.json，停止自动发布')
    return validateRemoteUpdate(await jsonUrl(asset.browser_download_url+'?t='+Date.now()),identity)
  }
  const latestUpdate=async()=>{const release=await github(prefix+'/latest',{allow404:true});return release?updateFrom(release):null}
  const latest=await latestUpdate()
  const releaseByTag=async tag=>{
    const byTag=await github(prefix+'/tags/'+tag,{allow404:true})
    if(byTag) return byTag
    // 新建草稿尚未创建 Git 标签，tags 端点可能 404；认证后的列表可读取草稿。
    for(let page=1;page<=5;page++) {
      const releases=await github(prefix+`?per_page=100&page=${page}`)
      const found=releases.find(release=>release.tag_name===tag)
      if(found) return found
      if(releases.length<100) return null
    }
    throw Error('无法完整核验已有草稿，停止创建重复 Release')
  }
  const notesOption=options['--notes']||((await exists(path.join(root,`release/notes-v${candidate.versionName}.md`)))?`release/notes-v${candidate.versionName}.md`:null)
  if(notesOption) {const notes=await readFile(path.resolve(root,notesOption),'utf8');if(notes.length>6000)throw Error('更新说明不能超过 6000 字符')}
  if(options['--preflight']) {
    assertVersionForward(candidate,latest)
    await mkdir(path.join(root,'.local'),{recursive:true})
    await writeFile(path.join(root,'.local/apk-publish-plan.json'),JSON.stringify({sourceSha:head,...candidate,repo:UPDATE_REPO},null,2)+'\n')
    console.log(`自动发布预检通过：${candidate.versionName} / ${candidate.versionCode}，源码 ${head.slice(0,7)} 已推送。`)
    return
  }
  assertVersionForward(candidate,latest,{allowEqual:true})
  let ticket=options['--ticket'],apk=options['--apk']?path.resolve(root,options['--apk']):null
  if(!ticket && !apk) {
    const receiptPath=path.join(root,'.local/android-cloud-last-task.json')
    if(!await exists(receiptPath)) throw Error('没有记录的云任务。使用 pack-android.ps1 -Submit -Publish，或指定 -Ticket / -Apk')
    const receipt=parseJson(await readFile(receiptPath,'utf8'))
    if(receipt.versionName!==candidate.versionName || receipt.versionCode!==candidate.versionCode || receipt.sourceSha!==head || receipt.sourceClean!==true) throw Error('最近云任务与当前版本/源码不同，请指定正确 -Ticket 或重新云打包')
    ticket=receipt.ticket
  }
  const out=path.join(root,'unpackage/update-release','v'+candidate.versionName)
  await mkdir(out,{recursive:true})
  if(ticket) {
    ticket=validateTicket(ticket)
    const receiptPath=path.join(root,'.local/android-cloud-last-task.json')
    if(await exists(receiptPath)) {
      const receipt=parseJson(await readFile(receiptPath,'utf8'))
      if(receipt.ticket===ticket && (receipt.sourceSha!==head || receipt.sourceClean!==true || receipt.versionCode!==candidate.versionCode)) throw Error('该云任务提交时的源码与当前不同或有未提交修改，停止发布')
    }
    const url=await waitForCloud({ticket,appId:manifest.appid,timeoutMs:timeout,pollMs:poll},{now:Date.now,sleep:ms=>new Promise(resolve=>setTimeout(resolve,ms)),log:console.log,status:async value=>(await command(cli,['pack','status','--project',root.replace(/[\\/]$/,''),'--ticket',value,'--json','true'])).stdout})
    apk=path.join(out,'cloud-'+ticket+'.apk')
    console.log('云构建成功，下载安装包…')
    await download(url,apk)
  }
  await assertSource()
  const prepareArgs=[path.join(root,'scripts/prepare-update-release.mjs'),'--apk',apk,'--hbuilder',hx]
  if(notesOption) prepareArgs.push('--notes',path.resolve(root,notesOption))
  console.log((await command(process.execPath,prepareArgs)).stdout.trim())
  const jsonPath=path.join(out,'update.json'),update=JSON.parse(await readFile(jsonPath,'utf8'))
  validateRemoteUpdate(update,identity)
  const prepared={update,apkName:`mhxy-ledger-${update.versionName}.apk`,apkPath:path.join(out,`mhxy-ledger-${update.versionName}.apk`),jsonPath,notesPath:path.join(out,'notes.md'),jsonSize:(await stat(jsonPath)).size,jsonHash:await sha256(jsonPath)}
  const gh=async args=>{await command('gh',args)}
  const result=await publishPreparedRelease(prepared,head,{
    log:console.log,latestUpdate,updateFrom,
    release:releaseByTag,
    createDraft:(tag,sha,notes)=>gh(['release','create',tag,'--repo',UPDATE_REPO,'--target',sha,'--title',tag,'--notes-file',notes,'--draft']),
    uploadDraft:(tag,files)=>gh(['release','upload',tag,...files,'--repo',UPDATE_REPO,'--clobber']),
    publishLatest:async tag=>{await assertSource();await gh(['release','edit',tag,'--repo',UPDATE_REPO,'--draft=false','--latest'])},
    verifyAnonymous:async item=>{
      const remote=validateRemoteUpdate(await jsonUrl(`https://github.com/${UPDATE_REPO}/releases/latest/download/update.json?t=${Date.now()}`),identity)
      if(remote.versionCode!==item.update.versionCode || remote.sha256!==item.update.sha256) throw Error('Release 已发布，但匿名 Latest 描述不一致，请检查发布状态')
      const downloaded=path.join(out,'published-verification.apk')
      await download(remote.url,downloaded)
      if((await stat(downloaded)).size!==remote.size || await sha256(downloaded)!==remote.sha256) throw Error('Release 已发布，但匿名下载校验未通过，请检查发布状态')
    }
  },{dryRun:options['--dry-run']===true})
  console.log(result.dryRun?'预演完成，未修改 GitHub Release。':'手机可在“备份 → 应用更新”检查新版。')
}
try {await main(argumentsFrom(process.argv.slice(2)))} catch(error) {console.error(redactCloudOutput(error.message));process.exitCode=1}
