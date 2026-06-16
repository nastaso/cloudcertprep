import { describe, it, expect } from 'vitest'
import { splitLinks } from './faqLinks'

const joined = (frags: { text: string }[]) => frags.map(f => f.text).join('')
const linkOf = (frags: { text: string; isLink: boolean }[]) => frags.find(f => f.isLink)?.text

describe('splitLinks', () => {
  it('returns a single plain fragment when there is no URL', () => {
    expect(splitLinks('no links here')).toEqual([{ text: 'no links here', isLink: false }])
  })

  it('links a bare URL surrounded by prose', () => {
    const frags = splitLinks('see https://example.com/x for more')
    expect(linkOf(frags)).toBe('https://example.com/x')
    expect(frags.filter(f => f.isLink)).toHaveLength(1)
  })

  it('peels a trailing period off the URL (the reported FAQ 404 bug)', () => {
    const frags = splitLinks('fork it at https://github.com/nastaso/cloudcertprep.')
    expect(linkOf(frags)).toBe('https://github.com/nastaso/cloudcertprep')
  })

  it('peels a trailing comma off the URL', () => {
    const frags = splitLinks('guide at https://docs.aws.amazon.com/x.html, kept updated')
    expect(linkOf(frags)).toBe('https://docs.aws.amazon.com/x.html')
  })

  it('keeps internal dots, the path .yml, and query strings inside the URL', () => {
    expect(linkOf(splitLinks('watch https://www.youtube.com/watch?v=NhDYbskXRgc.')))
      .toBe('https://www.youtube.com/watch?v=NhDYbskXRgc')
    expect(linkOf(splitLinks('open https://github.com/x/issues/new?template=report-question-error.yml.')))
      .toBe('https://github.com/x/issues/new?template=report-question-error.yml')
  })

  it('does not absorb a closing paren into the URL', () => {
    expect(linkOf(splitLinks('(see https://example.com/x)'))).toBe('https://example.com/x')
  })

  it('never drops or adds characters (round-trip)', () => {
    for (const input of [
      'no links here',
      'fork it at https://github.com/nastaso/cloudcertprep. Thanks',
      'a https://a.com/1, b https://b.com/2.',
      '(see https://example.com/x) and more',
    ]) {
      expect(joined(splitLinks(input))).toBe(input)
    }
  })
})
