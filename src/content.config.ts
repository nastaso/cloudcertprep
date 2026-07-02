import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

/**
 * Blog collection (Astro 6 content layer + glob loader).
 *
 * Config lives at src/content.config.ts (NOT src/content/config.ts) per the
 * Astro 6 content layer API. Posts are plain markdown under src/content/blog.
 *
 * `ogImage` is a public path string (e.g. '/og/og-blog.png'), not the image()
 * helper, to keep the glob loader simple. `author` defaults to the site author
 * so every post is anchored to the Person entity (@id) in BaseLayout's graph.
 */
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string().min(10).max(80),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    description: z.string().min(50).max(160),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    // Tag taxonomy (G5 content-scale pre-flight): every non-draft post MUST
    // include at least one cert-code tag (e.g. 'clf-c02', 'aif-c01' - matches
    // `certifications.ts`'s `code` field; enforced by
    // scripts/validate-blog-frontmatter.mjs), so the post always shows up in
    // that cert's domain-landing "latest posts" fallback
    // (src/pages/aws/[cert]/[domain].astro's certTaggedPosts). Add a
    // domain-slug tag too (e.g. 'cloud-concepts', 'security-and-compliance' -
    // matches the domain landing's URL segment) ONLY when the post is
    // genuinely about that one domain, not a broad/comparison post - a
    // domain-slug tag promotes the post to the front of that domain's own
    // landing page. Additional free-form topical tags (e.g. 'exam-format',
    // 'career', 'study-tips') are fine alongside the required cert-code tag.
    tags: z.array(z.string()).default([]),
    ogImage: z.string().optional(),
    draft: z.boolean().default(false),
    // Optional FAQ pairs. When present, BlogLayout emits an FAQPage JSON-LD
    // block (an AI-citation / answer-engine signal) alongside the post's
    // BlogPosting graph. Author the same Q&A visibly in the post body so the
    // structured data mirrors what readers see.
    faq: z
      .array(z.object({ q: z.string().min(1), a: z.string().min(1) }))
      .default([]),
    canonical: z.string().url().optional(),
    author: z
      .object({
        name: z.literal('Alex Santonastaso'),
        id: z.literal('https://www.cloudcertprep.io/#author'),
      })
      .default({
        name: 'Alex Santonastaso',
        id: 'https://www.cloudcertprep.io/#author',
      }),
  }),
})

export const collections = { blog }
