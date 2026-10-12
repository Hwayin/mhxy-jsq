import { inflateRawSync } from 'node:zlib'

// 读取 APK 内真正的 AndroidManifest.xml，防止拿旧安装包生成新版更新描述。
export function apkManifest(zip) {
  let end = zip.length - 22
  const floor = Math.max(0,zip.length - 65557)
  for (;end >= floor;end--) if (zip.readUInt32LE(end) === 0x06054b50 && end + 22 + zip.readUInt16LE(end+20) === zip.length) break
  if (end < floor || zip.readUInt16LE(end+4) || zip.readUInt16LE(end+6)) throw Error('APK ZIP 格式无效')
  const count = zip.readUInt16LE(end+10)
  let p = zip.readUInt32LE(end+16), xml = null
  for (let i=0;i<count;i++) {
    if (p+46 > end || zip.readUInt32LE(p)!==0x02014b50) throw Error('APK ZIP 目录无效')
    const nameLen=zip.readUInt16LE(p+28), extraLen=zip.readUInt16LE(p+30), commentLen=zip.readUInt16LE(p+32)
    const name=zip.subarray(p+46,p+46+nameLen).toString('utf8')
    if (name==='AndroidManifest.xml') {
      if (xml || zip.readUInt16LE(p+8)&1) throw Error('APK manifest 无效')
      const method=zip.readUInt16LE(p+10), size=zip.readUInt32LE(p+20), unpacked=zip.readUInt32LE(p+24), local=zip.readUInt32LE(p+42)
      if (unpacked > 10485760 || local+30>zip.length || zip.readUInt32LE(local)!==0x04034b50) throw Error('APK manifest 大小无效')
      const start=local+30+zip.readUInt16LE(local+26)+zip.readUInt16LE(local+28)
      if (start+size > zip.length) throw Error('APK manifest 被截断')
      const raw=zip.subarray(start,start+size)
      xml=method===0 ? raw : method===8 ? inflateRawSync(raw,{maxOutputLength:10485760}) : null
      if (!xml || xml.length!==unpacked) throw Error('APK manifest 压缩格式无效')
    }
    p += 46+nameLen+extraLen+commentLen
  }
  if (!xml) throw Error('APK 缺少 AndroidManifest.xml')
  return binaryManifest(xml)
}

export function binaryManifest(xml) {
  if (xml.length < 8 || xml.readUInt16LE(0)!==3 || xml.readUInt32LE(4)!==xml.length) throw Error('APK 二进制 manifest 无效')
  let strings=[], result=null
  for (let p=xml.readUInt16LE(2);p+8<=xml.length;) {
    const type=xml.readUInt16LE(p), header=xml.readUInt16LE(p+2), size=xml.readUInt32LE(p+4)
    if (header<8 || size<header || p+size>xml.length) throw Error('APK manifest chunk 无效')
    if (type===1) {
      if (header<28) throw Error('APK 字符串表无效')
      const count=xml.readUInt32LE(p+8), utf8=(xml.readUInt32LE(p+16)&256)!==0, start=p+xml.readUInt32LE(p+20)
      if (header+count*4>size) throw Error('APK 字符串表越界')
      strings=[]
      for (let i=0;i<count;i++) {
        let q=start+xml.readUInt32LE(p+header+i*4)
        const length8=()=>{const n=xml[q++];return n&128 ? ((n&127)<<8)|xml[q++] : n}
        let len
        if (utf8) {length8();len=length8()}
        else {len=xml.readUInt16LE(q);q+=2;if(len&32768){len=((len&32767)<<16)|xml.readUInt16LE(q);q+=2}len*=2}
        if (!Number.isInteger(len) || q < start || q+len>p+size) throw Error('APK 字符串越界')
        strings.push(xml.subarray(q,q+len).toString(utf8?'utf8':'utf16le'))
      }
    } else if (type===0x0102) {
      if (header<16 || size<36) throw Error('APK XML 元素无效')
      if (strings[xml.readUInt32LE(p+20)]==='manifest') {
        if (result) throw Error('APK 包声明重复')
        result={}
        const start=p+16+xml.readUInt16LE(p+24), step=xml.readUInt16LE(p+26), count=xml.readUInt16LE(p+28)
        if (step<20 || start<p+36 || start+step*count>p+size) throw Error('APK 属性越界')
        for (let i=0;i<count;i++) {
          const a=start+i*step, name=strings[xml.readUInt32LE(a+4)], kind=xml[a+15], data=xml.readUInt32LE(a+16)
          if (['package','versionName','versionCode'].includes(name)) result[name]=kind===3 ? strings[data] : [16,17].includes(kind) ? data : null
        }
      }
    }
    p += size
  }
  if (!result || typeof result.package!=='string' || typeof result.versionName!=='string' || !Number.isInteger(result.versionCode)) throw Error('无法读取 APK 包名和版本')
  return result
}
