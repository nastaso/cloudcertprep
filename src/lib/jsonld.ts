/**
 * Safe JSON-LD serializer for inline `<script type="application/ld+json">`
 * blocks. Plain `JSON.stringify` can emit a literal `</script>` (or `<!--`)
 * sequence when user-influenced content (e.g. blog frontmatter title/tags)
 * flows into the graph, letting a crafted string break out of the script
 * element and inject markup. Because the shipped CSP still allows
 * `script-src 'unsafe-inline'`, such an injected `<script>` would execute.
 *
 * Escaping `<` to its `\u003c` JSON unicode escape makes `</script>` and
 * `<!--` impossible to form while producing a byte string that parses to the
 * identical object. We also escape U+2028/U+2029 (valid in JSON, invalid in
 * raw JS string literals) for completeness. (security V6)
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
