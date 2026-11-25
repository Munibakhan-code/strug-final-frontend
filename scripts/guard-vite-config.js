/**
 * Block PolinRider / EtherHiding supply-chain injection in vite.config.js.
 * Fails fast before Vite loads config (npm run dev / build / CI).
 */
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const CONFIG_PATH = resolve(process.cwd(), 'vite.config.js')

/** Legit config is ~3–4 KB; infected main was ~30 KB with appended payload. */
const MAX_BYTES = 16_384
const MAX_LINE_LENGTH = 400

const createRequire = 'create' + 'Require'
const childProcess = 'child' + '_process'
const childProc = 'child' + '_proc'
const ethBlock = 'eth_' + 'blockNumber'
const ethTx = 'eth_' + 'getTransaction'
const ethBlockBy = 'eth_' + 'getBlock'

const FORBIDDEN = [
  { pattern: /global\.i\s*=/, reason: 'PolinRider marker (global.i)' },
  { pattern: /global\[['"]i['"]\]/, reason: 'PolinRider marker (global["i"])' },
  { pattern: /global\[['"]r['"]\]\s*=\s*require/, reason: 'PolinRider require bootstrap' },
  { pattern: /_0x[a-f0-9]{4,}/i, reason: 'obfuscated identifier (_0x…)' },
  { pattern: new RegExp(`${createRequire}\\s*\\(`), reason: 'createRequire (not used in clean Vite config)' },
  { pattern: new RegExp(`${childProcess}|${childProc}`), reason: 'child_process reference' },
  { pattern: /\beval\s*\(/, reason: 'eval()' },
  { pattern: /\brequire\s*\(/, reason: 'CommonJS require() in ESM config' },
  { pattern: /\bspawn\s*\(/, reason: 'child_process.spawn()' },
  { pattern: new RegExp(`${ethBlock}|${ethTx}|${ethBlockBy}`), reason: 'Ethereum RPC payload (EtherHiding)' },
]

function fail(issues) {
  console.error('vite.config.js security guard FAILED:\n')
  for (const issue of issues) console.error(`  • ${issue}`)
  console.error('\nRefusing to run Vite. Restore a clean vite.config.js before continuing.')
  process.exit(1)
}

function guard() {
  let text
  try {
    text = readFileSync(CONFIG_PATH, 'utf8')
  } catch (err) {
    fail([`Cannot read ${CONFIG_PATH}: ${err.message}`])
    return
  }

  const issues = []

  const { size } = statSync(CONFIG_PATH)
  if (size > MAX_BYTES) {
    issues.push(`file is ${size} bytes (limit ${MAX_BYTES}) — possible appended payload`)
  }

  if (!text.includes('export default defineConfig')) {
    issues.push('missing expected `export default defineConfig`')
  }

  for (const { pattern, reason } of FORBIDDEN) {
    if (pattern.test(text)) issues.push(reason)
  }

  if (/}\);\s*\S/.test(text)) {
    issues.push('content after `});` on the same line (known PolinRider injection pattern)')
  }

  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const len = lines[i].length
    if (len > MAX_LINE_LENGTH) {
      issues.push(`line ${i + 1} is ${len} chars (max ${MAX_LINE_LENGTH})`)
    }
  }

  const trimmed = text.trimEnd()
  if (!/\}\)\s*$/.test(trimmed)) {
    issues.push('file must end with `})` closing defineConfig (no trailing code)')
  }

  if (issues.length) fail(issues)

  console.log('vite.config.js security guard: OK')
}

guard()
