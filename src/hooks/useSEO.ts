import { useEffect } from 'react'
import { DEFAULT_SEO, SITE_URL } from '../lib/seo-data'

interface SEOOptions {
  title: string
  description?: string
  /**
   * Canonical path (no domain). Pass `null` to skip canonical updates
   * (use this for noindex routes like /login).
   */
  canonical?: string | null
}

/**
 * Update per-route SEO metadata: <title>, <meta name="description">,
 * <link rel="canonical">, and the OG/Twitter mirrors.
 *
 * Single source of truth for head mutations on route change. Restores the
 * default SEO state on unmount so subsequent routes get a clean slate.
 *
 * Why this exists: serving identical metadata from index.html for every
 * route causes Google to canonicalise everything to the homepage, blocking
 * deep pages from ranking on their own keywords.
 */
export function useSEO({ title, description, canonical }: SEOOptions): void {
  useEffect(() => {
    document.title = title

    if (description !== undefined) {
      setMetaContent('name', 'description', description)
      setMetaContent('property', 'og:description', description)
      setMetaContent('property', 'twitter:description', description)
    }

    setMetaContent('property', 'og:title', title)
    setMetaContent('property', 'twitter:title', title)

    if (canonical !== undefined && canonical !== null) {
      const fullUrl = `${SITE_URL}${canonical}`
      setLinkHref('canonical', fullUrl)
      setMetaContent('property', 'og:url', fullUrl)
      setMetaContent('property', 'twitter:url', fullUrl)
    }

    return () => {
      document.title = DEFAULT_SEO.title
      setMetaContent('name', 'description', DEFAULT_SEO.description)
      setMetaContent('property', 'og:title', DEFAULT_SEO.title)
      setMetaContent('property', 'og:description', DEFAULT_SEO.description)
      setMetaContent('property', 'twitter:title', DEFAULT_SEO.title)
      setMetaContent('property', 'twitter:description', DEFAULT_SEO.description)
      const homeUrl = `${SITE_URL}/`
      setLinkHref('canonical', homeUrl)
      setMetaContent('property', 'og:url', homeUrl)
      setMetaContent('property', 'twitter:url', homeUrl)
    }
  }, [title, description, canonical])
}

function setMetaContent(attr: 'name' | 'property', key: string, value: string): void {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attr, key)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', value)
}

function setLinkHref(rel: string, href: string): void {
  let tag = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!tag) {
    tag = document.createElement('link')
    tag.setAttribute('rel', rel)
    document.head.appendChild(tag)
  }
  tag.setAttribute('href', href)
}
