import { describe, it, expect } from 'vitest'
import { FEATURED_SAMPLE_IDS, getFeaturedSampleIds } from './featured-samples'
import { CERTIFICATIONS } from './certifications'

import clfDomain1 from './clf-c02/domain1.json'
import clfDomain2 from './clf-c02/domain2.json'
import clfDomain3 from './clf-c02/domain3.json'
import clfDomain4 from './clf-c02/domain4.json'
import aifDomain1 from './aif-c01/domain1.json'
import aifDomain2 from './aif-c01/domain2.json'
import aifDomain3 from './aif-c01/domain3.json'
import aifDomain4 from './aif-c01/domain4.json'
import aifDomain5 from './aif-c01/domain5.json'

interface BankQuestion {
  id: string
  answer: string | string[]
  isMultiAnswer?: boolean
}

const BANKS: Record<string, Record<number, BankQuestion[]>> = {
  'clf-c02': {
    1: clfDomain1 as BankQuestion[],
    2: clfDomain2 as BankQuestion[],
    3: clfDomain3 as BankQuestion[],
    4: clfDomain4 as BankQuestion[],
  },
  'aif-c01': {
    1: aifDomain1 as BankQuestion[],
    2: aifDomain2 as BankQuestion[],
    3: aifDomain3 as BankQuestion[],
    4: aifDomain4 as BankQuestion[],
    5: aifDomain5 as BankQuestion[],
  },
}

describe('FEATURED_SAMPLE_IDS', () => {
  for (const [certCode, domains] of Object.entries(FEATURED_SAMPLE_IDS)) {
    for (const [domainIdStr, ids] of Object.entries(domains)) {
      const domainId = Number(domainIdStr)

      describe(`${certCode} domain ${domainId}`, () => {
        const bank = BANKS[certCode]?.[domainId] ?? []
        const byId = new Map(bank.map(q => [q.id, q]))

        it('pins exactly five sample ids', () => {
          expect(ids).toHaveLength(5)
        })

        it('has no duplicate ids', () => {
          expect(new Set(ids).size).toBe(ids.length)
        })

        it('every featured id resolves to a single-select question in this domain bank', () => {
          for (const id of ids) {
            const q = byId.get(id)
            expect(q, `${certCode} d${domainId}: featured id ${id} not found in bank`).toBeDefined()
            // Samples are single-select only (multi-answer "Select N" questions
            // are never shown as samples on the Domain_Landing).
            const multi = Array.isArray(q!.answer) || q!.isMultiAnswer === true
            expect(multi, `${certCode} d${domainId}: featured id ${id} is multi-answer`).toBe(false)
          }
        })
      })
    }
  }

  it('covers every active AWS cert domain', () => {
    for (const cert of Object.values(CERTIFICATIONS)) {
      if (cert.status !== 'active' || cert.provider !== 'aws') continue
      for (const domain of cert.domains) {
        expect(
          getFeaturedSampleIds(cert.code, domain.id).length,
          `${cert.code} domain ${domain.id} has no featured samples`,
        ).toBe(5)
      }
    }
  })
})
