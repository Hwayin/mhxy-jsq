import test from 'node:test'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import { apkManifest, binaryManifest } from '../scripts/apk-metadata.mjs'

function manifestFixture(utf8=true) {
  const strings=['manifest','package','com.mhxy.costledger','versionName','0.7.0','versionCode']
  const encoded=strings.map(s=>utf8 ? Buffer.concat([Buffer.from([s.length,s.length]),Buffer.from(s),Buffer.alloc(1)]) : Buffer.concat([Buffer.from([s.length,0]),Buffer.from(s,'utf16le'),Buffer.alloc(2)]))
  const pool=Buffer.alloc(28+strings.length*4+encoded.reduce((sum,b)=>sum+b.length,0))
  pool.writeUInt16LE(1,0);pool.writeUInt16LE(28,2);pool.writeUInt32LE(pool.length,4);pool.writeUInt32LE(strings.length,8);pool.writeUInt32LE(utf8?256:0,16);pool.writeUInt32LE(28+strings.length*4,20)
  let offset=0
  for (let i=0;i<encoded.length;i++){pool.writeUInt32LE(offset,28+i*4);encoded[i].copy(pool,28+strings.length*4+offset);offset+=encoded[i].length}
  const tag=Buffer.alloc(36+3*20)
  tag.writeUInt16LE(0x0102,0);tag.writeUInt16LE(16,2);tag.writeUInt32LE(tag.length,4);tag.writeUInt32LE(0,20);tag.writeUInt16LE(20,24);tag.writeUInt16LE(20,26);tag.writeUInt16LE(3,28)
  for(const [i,name,kind,data] of [[0,1,3,2],[1,3,3,4],[2,5,16,700]]){const p=36+i*20;tag.writeUInt32LE(name,p+4);tag[p+15]=kind;tag.writeUInt32LE(data,p+16)}
  const head=Buffer.alloc(8);head.writeUInt16LE(3,0);head.writeUInt16LE(8,2);head.writeUInt32LE(head.length+pool.length+tag.length,4)
  return Buffer.concat([head,pool,tag])
}
function zipFixture(xml,compressed) {
  const name=Buffer.from('AndroidManifest.xml'),raw=compressed?deflateRawSync(xml):xml
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(name.length,26)
  const directory=Buffer.alloc(46);directory.writeUInt32LE(0x02014b50,0);directory.writeUInt16LE(compressed?8:0,10);directory.writeUInt32LE(raw.length,20);directory.writeUInt32LE(xml.length,24);directory.writeUInt16LE(name.length,28)
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(directory.length+name.length,12);end.writeUInt32LE(local.length+name.length+raw.length,16)
  return Buffer.concat([local,name,raw,directory,name,end])
}
test('读取实际 APK manifest：支持 UTF8/UTF16 字符串与 ZIP 压缩/存储',()=>{
  for(const utf8 of [true,false]) for(const compressed of [true,false]) assert.deepEqual(apkManifest(zipFixture(manifestFixture(utf8),compressed)),{package:'com.mhxy.costledger',versionName:'0.7.0',versionCode:700})
})
test('无 manifest、截断 ZIP、越界 XML 均不会产生更新描述',()=>{
  for(const data of [Buffer.alloc(0),Buffer.from('<html>not an apk</html>'),zipFixture(manifestFixture(),true).subarray(0,80)]) assert.throws(()=>apkManifest(data))
  const xml=manifestFixture();xml.writeUInt32LE(0xffffff,12);assert.throws(()=>binaryManifest(xml))
})
