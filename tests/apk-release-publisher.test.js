import test from 'node:test'
import assert from 'node:assert/strict'
import { cloudReply, waitForCloud, validateRemoteUpdate, assertVersionForward, assertUploadedAssets, publishPreparedRelease, redactCloudOutput } from '../scripts/apk-release-publisher.mjs'
const ticket='044c07b0-c5f1-11f1-87e0-456436f0c242'
const identity={appId:'__UNI__A9783A2',packageName:'uni.app.UNIA9783A2'}
const update={type:'apk',platform:'android',...identity,versionName:'0.9.0',versionCode:900,size:40000000,sha256:'a'.repeat(64),notes:'更新说明',url:'https://github.com/Hwayin/mhxy-jsq/releases/download/v0.9.0/mhxy-ledger-0.9.0.apk'}
const prepared={update,apkName:'mhxy-ledger-0.9.0.apk',apkPath:'/staged/mhxy-ledger-0.9.0.apk',jsonPath:'/staged/update.json',notesPath:'/staged/notes.md',jsonSize:900,jsonHash:'b'.repeat(64)}
const assets=()=>[{name:prepared.apkName,state:'uploaded',size:update.size,digest:'sha256:'+update.sha256},{name:'update.json',state:'uploaded',size:prepared.jsonSize,digest:'sha256:'+prepared.jsonHash}]
const sourceSha='c'.repeat(40)
function cloud(extra={}) {return {ok:true,ticket,appid:identity.appId,platform:'ANDROID-CLC',terminal:false,result:'pending',status:'INQUEUE',description:'队列中',...extra}}
test('解析带时间前缀的 CLI JSON，错误文本不会被误判为成功，token 不输出',()=>{
  assert.equal(cloudReply('日志\n12:00:00 '+JSON.stringify(cloud())).ticket,ticket)
  assert.throws(()=>cloudReply('当前应用正在打包中，请勿重复提交'))
  assert.doesNotMatch(redactCloudOutput('https://example.com?a=1&token=secret-value) / next'),/secret-value/)
})
test('等待明确 ticket 的云任务，完成才使用该任务下载地址',async()=>{
  let now=0, index=0
  const replies=[cloud(),cloud({status:'PACKING'}),cloud({terminal:true,result:'success',status:'OK',url:'https://app.liuyingyong.cn/build/download/'+ticket})]
  const url=await waitForCloud({ticket,appId:identity.appId,timeoutMs:100,pollMs:20},{now:()=>now,sleep:async ms=>{now+=ms},log(){},status:async actual=>{assert.equal(actual,ticket);return '12:00:00 '+JSON.stringify(replies[index++])}})
  assert.equal(url,'https://app.liuyingyong.cn/build/download/'+ticket)
  assert.equal(index,3)
})
test('云打包失败、超时、不同 AppID/平台/下载地址均停止发布',async()=>{
  for(const extra of [{ok:false},{appid:'other'},{platform:'IOS-CLC'},{ticket:'other'},{terminal:true,result:'error',status:'ERROR',description:'打包失败'},{terminal:true,result:'success',status:'OK',url:'https://evil.example/app.apk'}]) {
    await assert.rejects(waitForCloud({ticket,appId:identity.appId},{now:()=>0,sleep:async()=>{},log(){},status:async()=>JSON.stringify(cloud(extra))}))
  }
  let now=0
  await assert.rejects(waitForCloud({ticket,appId:identity.appId,timeoutMs:30,pollMs:20},{now:()=>now,sleep:async ms=>{now+=ms},log(){},status:async()=>JSON.stringify(cloud())}),/超时/)
})
test('核验发布元数据与版本前进，拒绝旧包抢占 Latest',()=>{
  assert.deepEqual(validateRemoteUpdate(update,identity),update)
  for(const changes of [{packageName:'com.other.app'},{versionCode:'900'},{sha256:'invalid'},{url:update.url.replace('Hwayin','other')},{size:536870913},{notes:null}]) assert.throws(()=>validateRemoteUpdate({...update,...changes},identity))
  assert.throws(()=>assertVersionForward(update,{versionName:'0.10.0',versionCode:1000}))
  assert.throws(()=>assertVersionForward(update,update))
  assert.doesNotThrow(()=>assertVersionForward(update,update,{allowEqual:true}))
})
function fixture({existing=null,latest=null}={}) {
  const calls=[]
  let current=existing,latestRead=0,latestValue=latest
  const io={
    log(){},latestUpdate:async()=>{latestRead++;return latestValue},release:async()=>current,
    updateFrom:async()=>current.metadata||update,
    createDraft:async(tag,sha,notes)=>{calls.push('draft');assert.equal(sha,sourceSha);assert.equal(notes,prepared.notesPath);current={tag_name:tag,draft:true,prerelease:false,target_commitish:sha,assets:[],html_url:'https://github.com/Hwayin/mhxy-jsq/releases/tag/'+tag}},
    uploadDraft:async(tag,files)=>{calls.push('upload');assert.ok(current.draft);assert.deepEqual(files,[prepared.apkPath,prepared.jsonPath]);current.assets=assets()},
    publishLatest:async()=>{calls.push('publish');current.draft=false;latestValue=current.metadata||update},
    verifyAnonymous:async()=>{calls.push('anonymous')}
  }
  return {calls,io,current:()=>current,latestReads:()=>latestRead}
}
test('按草稿、附件校验、正式 Latest、匿名校验顺序完成发布',async()=>{
  const f=fixture();const result=await publishPreparedRelease(prepared,sourceSha,f.io)
  assert.deepEqual(f.calls,['draft','upload','publish','anonymous']);assert.equal(result.alreadyPublished,false)
  assert.equal(f.current().draft,false);assert.equal(f.latestReads(),2)
})
test('预演执行校验，完全不创建草稿、不上传或切换 Latest',async()=>{
  const f=fixture();const result=await publishPreparedRelease(prepared,sourceSha,f.io,{dryRun:true})
  assert.equal(result.dryRun,true);assert.deepEqual(f.calls,[])
})
test('上传中断保留草稿，相同源码重跑补齐附件后发布',async()=>{
  const f=fixture();const original=f.io.uploadDraft
  f.io.uploadDraft=async()=>{throw Error('network interrupted')}
  await assert.rejects(publishPreparedRelease(prepared,sourceSha,f.io),/network/)
  assert.equal(f.current().draft,true);assert.ok(!f.calls.includes('publish'))
  f.io.uploadDraft=original;await publishPreparedRelease(prepared,sourceSha,f.io)
  assert.deepEqual(f.calls,['draft','upload','publish','anonymous'])
})
test('附件缺失、摘要或大小不匹配时绝不切换 Latest',async()=>{
  for(const tamper of [rows=>rows.pop(),rows=>{rows[0].digest='sha256:bad'},rows=>{rows[1].size++},rows=>{rows.push({...rows[0],name:'other.apk'})}]) {
    const f=fixture();f.io.uploadDraft=async()=>{const rows=assets();tamper(rows);f.current().assets=rows}
    await assert.rejects(publishPreparedRelease(prepared,sourceSha,f.io),/附件/)
    assert.equal(f.current().draft,true);assert.ok(!f.calls.includes('publish'))
  }
})
test('存在未知附件或另一个源码的草稿时，不修改该草稿',async()=>{
  for(const existing of [{draft:true,target_commitish:'other',assets:[]},{draft:true,target_commitish:sourceSha,assets:[{name:'unknown.apk'}]},{draft:true,prerelease:true,target_commitish:sourceSha,assets:[]}]) {
    const f=fixture({existing});await assert.rejects(publishPreparedRelease(prepared,sourceSha,f.io),/草稿/);assert.deepEqual(f.calls,[])
  }
})
test('同一个正式发布包重跑不覆盖附件，仅复核匿名下载',async()=>{
  const f=fixture({latest:update,existing:{draft:false,prerelease:false,assets:assets(),html_url:'existing',metadata:update}})
  const result=await publishPreparedRelease(prepared,sourceSha,f.io)
  assert.equal(result.alreadyPublished,true);assert.deepEqual(f.calls,['anonymous'])
})
test('正式发布的同版本不同 APK 不覆盖，需改版本号',async()=>{
  const f=fixture({latest:update,existing:{draft:false,assets:assets(),metadata:{...update,sha256:'d'.repeat(64)}}})
  await assert.rejects(publishPreparedRelease(prepared,sourceSha,f.io),/同版本/);assert.deepEqual(f.calls,[])
})
test('已经上传的正式新版尚非 Latest 时，验证后自动设置 Latest',async()=>{
  const f=fixture({latest:{...update,versionName:'0.8.0',versionCode:800},existing:{draft:false,assets:assets(),metadata:update,html_url:'existing'}})
  const result=await publishPreparedRelease(prepared,sourceSha,f.io)
  assert.equal(result.promoted,true);assert.deepEqual(f.calls,['publish','anonymous'])
})
test('上传期间其他新版已发布时，保留草稿并阻止 Latest 回退',async()=>{
  const f=fixture();let count=0
  f.io.latestUpdate=async()=>++count===1?null:{...update,versionName:'0.10.0',versionCode:1000}
  await assert.rejects(publishPreparedRelease(prepared,sourceSha,f.io),/未高于/)
  assert.equal(f.current().draft,true);assert.deepEqual(f.calls,['draft','upload'])
})
test('发布后匿名验证断网，重跑只复核已发布附件，不再次上传',async()=>{
  const f=fixture();f.io.verifyAnonymous=async()=>{throw Error('anonymous network failed')}
  await assert.rejects(publishPreparedRelease(prepared,sourceSha,f.io),/network/)
  assert.equal(f.current().draft,false)
  f.io.verifyAnonymous=async()=>{f.calls.push('reverified')}
  await publishPreparedRelease(prepared,sourceSha,f.io)
  assert.deepEqual(f.calls,['draft','upload','publish','reverified'])
})
test('附件完整性校验不接受未上传完成的文件',()=>{
  const rows=assets();rows[0].state='new';assert.throws(()=>assertUploadedAssets({assets:rows},prepared))
})
