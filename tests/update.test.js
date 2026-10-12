import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

const urls = {}
async function moduleUrl(name) {
  if (urls[name]) return urls[name]
  let source = stripTypeScriptTypes(await readFile(new URL('../lib/' + name + '.uts',import.meta.url),'utf8'))
  for (const match of [...source.matchAll(/from '(\.\/([^']+)\.uts)'/g)]) source = source.replaceAll("'"+match[1]+"'",JSON.stringify(await moduleUrl(match[2])))
  return urls[name] = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
}
const { Sha256 } = await import(await moduleUrl('sha256'))
const { parseApkRelease, newerRelease } = await import(await moduleUrl('update-model'))
const { createUpdateController } = await import(await moduleUrl('update-controller'))
const apk = Buffer.concat([Buffer.from([80,75,3,4]),randomBytes(150000)])
const release = { type:'apk', platform:'android', appId:'__UNI__A9783A2', packageName:'com.mhxy.costledger', versionName:'0.8.0', versionCode:800, url:'https://github.com/Hwayin/mhxy-jsq/releases/download/v0.8.0/mhxy-ledger-0.8.0.apk', size:apk.length, sha256:createHash('sha256').update(apk).digest('hex'), notes:'更新说明' }

test('流式 SHA256 与标准实现一致，覆盖空输入、填充边界和跨块数据',()=>{
  for (const length of [0,1,55,56,63,64,65,127,128,129,1000000]) {
    const bytes = randomBytes(length), hash = new Sha256()
    for (let i=0;i<length;i+=137) hash.update(bytes.subarray(i,i+137))
    assert.equal(hash.digest(),createHash('sha256').update(bytes).digest('hex'))
  }
})
test('只按安装版本数字判断升级，不允许同版本和降级',()=>{
  assert.equal(newerRelease(parseApkRelease(release),700),true)
  assert.equal(newerRelease(release,800),false)
  assert.equal(newerRelease(release,900),false)
  assert.throws(()=>newerRelease(release,NaN))
})
test('拒绝其他应用、任意下载地址和无效大小/摘要/版本',()=>{
  for (const changes of [{type:'wgt'},{packageName:'other.app'},{appId:'other'}, {versionCode:'800'}, {versionCode:Infinity},{versionCode:-1},{size:1},{size:536870913},{sha256:'fake'}, {notes:10}, {url:'http://github.com/Hwayin/mhxy-jsq/releases/download/v1/app.apk'}, {url:release.url+'?redirect=1'}, {url:release.url.replace('Hwayin','evil')}, {url:release.url.replace('app.apk','../app.apk')+'../bad'}]) assert.throws(()=>parseApkRelease({...release,...changes}))
})

function fixture(bytes=apk) {
  const state={phase:'idle',currentName:'0.7.0',currentCode:700,native:true,progress:0,message:'',latest:null}
  const requests=[],downloads=[],installs=[],deleted=[],files=new Map(),handles=new Map()
  let closed=0
  const fs={
    openSync({filePath}) { if(!files.has(filePath)) throw Error('missing'); handles.set('fd',{bytes:files.get(filePath),offset:0}); return 'fd' },
    readSync({fd,arrayBuffer,length}) {const h=handles.get(fd), n=Math.min(length,h.bytes.length-h.offset); new Uint8Array(arrayBuffer).set(h.bytes.subarray(h.offset,h.offset+n)); h.offset+=n; return {bytesRead:n,arrayBuffer}},
    closeSync({fd}) {handles.delete(fd); closed++},
    unlink({filePath}) {deleted.push(filePath); files.delete(filePath)}
  }
  const api={
    request(o){requests.push(o)},getAppBaseInfo(){return {appId:release.appId,packageName:release.packageName}},getFileSystemManager(){return fs},
    downloadFile(o){const task={options:o,aborted:false,abort(){this.aborted=true;o.fail({})},onProgressUpdate(fn){this.progress=fn}};downloads.push(task);return task},
    installApk(o){installs.push(o)}
  }
  const controller=createUpdateController(api,state)
  function available() { const checked=controller.check();requests.at(-1).success({statusCode:200,data:release}); requests.at(-1).complete();return checked }
  function succeed(task=downloads.at(-1),file='/cache/test.apk') {files.set(file,bytes);return task.options.success({statusCode:200,tempFilePath:file})}
  return {state,controller,api,requests,downloads,installs,deleted,files,available,succeed,closed:()=>closed}
}
test('重复检查共用请求，404 与离线失败有可恢复的状态',async()=>{
  const f=fixture(), first=f.controller.check()
  assert.equal(f.controller.check(),first);assert.equal(f.requests.length,1)
  f.requests[0].success({statusCode:404});f.requests[0].complete();await first
  assert.equal(f.state.phase,'unpublished')
  const retry=f.controller.check();f.requests[1].fail({});f.requests[1].complete();await retry
  assert.equal(f.state.phase,'error');assert.match(f.state.message,/离线/)
})
test('完整流程先校验再安装，调用安装器不声称更新完成，失败可重试',async()=>{
  const f=fixture();await f.available(); f.controller.download(); f.controller.download()
  assert.equal(f.downloads.length,1);f.downloads[0].progress({progress:33});assert.equal(f.state.progress,33)
  f.controller.install();assert.equal(f.installs.length,0)
  await f.succeed();assert.equal(f.closed(),1);assert.equal(f.state.phase,'ready')
  f.controller.install();f.controller.install();assert.equal(f.installs.length,1)
  f.installs[0].fail({});f.installs[0].complete();assert.equal(f.state.phase,'ready')
  f.controller.install();f.installs[1].success({});f.installs[1].complete()
  assert.equal(f.state.phase,'ready');assert.match(f.state.message,/系统安装/);assert.doesNotMatch(f.state.message,/更新成功/)
})
test('HTML、截断及摘要不匹配均被拒绝并删除临时文件',async()=>{
  for (const bytes of [Buffer.from('<html>error</html>'),apk.subarray(0,500),Buffer.concat([apk.subarray(0,apk.length-1),Buffer.from([apk.at(-1)^255])])]) {
    const f=fixture(bytes);await f.available();f.controller.download();await f.succeed()
    assert.equal(f.state.phase,'error');assert.equal(f.closed(),1);assert.equal(f.files.size,0)
    f.controller.install();assert.equal(f.installs.length,0)
  }
})
test('下载取消后的旧回调不能覆盖重试状态',async()=>{
  const f=fixture();await f.available();f.controller.download();const old=f.downloads[0]
  f.controller.cancel();assert.equal(old.aborted,true);assert.equal(f.state.phase,'available')
  f.controller.download();await f.succeed(old,'/cache/old.apk')
  assert.equal(f.state.phase,'downloading');assert.equal(f.files.has('/cache/old.apk'),false)
  await f.succeed(f.downloads[1],'/cache/new.apk');assert.equal(f.state.phase,'ready')
})
test('校验取消会关闭句柄并清除文件，可再次下载',async()=>{
  const f=fixture();await f.available();f.controller.download();const pending=f.succeed()
  assert.equal(f.state.phase,'verifying');f.controller.cancel();await pending
  assert.equal(f.state.phase,'available');assert.equal(f.files.size,0);assert.equal(f.closed(),1)
})
test('浏览器、调试基座以及同版本无法下载安装',async()=>{
  const f=fixture();await f.available();f.state.native=false;f.controller.download();assert.equal(f.downloads.length,0)
  f.state.native=true;f.state.currentCode=800;f.controller.download();assert.equal(f.downloads.length,0)
  f.state.currentCode=700;f.api.getAppBaseInfo=()=>({appId:release.appId,packageName:'io.dcloud.playground'})
  f.controller.download();assert.equal(f.downloads.length,0);assert.equal(f.state.phase,'error');assert.match(f.state.message,/调试基座/)
})
test('HTTP 错误和下载失败不能调用安装器，用户可重新下载',async()=>{
  const f=fixture();await f.available();f.controller.download()
  await f.downloads[0].options.success({statusCode:403,tempFilePath:'/cache/denied.apk'})
  assert.equal(f.state.phase,'error');assert.ok(f.deleted.includes('/cache/denied.apk'))
  f.controller.install();assert.equal(f.installs.length,0)
  f.controller.download();f.downloads[1].options.fail({})
  assert.equal(f.state.phase,'error');f.controller.download();await f.succeed();assert.equal(f.state.phase,'ready')
})
