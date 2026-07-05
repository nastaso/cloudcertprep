// Postbuild step. Rewrites dist/.well-known/security.txt's Expires line to
// now + 364 days (RFC 9116 caps Expires at one year out; 364 days keeps every
// build safely under that ceiling) so the field never goes stale between
// deploys - an expired security.txt is treated as invalid by researchers and
// scanners. Fails loudly if the file or the Expires line is missing, so a
// path or format drift is caught here instead of shipping a stale file.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SECURITY_TXT_PATH = resolve(__dirname, '../dist/.well-known/security.txt')

if (!existsSync(SECURITY_TXT_PATH)) {
  console.error('✗ update-security-txt-expires: dist/.well-known/security.txt not found (run after astro build).')
  process.exit(1)
}

const text = readFileSync(SECURITY_TXT_PATH, 'utf8')
const expiresLine = text.match(/^Expires:\s*.+$/m)
if (!expiresLine) {
  console.error('✗ update-security-txt-expires: no Expires line found in dist/.well-known/security.txt.')
  process.exit(1)
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const expires = new Date(Date.now() + 364 * MS_PER_DAY).toISOString()
const updated = text.replace(/^Expires:\s*.+$/m, `Expires: ${expires}`)

writeFileSync(SECURITY_TXT_PATH, updated)
console.log(`✓ dist/.well-known/security.txt Expires refreshed to ${expires}`)
