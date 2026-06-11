// Generates per-cert and per-domain Open Graph composite images at prebuild
// time using satori (JSX -> SVG) + @resvg/resvg-js (SVG -> PNG).
//
// Output: public/og/og-<certCode>.png and
//         public/og/og-<certCode>-<domainSlug>.png
//
// Single source of truth for cert/domain data is src/data/certifications.ts,
// parsed with the same lightweight regex approach used by
// generate-seo-assets.mjs (avoids pulling tsx/esbuild into the build chain).
//
// The Inter fonts are read from committed assets under public/fonts/og/ (TTF).
// Committing them removes the node_modules runtime dependency for font loading
// at prebuild time, making OG generation more robust. The TTFs were produced by
// losslessly converting @fontsource/inter's WOFF (latin 400/700) to plain sfnt
// TTF (WOFF is just a compressed sfnt container; satori accepts ttf/otf/woff
// but not woff2). The accompanying SIL OFL 1.1 LICENSE lives alongside them.
// They are used ONLY here; they are NEVER referenced from any prerendered HTML,
// and BaseLayout.astro must not preload or font-face them (R6.13). The live
// pages keep the existing system font stack.
//
// Fallback strategy (R6.14, design "Fallback strategy"): if a composite fails
// to render, the script copies the platform-level public/og-image.png into the
// expected path so every page still ships a valid OG image, logs a warning,
// and — when run with --strict (CI / Delivery Phase 3) — exits non-zero.
// Locally (no --strict) it exits zero so the developer is not blocked.
//
// Wired into `prebuild` after generate-seo-assets.mjs and before astro build.

import { writeFileSync, readFileSync, mkdirSync, copyFileSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CERT_REGISTRY_PATH = resolve(__dirname, '../src/data/certifications.ts')
const OG_DIR = resolve(__dirname, '../public/og')
const FALLBACK_OG = resolve(__dirname, '../public/og-image.png')
const LOGO_SVG_PATH = resolve(__dirname, '../public/logo-email.svg')
const FONT_REGULAR = resolve(__dirname, '../public/fonts/og/Inter-Regular.ttf')
const FONT_BOLD = resolve(__dirname, '../public/fonts/og/Inter-Bold.ttf')

const strict = process.argv.includes('--strict')

// Brand palette — REAL project tokens (src/index.css). The previous template
// used #0F1923 (a navy that exists in NO token) + a stale #EA8C00 orange;
// this aligns the OG composites with the actual brand so the share cards match
// the site. Background = AWS Console navy (--color-header-bg #232F3E), the same
// chrome color as the site header. (§7)
const BG_NAVY = '#232F3E'        // --color-header-bg
const AWS_ORANGE = '#FF9900'     // --color-brand
const TEXT_PRIMARY = '#FFFFFF'   // on-header white
const TEXT_MUTED = '#A8A29E'     // --color-text-muted (dark)

const WIDTH = 1200
const HEIGHT = 630

// --- Parse cert registry (codes, short names, domains) ---
const CERT_CODE_REGEX = /^[a-z]+-[a-z0-9]+$/

function slugifyDomain(name) {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseCertRegistry() {
  const source = readFileSync(CERT_REGISTRY_PATH, 'utf8')
  const objectRegex = /'([a-z0-9-]+)':\s*\{([\s\S]*?)\n\s*\},?/g
  const certs = []
  let match
  while ((match = objectRegex.exec(source)) !== null) {
    const [, code, body] = match
    if (!CERT_CODE_REGEX.test(code)) continue
    const provider = body.match(/provider:\s*'([a-z0-9-]+)'/)?.[1]
    const status = body.match(/status:\s*'([a-z-]+)'/)?.[1]
    const name = body.match(/name:\s*'([^']+)'/)?.[1]
    const shortName = body.match(/shortName:\s*'([^']+)'/)?.[1]
    if (!provider || !status || !name || !shortName) continue
    // Match a domain object up to examProportion, tolerating trailing fields
    // (weight, taskRange, ...) that some certs carry after it. The previous
    // `examProportion:\s*[\d.]+\s*\}` required the object to END at
    // examProportion, so CLF-C02/AIF-C01 domains (which now append
    // weight/taskRange) silently produced ZERO domains and only their bare
    // per-cert card rendered. Mirrors the tolerant `[^}]*\}` pattern already
    // used by generate-seo-assets.mjs. (per-domain OG fix)
    const domainEntryRegex = /\{\s*id:\s*\d+,\s*name:\s*'([^']+)',\s*questionCount:\s*\d+,\s*examProportion:\s*[\d.]+[^}]*\}/g
    const domains = [...body.matchAll(domainEntryRegex)].map(m => ({
      name: m[1],
      slug: slugifyDomain(m[1]),
    }))
    certs.push({ code, provider, status, name, shortName, domains })
  }
  return certs
}

// --- satori template ---
// A satori JSX-style object tree (satori accepts the React element shape
// without JSX). Layout (§7): navy background, orange top stripe, the
// cloud+check logo lockup top-left, the cert FULL NAME as the headline, a
// "Free … Practice Exams" tagline, an optional orange domain line, and the
// CloudCertPrep wordmark bottom-right.
//
// `logoDataUri` is a data: URI of public/logo-email.svg (white tile + orange
// cloud + white check), loaded once in main() and passed through.
function template({ title, tagline, domainName, logoDataUri }) {
  const headerChildren = []
  if (logoDataUri) {
    headerChildren.push({
      type: 'img',
      props: { src: logoDataUri, width: 88, height: 88 },
    })
  }
  headerChildren.push({
    type: 'div',
    props: {
      style: { fontSize: 36, fontWeight: 700, color: TEXT_PRIMARY, marginLeft: logoDataUri ? 24 : 0 },
      children: 'CloudCertPrep',
    },
  })

  const children = [
    // Top accent stripe
    {
      type: 'div',
      props: {
        style: { position: 'absolute', top: 0, left: 0, right: 0, height: 12, backgroundColor: AWS_ORANGE },
      },
    },
    // Logo lockup row (top-left)
    {
      type: 'div',
      props: {
        style: { display: 'flex', alignItems: 'center', position: 'absolute', top: 56, left: 64 },
        children: headerChildren,
      },
    },
    // Headline: cert full name (or platform headline)
    {
      type: 'div',
      props: {
        style: { fontSize: 72, fontWeight: 700, color: TEXT_PRIMARY, lineHeight: 1.1, maxWidth: 1040 },
        children: title,
      },
    },
    // Tagline: "Free … Practice Exams"
    {
      type: 'div',
      props: {
        style: { fontSize: 40, fontWeight: 700, color: AWS_ORANGE, marginTop: 20 },
        children: tagline,
      },
    },
  ]

  if (domainName) {
    children.push({
      type: 'div',
      props: {
        style: { fontSize: 38, fontWeight: 400, color: TEXT_MUTED, marginTop: 12, maxWidth: 1040 },
        children: domainName,
      },
    })
  }

  // No-signup trust line, bottom-right
  children.push({
    type: 'div',
    props: {
      style: {
        position: 'absolute',
        bottom: 48,
        right: 64,
        fontSize: 26,
        fontWeight: 400,
        color: TEXT_MUTED,
      },
      children: 'Free · Open source · No signup',
    },
  })

  return {
    type: 'div',
    props: {
      style: {
        width: WIDTH,
        height: HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        backgroundColor: BG_NAVY,
        padding: '64px',
        position: 'relative',
        fontFamily: 'Inter',
      },
      children,
    },
  }
}

async function renderPng(spec, fonts) {
  const svg = await satori(template(spec), { width: WIDTH, height: HEIGHT, fonts })
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } })
  return resvg.render().asPng()
}

async function main() {
  mkdirSync(OG_DIR, { recursive: true })

  const fonts = [
    { name: 'Inter', data: readFileSync(FONT_REGULAR), weight: 400, style: 'normal' },
    { name: 'Inter', data: readFileSync(FONT_BOLD), weight: 700, style: 'normal' },
  ]

  // Load the logo lockup (white tile + orange cloud + white check) as a data:
  // URI so satori can embed it. Falls back to no logo if the asset is missing.
  let logoDataUri = null
  try {
    const svg = readFileSync(LOGO_SVG_PATH, 'utf8')
    logoDataUri = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
  } catch {
    console.warn(`⚠ logo not found at ${LOGO_SVG_PATH}; OG cards will render without the lockup`)
  }

  // Platform root card (public/og-image.png): cert-AGNOSTIC default used by
  // BaseLayout's fallback on home/about/stats and any page without a per-cert
  // composite. Rendered through the SAME satori pipeline so one template/font/
  // palette covers every card (§7 items 4 + 5). Render it FIRST so the refreshed
  // file is also the fallback source for any composite that fails below.
  try {
    const rootPng = await renderPng(
      { title: 'Free AWS Certification Practice Exams', tagline: 'Open source · No signup · No ads', domainName: null, logoDataUri },
      fonts,
    )
    writeFileSync(FALLBACK_OG, rootPng)
    console.log('✓ platform root og-image.png regenerated through satori pipeline')
  } catch (err) {
    console.warn(`⚠ platform root og-image.png render failed (keeping existing): ${err.message}`)
  }

  const certs = parseCertRegistry()
  // Enumerate every (cert) and (cert, domain) pair — including coming-soon
  // certs, so they get a themed image if their landing is ever shared.
  // `title` carries the cert FULL NAME (not the bare code) and `tagline`
  // carries the "Free … Practice Exams" message (§7 item 3).
  const targets = []
  // Blog-wide default OG composite (used by /blog and any post without its own
  // ogImage). Themed like the cert composites but with the blog message.
  targets.push({
    file: 'og-blog.png',
    title: 'AWS Certification Blog',
    tagline: 'Free study guides & exam tips',
    domainName: null,
  })
  for (const cert of certs) {
    targets.push({
      file: `og-${cert.code}.png`,
      title: cert.name,
      tagline: 'Free Practice Exams',
      domainName: cert.shortName,
    })
    for (const domain of cert.domains) {
      targets.push({
        file: `og-${cert.code}-${domain.slug}.png`,
        title: cert.name,
        tagline: 'Free Practice Exams',
        domainName: domain.name,
      })
    }
  }

  let rendered = 0
  let fellBack = 0
  const failures = []

  for (const t of targets) {
    const outPath = resolve(OG_DIR, t.file)
    try {
      const png = await renderPng({ title: t.title, tagline: t.tagline, domainName: t.domainName, logoDataUri }, fonts)
      writeFileSync(outPath, png)
      rendered++
    } catch (err) {
      failures.push(`${t.file}: ${err.message}`)
      // Fallback: copy the platform-level OG so the page still ships valid OG.
      if (existsSync(FALLBACK_OG)) {
        copyFileSync(FALLBACK_OG, outPath)
        fellBack++
      }
    }
  }

  // Assert every expected file now exists on disk (R6.14).
  const missing = targets.filter(t => !existsSync(resolve(OG_DIR, t.file)))

  console.log(`✓ OG images: ${rendered} rendered, ${fellBack} fell back, ${targets.length} expected`)

  // Delivery Phase 3 strict assertions (R19.5): PNG, exactly 1200x630, <=300KB.
  if (strict) {
    const violations = []
    for (const t of targets) {
      const p = resolve(OG_DIR, t.file)
      if (!existsSync(p)) {
        violations.push(`${t.file}: missing`)
        continue
      }
      const sizeKb = statSync(p).size / 1024
      if (sizeKb > 300) violations.push(`${t.file}: ${sizeKb.toFixed(0)}KB > 300KB`)
      // Dimension check via PNG IHDR (bytes 16-24): width/height big-endian.
      const buf = readFileSync(p)
      const w = buf.readUInt32BE(16)
      const h = buf.readUInt32BE(20)
      if (w !== WIDTH || h !== HEIGHT) violations.push(`${t.file}: ${w}x${h} != ${WIDTH}x${HEIGHT}`)
    }
    if (failures.length || violations.length) {
      console.error('✗ OG image strict checks failed:')
      ;[...failures, ...violations].forEach(v => console.error(`  - ${v}`))
      process.exit(1)
    }
  } else if (failures.length) {
    console.warn(`⚠ ${failures.length} OG image(s) fell back to og-image.png:`)
    failures.forEach(f => console.warn(`  - ${f}`))
  }

  if (missing.length) {
    console.error(`✗ ${missing.length} expected OG file(s) still missing after fallback:`)
    missing.forEach(m => console.error(`  - ${m.file}`))
    process.exit(1)
  }
}

main().catch(err => {
  console.error('✗ generate-og-images.mjs failed:', err)
  process.exit(1)
})
