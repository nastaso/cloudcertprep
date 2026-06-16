/**
 * Split FAQ answer text into linkable fragments for rendering. Bare http(s)
 * URLs become links; the surrounding prose stays plain text.
 *
 * Trailing sentence punctuation (. , ; : ! ?) is peeled off the matched URL
 * and emitted as text, so a URL that ends a sentence does not link to a 404.
 * For example "...github.com/nastaso/cloudcertprep." links to
 * ".../cloudcertprep" with the period rendered after it, not as part of the
 * href. Used by Faq.astro (registry render mode).
 */
export interface LinkFragment {
  text: string
  isLink: boolean
}

export function splitLinks(text: string): LinkFragment[] {
  return text
    .split(/(https?:\/\/[^\s)]+)/g)
    .filter(Boolean)
    .flatMap(part => {
      if (!/^https?:\/\//.test(part)) return [{ text: part, isLink: false }]
      const trailing = part.match(/[.,;:!?]+$/)
      if (!trailing) return [{ text: part, isLink: true }]
      const url = part.slice(0, part.length - trailing[0].length)
      return [
        { text: url, isLink: true },
        { text: trailing[0], isLink: false },
      ]
    })
}
