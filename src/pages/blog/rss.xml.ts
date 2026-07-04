/**
 * RSS feed for the blog (/blog/rss.xml).
 *
 * Emits non-draft posts (in PROD; all posts in dev), newest first, using
 * @astrojs/rss. `context.site` comes from `site` in astro.config.mjs.
 */
import rss from '@astrojs/rss'
import { getCollection, type CollectionEntry } from 'astro:content'
import type { APIContext } from 'astro'
import { includeDrafts } from '../../lib/posts'

export async function GET(context: APIContext) {
  const posts = await getCollection('blog', ({ data }: CollectionEntry<'blog'>) =>
    includeDrafts || data.draft !== true,
  )
  const sorted = posts.sort(
    (a: CollectionEntry<'blog'>, b: CollectionEntry<'blog'>) =>
      b.data.date.getTime() - a.data.date.getTime(),
  )
  const site = context.site ?? new URL('https://www.cloudcertprep.io')
  const selfHref = new URL('/blog/rss.xml', site).href

  return rss({
    title: 'CloudCertPrep Blog',
    description:
      'Guides, exam-format breakdowns, and study strategy for AWS certification exams from the CloudCertPrep team.',
    site,
    // `format: 'file'` serves posts at /blog/slug with no trailing slash, so
    // item links must match (issue #71) or they 404 via the canonical redirect.
    trailingSlash: false,
    xmlns: { atom: 'http://www.w3.org/2005/Atom' },
    customData: `<atom:link href="${selfHref}" rel="self" type="application/rss+xml"/>`,
    items: sorted.map((post: CollectionEntry<'blog'>) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: `/blog/${post.data.slug}`,
      categories: post.data.tags,
    })),
  })
}
