import { describe, it, expect } from 'vitest'
import {
  CERTIFICATIONS,
  CERTIFICATION_LIST,
  DEFAULT_CERT_ID,
  PROVIDERS,
  getActiveTotalQuestions,
  getCertByPath,
  getCertDomainCounts,
  getCertDomains,
  getCertTotalQuestions,
  getCertsByProvider,
  getProviderInfo,
  getProviderLabel,
  getSortedCerts,
} from './certifications'
import type { CertProvider } from './certifications'

describe('CERTIFICATIONS registry', () => {
  it('contains the default cert', () => {
    expect(CERTIFICATIONS[DEFAULT_CERT_ID]).toBeDefined()
  })

  it('every cert declares a provider and a level', () => {
    for (const cert of CERTIFICATION_LIST) {
      expect(cert.provider).toBeDefined()
      expect(cert.level).toBeDefined()
    }
  })

  it('every cert has at least one domain', () => {
    for (const cert of CERTIFICATION_LIST) {
      expect(cert.domains.length).toBeGreaterThan(0)
    }
  })

  it('domain examProportions sum to 1.0 per cert', () => {
    for (const cert of CERTIFICATION_LIST) {
      const total = cert.domains.reduce((sum, d) => sum + d.examProportion, 0)
      // Floating-point tolerance: AWS publishes rounded percentages so the sum
      // may be 0.99 to 1.01.
      expect(total).toBeGreaterThan(0.98)
      expect(total).toBeLessThan(1.02)
    }
  })
})

describe('getCertByPath', () => {
  it('returns the cert when provider and code match', () => {
    const result = getCertByPath('aws', 'clf-c02')
    expect(result?.code).toBe('clf-c02')
    expect(result?.provider).toBe('aws')
  })

  it('returns null when the cert code is unknown', () => {
    expect(getCertByPath('aws', 'nope')).toBeNull()
  })

  it('returns null when the provider does not match the cert', () => {
    // AIF-C01 is AWS; pretending it is Azure should not resolve.
    expect(getCertByPath('azure', 'aif-c01')).toBeNull()
  })

  it('returns null when either segment is missing', () => {
    expect(getCertByPath(undefined, 'clf-c02')).toBeNull()
    expect(getCertByPath('aws', undefined)).toBeNull()
    expect(getCertByPath(undefined, undefined)).toBeNull()
  })
})

describe('getCertsByProvider', () => {
  it('returns the list of certs for a known provider', () => {
    const aws = getCertsByProvider('aws')
    expect(aws).not.toBeNull()
    expect(aws!.every(c => c.provider === 'aws')).toBe(true)
    expect(aws!.length).toBeGreaterThan(0)
  })

  it('returns null when the provider is unknown', () => {
    expect(getCertsByProvider('oracle')).toBeNull()
    expect(getCertsByProvider(undefined)).toBeNull()
  })

  it('returns an empty array for a known provider with no certs', () => {
    // Azure is a known CertProvider value but has no certs registered yet.
    const azure = getCertsByProvider('azure')
    expect(azure).toEqual([])
  })
})

describe('getSortedCerts', () => {
  it('places active certs before coming-soon certs', () => {
    const sorted = getSortedCerts()
    let seenComingSoon = false
    for (const cert of sorted) {
      if (cert.status === 'coming-soon') seenComingSoon = true
      if (seenComingSoon) expect(cert.status).toBe('coming-soon')
    }
  })

  it('orders active certs by level (foundational first)', () => {
    const sorted = getSortedCerts().filter(c => c.status === 'active' && c.provider === 'aws')
    const levelIndex: Record<string, number> = {
      foundational: 0,
      associate: 1,
      professional: 2,
      specialty: 3,
    }
    for (let i = 1; i < sorted.length; i++) {
      expect(levelIndex[sorted[i].level]).toBeGreaterThanOrEqual(
        levelIndex[sorted[i - 1].level],
      )
    }
  })

  it('breaks ties on level by alphabetical name', () => {
    const sorted = getSortedCerts().filter(
      c => c.status === 'active' && c.level === 'foundational' && c.provider === 'aws',
    )
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].name.localeCompare(sorted[i - 1].name)).toBeGreaterThanOrEqual(0)
    }
  })

  it('filters to the requested provider when one is passed', () => {
    const aws = getSortedCerts('aws')
    expect(aws.every(c => c.provider === 'aws')).toBe(true)
  })
})

describe('getActiveTotalQuestions', () => {
  it('sums questionCount across all active certs', () => {
    const expected = CERTIFICATION_LIST.filter(c => c.status === 'active').reduce(
      (sum, c) => sum + c.domains.reduce((s, d) => s + d.questionCount, 0),
      0,
    )
    expect(getActiveTotalQuestions()).toBe(expected)
  })

  it('does not include coming-soon certs', () => {
    const comingSoonTotal = CERTIFICATION_LIST.filter(c => c.status === 'coming-soon').reduce(
      (sum, c) => sum + c.domains.reduce((s, d) => s + d.questionCount, 0),
      0,
    )
    const all = CERTIFICATION_LIST.reduce(
      (sum, c) => sum + c.domains.reduce((s, d) => s + d.questionCount, 0),
      0,
    )
    expect(getActiveTotalQuestions()).toBe(all - comingSoonTotal)
  })
})

describe('getCertTotalQuestions', () => {
  it('sums domain questionCount within a cert', () => {
    const cert = CERTIFICATIONS['clf-c02']
    const expected = cert.domains.reduce((s, d) => s + d.questionCount, 0)
    expect(getCertTotalQuestions('clf-c02')).toBe(expected)
  })

  it('returns 0 for unknown certs', () => {
    expect(getCertTotalQuestions('nope')).toBe(0)
  })
})

describe('getCertDomains + getCertDomainCounts', () => {
  it('returns a domain-id-keyed map for known certs', () => {
    const names = getCertDomains('clf-c02')
    const counts = getCertDomainCounts('clf-c02')
    expect(Object.keys(names).length).toBe(CERTIFICATIONS['clf-c02'].domains.length)
    expect(Object.keys(counts).length).toBe(CERTIFICATIONS['clf-c02'].domains.length)
  })

  it('returns empty object for unknown certs', () => {
    expect(getCertDomains('nope')).toEqual({})
    expect(getCertDomainCounts('nope')).toEqual({})
  })
})

describe('PROVIDERS registry', () => {
  it('has an entry for every CertProvider value used by certs', () => {
    const usedProviders = new Set<CertProvider>(CERTIFICATION_LIST.map(c => c.provider))
    for (const p of usedProviders) {
      expect(PROVIDERS[p]).toBeDefined()
      expect(PROVIDERS[p].label).toBeTruthy()
      expect(PROVIDERS[p].tagline).toBeTruthy()
    }
  })
})

describe('getProviderInfo', () => {
  it('returns the ProviderInfo for known providers', () => {
    const aws = getProviderInfo('aws')
    expect(aws?.code).toBe('aws')
    expect(aws?.label).toBe('AWS')
  })

  it('returns null for unknown providers', () => {
    expect(getProviderInfo('oracle')).toBeNull()
    expect(getProviderInfo('')).toBeNull()
    expect(getProviderInfo(undefined)).toBeNull()
  })
})

describe('getProviderLabel', () => {
  it('returns the registry label for known providers', () => {
    expect(getProviderLabel('aws')).toBe('AWS')
    expect(getProviderLabel('azure')).toBe('Azure')
    expect(getProviderLabel('gcp')).toBe('Google Cloud')
  })

  it('falls back to upper-case for unknown providers', () => {
    expect(getProviderLabel('oracle')).toBe('ORACLE')
  })
})

describe('CLF-C02 exam config matches the official AWS spec', () => {
  it('uses 65 questions, 90 minutes, and 700 to pass', () => {
    const clf = CERTIFICATIONS['clf-c02']
    expect(clf.examQuestionCount).toBe(65)
    expect(clf.examTimeSeconds).toBe(90 * 60)
    expect(clf.passingScore).toBe(700)
  })
})

describe('AIF-C01 exam config matches the official AWS spec', () => {
  it('uses 65 questions, 90 minutes, and 700 to pass', () => {
    const aif = CERTIFICATIONS['aif-c01']
    expect(aif.examQuestionCount).toBe(65)
    expect(aif.examTimeSeconds).toBe(90 * 60)
    expect(aif.passingScore).toBe(700)
  })

  it('ships AIF-C01 as a GA active cert (no beta metadata) aligned to an exam guide', () => {
    const aif = CERTIFICATIONS['aif-c01']
    expect(aif.status).toBe('active')
    // AIF-C01 ships GA and indexable on day one; the legacy beta-banner
    // metadata was removed with the CertBetaBanner component.
    expect('beta' in aif).toBe(false)
    expect('referenceCert' in aif).toBe(false)
    expect(aif.examGuideVersion).toBe('AIF-C01 (1.1, April 2026)')
  })
})

describe('SAA-C03 exam config matches the official AWS spec', () => {
  it('uses 65 questions, 130 minutes, and 720 to pass', () => {
    const saa = CERTIFICATIONS['saa-c03']
    expect(saa.examQuestionCount).toBe(65)
    expect(saa.examTimeSeconds).toBe(130 * 60)
    expect(saa.passingScore).toBe(720)
  })
})

describe('examFormat stays consistent with the canonical top-level fields', () => {
  // Guards the L1/L2 desync bug: AIF-C01 shipped examFormat
  // { questionCount: 50, timeMinutes: 85 } while the top-level fields and AWS
  // said 65q / 90min, so ExamRealismTable rendered figures that contradicted
  // the rest of the cert. Any cert carrying examFormat must keep it in lockstep
  // with examQuestionCount / examTimeSeconds / passingScore.
  for (const cert of CERTIFICATION_LIST.filter(c => c.examFormat)) {
    it(`${cert.code} examFormat matches its top-level exam fields`, () => {
      const fmt = cert.examFormat!
      expect(fmt.questionCount).toBe(cert.examQuestionCount)
      expect(fmt.timeMinutes).toBe(cert.examTimeSeconds / 60)
      expect(fmt.passingScore).toBe(cert.passingScore)
    })
  }
})
