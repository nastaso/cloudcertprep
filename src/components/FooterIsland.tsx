import { Footer } from './Footer'

/**
 * Thin island wrapper for mounting Footer inside Astro pages. Footer no
 * longer depends on react-router-dom, and useTheme() is a module singleton,
 * so this is a plain re-export.
 */
export default function FooterIsland() {
  return <Footer />
}
