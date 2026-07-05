/**
 * Read-side of the question-bank freshness ledger (src/data/bank-lastmod.json).
 *
 * The ledger is generated + committed by `npm run bank:lastmod`
 * (scripts/generate-bank-lastmod.mjs). Build surfaces read a cert's real
 * content-change date from here instead of stamping the deploy date:
 *   - Course.dateModified on the Cert_Landing (src/pages/aws/[cert].astro),
 *   - the visible "Last updated" stamp (LastUpdatedStamp.astro on the cert +
 *     domain landings),
 *   - the sitemap <lastmod> (scripts/generate-seo-assets.mjs reads the same
 *     ledger directly via its .mjs helper).
 */
import ledger from '../data/bank-lastmod.json'

interface BankLedgerEntry {
  contentHash: string
  lastmod: string
}
interface BankLedger {
  certs: Record<string, BankLedgerEntry>
}

const typedLedger = ledger as BankLedger

/**
 * ISO YYYY-MM-DD date the given cert's question bank last changed, per the
 * committed freshness ledger. Falls back to today only if the cert is not yet
 * tracked (a brand-new bank; `npm run bank:lastmod` adds it and the validator
 * warns until it is committed).
 */
export function getCertLastmod(certCode: string): string {
  return typedLedger.certs[certCode]?.lastmod ?? new Date().toISOString().slice(0, 10)
}
