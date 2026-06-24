/**
 * Whether draft blog posts should be rendered in this build.
 *
 * Drafts always render in `astro dev`. In a production build they are excluded,
 * EXCEPT when `PUBLIC_PREVIEW_DRAFTS=true` is set in the environment. That flag
 * is intended for branch/preview deployments, so unpublished drafts can be
 * reviewed on a deployed URL without ever shipping to prod. It is default-off,
 * so production (and `main`) behaviour is unchanged: drafts stay hidden.
 */
export const includeDrafts =
  !import.meta.env.PROD || import.meta.env.PUBLIC_PREVIEW_DRAFTS === 'true'
