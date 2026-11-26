import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import type { CertLevel } from '../data/certifications'
import { LEVEL_ACCENT_HEX, LEVEL_ACCENT_RGB } from './levelAccent'

const CERT_LEVELS: CertLevel[] = ['foundational', 'associate', 'professional', 'specialty']

function extractScriptLevelAccents(source: string): Record<string, string> {
  const objectMatch = source.match(/const\s+LEVEL_ACCENT\s*=\s*\{([\s\S]*?)\}/)
  if (!objectMatch) throw new Error('LEVEL_ACCENT object not found')

  const entries = [...objectMatch[1].matchAll(
    /^\s*(foundational|associate|professional|specialty):\s*'(#[0-9A-Fa-f]{6})',?\s*$/gm,
  )]
  return Object.fromEntries(entries.map(([, level, value]) => [level, value]))
}

function hexToRgbString(hex: string): string {
  const pairs = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)]
  return pairs.map(pair => parseInt(pair, 16)).join(' ')
}

describe('LEVEL_ACCENT script sync', () => {
  it('matches the generator level accent values exactly', () => {
    const script = readFileSync(new URL('../../scripts/generate-og-images.mjs', import.meta.url), 'utf8')

    expect(extractScriptLevelAccents(script)).toEqual(LEVEL_ACCENT_HEX)
  })
})

describe('level accent keys', () => {
  it('includes every certification level in both maps', () => {
    expect(Object.keys(LEVEL_ACCENT_HEX).sort()).toEqual([...CERT_LEVELS].sort())
    expect(Object.keys(LEVEL_ACCENT_RGB).sort()).toEqual([...CERT_LEVELS].sort())
  })
})

describe('level accent color formats', () => {
  it('matches each RGB triplet to the decimal conversion of its hex value', () => {
    CERT_LEVELS.forEach(level => {
      expect(LEVEL_ACCENT_RGB[level]).toBe(hexToRgbString(LEVEL_ACCENT_HEX[level]))
    })
  })
})
