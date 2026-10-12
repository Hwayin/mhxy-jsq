import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
const source = await readFile(new URL('../lib/ledger.uts', import.meta.url), 'utf8')
export const ledgerModuleUrl = 'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64')
export const ledger = await import(ledgerModuleUrl)
