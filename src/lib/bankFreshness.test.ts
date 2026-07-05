import { describe, it, expect } from 'vitest'
import { getCertLastmod } from './bankFreshness'
import committedLedger from '../data/bank-lastmod.json'
// Single source of truth for the hashing + ledger IO lives in the maintainer
// script; the test imports it so the CI guard below can never disagree with
// what `npm run bank:lastmod` writes.
import { computeBankHash, listBankCerts, readLedger } from '../../scripts/generate-bank-lastmod.mjs'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

describe('bank-lastmod freshness ledger', () => {
  it('tracks every question bank with a matching content hash (ledger is not stale)', () => {
    // Hard CI guard: if a bank was edited without re-running `npm run
    // bank:lastmod`, the committed hash drifts and this fails with a clear
    // pointer. Mirrors the non-fatal warning `npm run validate` prints.
    const banks = listBankCerts()
    expect(banks.length).toBeGreaterThan(0)
    for (const certCode of banks) {
      const entry = committedLedger.certs[certCode as keyof typeof committedLedger.certs]
      expect(entry, `cert "${certCode}" missing from bank-lastmod.json (run \`npm run bank:lastmod\`)`).toBeTruthy()
      expect(entry.lastmod).toMatch(ISO_DATE)
      expect(entry.contentHash, `stale hash for "${certCode}" (run \`npm run bank:lastmod\`)`).toBe(
        computeBankHash(certCode),
      )
    }
  })

  it('reads the ledger through readLedger identically to the imported JSON', () => {
    expect(readLedger().certs).toEqual(committedLedger.certs)
  })

  it('getCertLastmod returns the committed date for each tracked cert', () => {
    for (const [certCode, entry] of Object.entries(committedLedger.certs)) {
      expect(getCertLastmod(certCode)).toBe(entry.lastmod)
    }
  })

  it('getCertLastmod falls back to a valid ISO date for an untracked cert', () => {
    expect(getCertLastmod('does-not-exist')).toMatch(ISO_DATE)
  })
})
