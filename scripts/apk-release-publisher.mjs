export const UPDATE_REPO = 'Hwayin/mhxy-jsq'
export const MAX_APK_BYTES = 536870912

export function redactCloudOutput(value) {
  return String(value).replace(/([?&]token=)[^&\s)"\\]+/gi,'$1[REDACTED]')
}
export function cloudReply(output) {
  for (const line of String(output).split(/\r?\n/).reverse()) {
    const start=line.indexOf('{')
    if(start<0) continue
    try { const json=JSON.parse(line.slice(start)); if(typeof json.ok==='boolean') return json } catch {}
  }
  throw Error('HBuilderX 未返回任务 JSON，请确认已打开并登录，且 ticket 正确')
}
export function validateTicket(ticket) {
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(ticket)) throw Error('云打包 ticket 格式不正确')
  return ticket.toLowerCase()
}
export async function waitForCloud({ticket,appId,timeoutMs=2400000,pollMs=20000},io) {
  validateTicket(ticket)
  const start=io.now()
  while(io.now()-start<=timeoutMs) {
    const reply=cloudReply(await io.status(ticket))
    if(reply.ok!==true || reply.ticket!==ticket || reply.appid!==appId || !String(reply.platform).startsWith('ANDROID')) throw Error('云打包任务与当前 Android 应用不匹配，停止发布')
    if(reply.terminal) {
      if(reply.result!=='success' || reply.status!=='OK') throw Error('云打包失败：'+redactCloudOutput(reply.description||reply.status))
      if(reply.url!==`https://app.liuyingyong.cn/build/download/${ticket}`) throw Error('云打包下载地址与 ticket 不匹配')
      return reply.url
    }
    if(reply.result!=='pending') throw Error('无法读取云打包状态：'+redactCloudOutput(reply.description||reply.result))
    io.log('云打包：'+redactCloudOutput(reply.additionalMessage||reply.description||reply.status))
    const left=timeoutMs-(io.now()-start)
    if(left<=0) break
    await io.sleep(Math.min(pollMs,left))
  }
  throw Error('等待云打包超时。可使用相同 ticket 重新运行，继续发布')
}
export function validateRemoteUpdate(data,identity) {
  if(!data || data.type!=='apk' || data.platform!=='android' || data.appId!==identity.appId || data.packageName!==identity.packageName || !Number.isInteger(data.versionCode) || data.versionCode<1 || data.versionCode>2147483647 || typeof data.versionName!=='string' || !/^\d+\.\d+\.\d+$/.test(data.versionName) || !/^[a-f0-9]{64}$/i.test(data.sha256) || !Number.isInteger(data.size) || data.size<4 || data.size>MAX_APK_BYTES || typeof data.notes!=='string' || data.notes.length>6000) throw Error('已发布版本的 update.json 不完整或属于其他应用，停止发布')
  const expected=`https://github.com/${UPDATE_REPO}/releases/download/v${data.versionName}/mhxy-ledger-${data.versionName}.apk`
  if(data.url!==expected) throw Error('已发布版本的 APK 地址不匹配')
  return data
}
export function assertVersionForward(candidate,latest,{allowEqual=false}={}) {
  if(!latest) return
  if(candidate.versionCode<latest.versionCode || (candidate.versionCode===latest.versionCode && (!allowEqual || candidate.versionName!==latest.versionName))) throw Error(`当前 ${candidate.versionName} / ${candidate.versionCode} 未高于 Latest ${latest.versionName} / ${latest.versionCode}，请先增加版本号`)
}
function sameAsset(asset,name,size,digest) {
  return asset.name===name && asset.state==='uploaded' && asset.size===size && asset.digest===`sha256:${digest}`
}
export function assertUploadedAssets(release,prepared) {
  const expected=[{name:prepared.apkName,size:prepared.update.size,hash:prepared.update.sha256},{name:'update.json',size:prepared.jsonSize,hash:prepared.jsonHash}]
  if(release.assets.length!==2 || expected.some(item=>!release.assets.some(asset=>sameAsset(asset,item.name,item.size,item.hash)))) throw Error('Release 附件数量、大小或 SHA-256 与本机校验结果不一致；保留草稿，不设置 Latest')
}
export async function publishPreparedRelease(prepared,sourceSha,io,{dryRun=false}={}) {
  const tag='v'+prepared.update.versionName
  const latest=await io.latestUpdate()
  assertVersionForward(prepared.update,latest,{allowEqual:true})
  let existing=await io.release(tag)
  if(existing && !existing.draft) {
    if(existing.prerelease) throw Error('同版本已存在 Pre-release，请核对后手动处理')
    const remote=await io.updateFrom(existing)
    const stable=['appId','packageName','versionName','versionCode','url','size','sha256']
    if(stable.some(key=>remote[key]!==prepared.update[key]) || !existing.assets.some(a=>sameAsset(a,prepared.apkName,prepared.update.size,prepared.update.sha256))) throw Error('同版本已正式发布，但 APK 与本次不同。请增加版本号，不覆盖已发布的安装包')
    const promote=!latest || prepared.update.versionCode>latest.versionCode
    if(!dryRun) {
      if(promote) await io.publishLatest(tag)
      await io.verifyAnonymous(prepared)
    }
    io.log(promote ? (dryRun ? '该 APK 已发布，正式执行时将设为 Latest。' : '该 APK 已设为 Latest，匿名下载校验通过。') : '该 APK 已发布，保持原 Release 与 Latest 设置。')
    return {url:existing.html_url,alreadyPublished:true,dryRun,promoted:promote&&!dryRun}
  }
  // equal 只用于同一已发布包的幂等重跑，不允许新草稿抢占同版本。
  assertVersionForward(prepared.update,latest)
  if(existing) {
    if(existing.prerelease || existing.target_commitish!==sourceSha || existing.assets.some(a=>![prepared.apkName,'update.json'].includes(a.name))) throw Error('已有草稿的源码、类型或附件与本次任务不一致，停止修改该草稿')
  }
  if(dryRun) {
    io.log('预演通过：将上传 APK 与 update.json，附件验证后发布为 Latest。')
    return {url:`https://github.com/${UPDATE_REPO}/releases/tag/${tag}`,dryRun:true,alreadyPublished:false}
  }
  if(!existing) await io.createDraft(tag,sourceSha,prepared.notesPath)
  // 仅对同一源码的草稿补齐附件，支持断网后重跑；已发布包不会被覆盖。
  await io.uploadDraft(tag,[prepared.apkPath,prepared.jsonPath])
  existing=await io.release(tag)
  if(!existing || !existing.draft || existing.target_commitish!==sourceSha) throw Error('草稿状态已改变，停止发布')
  assertUploadedAssets(existing,prepared)
  // 云端等待/上传期间另一个版本可能已发布，最后再防止 Latest 回退。
  assertVersionForward(prepared.update,await io.latestUpdate())
  await io.publishLatest(tag)
  const live=await io.release(tag)
  if(!live || live.draft || live.prerelease) throw Error('GitHub 尚未确认正式发布，可使用同一命令重试核验')
  await io.verifyAnonymous(prepared)
  io.log('发布成功：'+live.html_url)
  return {url:live.html_url,alreadyPublished:false,dryRun:false}
}
