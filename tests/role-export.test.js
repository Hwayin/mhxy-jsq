import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, unlink, rmdir, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ledger } from '../scripts/load-ledger.mjs'
import { saveRoleFile } from '../scripts/role-file-store.mjs'
import { createTestDataServer } from '../scripts/test-data-server.mjs'

test('角色导出只包含选中角色、所属账号及完整资产，能用原备份格式导入', () => {
  const original = ledger.demoLedger()
  const raw = ledger.exportRoleBackup(original, 'demo-role-0')
  const backup = ledger.parseRoleBackup(raw)
  assert.equal(backup.data.accounts.length, 1)
  assert.equal(backup.data.roles.length, 1)
  assert.equal(backup.data.assets.length, 3)
  assert.equal(ledger.summarize(backup.data).total, 700000)
  assert.deepEqual(ledger.importBackup(raw), ledger.roleLedger(original, 'demo-role-0'))
  assert.equal(original.roles.length, 5)
  assert.throws(() => ledger.exportRoleBackup(original, 'missing'))
})

test('角色备份恢复到空账本，或按 ID 覆盖原角色及旧资产，并保留其他角色与已有账号信息', () => {
  const original = ledger.demoLedger()
  const incoming = ledger.roleLedger(original, 'demo-role-0')
  incoming.roles[0].name = '新配置'
  incoming.accounts[0].name = '备份内别名'
  incoming.assets = incoming.assets.slice(0, 2)
  incoming.assets[1].costCents = 12345
  const raw = ledger.exportRoleBackup(incoming, 'demo-role-0')
  assert.deepEqual(ledger.mergeRoleBackup(ledger.emptyLedger(), raw), incoming)
  const merged = ledger.mergeRoleBackup(original, raw)
  assert.equal(merged.accounts[0].name, original.accounts[0].name)
  assert.equal(merged.roles.length, 5)
  assert.equal(merged.roles.find(r => r.id === 'demo-role-0').name, '新配置')
  assert.equal(merged.assets.filter(a => a.roleId === 'demo-role-0').length, 2)
  assert.deepEqual(ledger.roleSummary(merged, 'demo-role-1'), ledger.roleSummary(original, 'demo-role-1'))
  assert.equal(original.roles[0].name, '云间听风')
})

test('角色范围、ID 不一致及与其他角色资产 ID 冲突时拒绝恢复', () => {
  const current = ledger.demoLedger()
  const backup = JSON.parse(ledger.exportRoleBackup(current, 'demo-role-0'))
  backup.roleId = 'wrong'
  assert.throws(() => ledger.parseRoleBackup(JSON.stringify(backup)))
  backup.roleId = 'demo-role-0'
  backup.data.assets[1].id = 'demo-pet-1'
  assert.throws(() => ledger.mergeRoleBackup(current, JSON.stringify(backup)))
  assert.equal(current.assets[1].id, 'demo-pet-0')
  assert.throws(() => ledger.parseRoleBackup(ledger.exportBackup(current)))
})

async function cleanup(directory) {
  for (const file of await readdir(directory)) await unlink(join(directory, file))
  await rmdir(directory)
}
test('同角色 ID 导出覆盖固定 JSON，其他角色文件不变；非法路径与备份不会覆盖原文件', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mhxy-role-export-'))
  try {
    const data = ledger.demoLedger()
    const id = 'demo-role-0'
    const first = await saveRoleFile(directory, id, ledger.exportRoleBackup(data, id))
    assert.equal(first.overwritten, false)
    await saveRoleFile(directory, 'demo-role-1', ledger.exportRoleBackup(data, 'demo-role-1'))
    const otherBefore = await readFile(join(directory, 'demo-role-1.json'), 'utf8')
    data.assets[1].costCents = 90000
    const second = await saveRoleFile(directory, id, ledger.exportRoleBackup(data, id))
    assert.equal(second.overwritten, true)
    assert.equal(second.fileName, first.fileName)
    const saved = await readFile(join(directory, first.fileName), 'utf8')
    assert.equal(ledger.importBackup(saved).assets[1].costCents, 90000)
    assert.equal(await readFile(join(directory, 'demo-role-1.json'), 'utf8'), otherBefore)
    await assert.rejects(saveRoleFile(directory, '../escape', ledger.exportRoleBackup(data, id)))
    await assert.rejects(saveRoleFile(directory, id, '{invalid'))
    await assert.rejects(saveRoleFile(directory, id, ledger.exportRoleBackup(data, 'demo-role-1')))
    assert.equal(await readFile(join(directory, first.fileName), 'utf8'), saved)
    assert.deepEqual((await readdir(directory)).sort(), ['demo-role-0.json', 'demo-role-1.json'])
  } finally { await cleanup(directory) }
})

test('本机导出 API 正常保存，阻止未知来源、非法 ID 与角色不一致请求', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mhxy-role-api-'))
  const server = createTestDataServer({ directory })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = 'http://127.0.0.1:' + server.address().port
  const input = { roleId: 'demo-role-0', backup: ledger.exportRoleBackup(ledger.demoLedger(), 'demo-role-0') }
  const post = (body, origin = 'http://localhost:5173') => fetch(base + '/api/test-data/role', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) })
  try {
    const response = await post(input)
    assert.equal(response.status, 200)
    assert.equal((await response.json()).relativePath, 'test-data/roles/demo-role-0.json')
    assert.equal((await post(input, 'https://example.com')).status, 403)
    assert.equal((await post({ ...input, roleId: '../escape' })).status, 400)
    assert.equal((await post({ ...input, roleId: 'demo-role-1' })).status, 400)
    const file = await readFile(join(directory, 'demo-role-0.json'), 'utf8')
    assert.equal(ledger.importBackup(file).roles[0].id, input.roleId)
  } finally {
    await new Promise(resolve => server.close(resolve))
    await cleanup(directory)
  }
})

test('当前保存的真实测试 JSON 可校验并恢复到空账本', async () => {
  const raw = await readFile(new URL('../test-data/roles/muz8mwy5-hilnb0a9.json', import.meta.url), 'utf8')
  const backup = ledger.parseRoleBackup(raw)
  assert.equal(backup.roleId, 'muz8mwy5-hilnb0a9')
  assert.deepEqual(ledger.mergeRoleBackup(ledger.emptyLedger(), raw), backup.data)
})
