/**
 * RSS feed for the blog (/blog/rss.xml).
 *
 * Emits non-draft posts (in PROD; all posts in dev), newest first, using
 * @astrojs/rss. `context.site` comes from `site` in astro.config.mjs.
 */
import rss from '@astrojs/rss'
import { getCollection, type CollectionEntry } from 'astro:content'
import type { APIContext } from 'astro'

export async function GET(context: APIContext) {
  const posts = await getCollection('blog', ({ data }: CollectionEntry<'blog'>) =>
    import.meta.env.PROD ? data.draft !== true : true,
  )
  const sorted = posts.sort(
    (a: CollectionEntry<'blog'>, b: CollectionEntry<'blog'>) =>
      b.data.date.getTime() - a.data.date.getTime(),
  )

  return rss({
    title: 'CloudCertPrep Blog',
    description:
      'Guides, exam-format breakdowns, and study strategy for AWS certification exams from the CloudCertPrep team.',
    site: context.site ?? 'https://www.cloudcertprep.io',
    items: sorted.map((post: CollectionEntry<'blog'>) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: `/blog/${post.data.slug}`,
      categories: post.data.tags,
    })),
  })
}
