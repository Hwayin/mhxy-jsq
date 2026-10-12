import { mkdir, writeFile, rename, unlink, lstat } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ledger } from './load-ledger.mjs'

export async function saveRoleFile(directory, roleId, raw) {
  if (typeof roleId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(roleId)) throw new Error('角色 ID 不适合作为文件名')
  const backup = ledger.parseRoleBackup(raw)
  if (backup.roleId !== roleId) throw new Error('文件角色 ID 与备份不一致')
  const root = resolve(directory)
  await mkdir(root, { recursive: true })
  if ((await lstat(root)).isSymbolicLink()) throw new Error('测试数据目录不能是符号链接')
  const fileName = roleId + '.json'
  const target = join(root, fileName)
  if (!target.startsWith(root + sep)) throw new Error('导出路径不正确')
  let overwritten = false
  try {
    const existing = await lstat(target)
    if (!existing.isFile() || existing.isSymbolicLink()) throw new Error('目标不是普通 JSON 文件')
    overwritten = true
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  const temp = join(root, '.' + fileName + '.' + randomUUID() + '.tmp')
  try {
    const document = JSON.parse(ledger.exportRoleBackup(backup.data, roleId))
    await writeFile(temp, JSON.stringify(document, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' })
    await rename(temp, target)
  } finally { await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error }) }
  return { fileName, overwritten, assetCount: backup.data.assets.length, totalCents: ledger.roleSummary(backup.data, roleId).total }
}
