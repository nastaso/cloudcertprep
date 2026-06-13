import { describe, it, expect } from 'vitest'
import { serializeJsonLd } from './jsonld'

describe('serializeJsonLd', () => {
  it('round-trips to the identical object', () => {
    const obj = { '@type': 'Thing', name: 'Hello', list: [1, 2, 3] }
    expect(JSON.parse(serializeJsonLd(obj))).toEqual(obj)
  })

  it('escapes < so a </script> sequence cannot break out', () => {
    const out = serializeJsonLd({ name: '</script><script>alert(1)</script>' })
    expect(out).not.toContain('</script>')
    expect(out).not.toContain('<script>')
    expect(out).toContain('\\u003c')
    // still parses back to the original string
    expect(JSON.parse(out).name).toBe('</script><script>alert(1)</script>')
  })

  it('escapes < in HTML-comment openers too', () => {
    const out = serializeJsonLd({ note: '<!-- comment -->' })
    expect(out).not.toContain('<!--')
    expect(JSON.parse(out).note).toBe('<!-- comment -->')
  })

  it('escapes U+2028 / U+2029 line separators', () => {
    const out = serializeJsonLd({ s: 'a\u2028b\u2029c' })
    expect(out).not.toContain('\u2028')
    expect(out).not.toContain('\u2029')
    expect(JSON.parse(out).s).toBe('a\u2028b\u2029c')
  })

  it('leaves payloads without special chars byte-identical to JSON.stringify', () => {
    const obj = { '@context': 'https://schema.org', '@type': 'Person', name: 'Alex' }
    expect(serializeJsonLd(obj)).toBe(JSON.stringify(obj))
  })
})
