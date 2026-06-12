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
const FONT_REGULAR = resolve(__dirname, '../public/fonts/og/Inter-Regular.ttf')
const FONT_BOLD = resolve(__dirname, '../public/fonts/og/Inter-Bold.ttf')

const strict = process.argv.includes('--strict')

// Brand palette — DSv5 "big OSS project" identity: near-black ink stage with
// an orange glow (the same hero stage the site renders), one accent hue per
// cert family so every share card and every cert tile on the site comes from
// ONE pipeline. (Research refs: Linear/Supabase dark stage, Astro accent
// families, roadmap.sh restraint.)
const BG_INK = '#0E1116'         // hero stage ink (site .stage)
const AWS_ORANGE = '#FF9900'     // --color-brand
const TEXT_PRIMARY = '#F4F6F8'
const TEXT_MUTED = '#8B95A3'
const HAIRLINE = 'rgba(255,255,255,0.14)'

// Accent = OFFICIAL AWS certification LEVEL color (the badge colors every
// AWS-cert candidate already recognizes): Foundational silver, Associate
// blue, Professional copper, Specialty purple. Mirrored in
// src/lib/levelAccent.ts for site components; keep both in sync.
const LEVEL_ACCENT = {
  foundational: '#A8B9C9',
  associate: '#4C9AFF',
  professional: '#C8793B',
  specialty: '#8B5CF6',
}
const accentFor = level => LEVEL_ACCENT[level] ?? AWS_ORANGE

const WIDTH = 1200
const HEIGHT = 630
// Cert tile art (consumed by src/components/landing/CertTile.astro as
// /og/card-<code>.png) — 16:9, 2x for retina.
const CARD_W = 720
const CARD_H = 405

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
    const level = body.match(/level:\s*'([a-z]+)'/)?.[1]
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
    certs.push({ code, provider, status, name, shortName, level, domains })
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
function template({ title, tagline, domainName, code, level, logoDataUri }) {
  const accent = accentFor(level)
  const headerChildren = []
  if (logoDataUri) {
    headerChildren.push({
      type: 'img',
      props: { src: logoDataUri, width: 64, height: 64 },
    })
  }
  headerChildren.push({
    type: 'div',
    props: {
      style: { fontSize: 30, fontWeight: 700, color: TEXT_PRIMARY, marginLeft: logoDataUri ? 18 : 0, letterSpacing: -0.5 },
      children: 'CloudCertPrep',
    },
  })

  const children = [
    // Accent glow field (top-right) + faint counter-glow bottom-left
    {
      type: 'div',
      props: {
        style: {
          position: 'absolute', top: 96, right: -120, width: 420, height: 30,
          borderRadius: 15, backgroundColor: accent, transform: 'rotate(-32deg)',
        },
      },
    },
    {
      type: 'div',
      props: {
        style: {
          position: 'absolute', top: 188, right: -150, width: 340, height: 30,
          borderRadius: 15, backgroundColor: `${accent}59`, transform: 'rotate(-32deg)',
        },
      },
    },
    {
      type: 'div',
      props: {
        style: {
          position: 'absolute', top: 280, right: -180, width: 260, height: 30,
          borderRadius: 15, backgroundColor: `${accent}26`, transform: 'rotate(-32deg)',
        },
      },
    },
    // Hairline frame (premium print feel)
    {
      type: 'div',
      props: {
        style: {
          position: 'absolute', top: 28, left: 28, right: 28, bottom: 28,
          border: `1px solid ${HAIRLINE}`, borderRadius: 24,
        },
      },
    },
    // Logo lockup row (top-left)
    {
      type: 'div',
      props: {
        style: { display: 'flex', alignItems: 'center', position: 'absolute', top: 64, left: 72 },
        children: headerChildren,
      },
    },
    // Mono code chip (top-right) when a cert code exists
    ...(code
      ? [{
          type: 'div',
          props: {
            style: {
              position: 'absolute', top: 70, right: 72,
              display: 'flex', alignItems: 'center',
              fontSize: 24, fontWeight: 700, letterSpacing: 4,
              color: accent, border: `1.5px solid ${accent}66`,
              borderRadius: 10, padding: '8px 16px',
            },
            children: code.toUpperCase(),
          },
        }]
      : []),
    // Headline: cert full name (or platform headline)
    {
      type: 'div',
      props: {
        style: { fontSize: 76, fontWeight: 700, color: TEXT_PRIMARY, lineHeight: 1.08, maxWidth: 980, letterSpacing: -2 },
        children: title,
      },
    },
    // Tagline in the accent
    {
      type: 'div',
      props: {
        style: { fontSize: 38, fontWeight: 700, color: accent, marginTop: 22 },
        children: tagline,
      },
    },
  ]

  if (domainName) {
    children.push({
      type: 'div',
      props: {
        style: { fontSize: 34, fontWeight: 400, color: TEXT_MUTED, marginTop: 14, maxWidth: 980 },
        children: domainName,
      },
    })
  }

  // Trust line, bottom-left (mirrors the site's metrics row)
  children.push({
    type: 'div',
    props: {
      style: {
        position: 'absolute', bottom: 60, left: 72,
        fontSize: 24, fontWeight: 400, color: TEXT_MUTED, letterSpacing: 0.5,
      },
      children: '100% free · Open source · No signup',
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
        backgroundColor: BG_INK,
        padding: '72px',
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

// --- Cert tile art (site-facing, /og/card-<code>.png) ---
// Pure brand art, no headline: ink stage, accent glow, oversized mono cert
// code, hairline frame, three accent nodes. CertTile.astro renders the title
// in HTML, so the art stays text-light and never duplicates the card body.
function cardTemplate({ shortName, level, logoDataUri }) {
  const accent = accentFor(level)
  return {
    type: 'div',
    props: {
      style: {
        width: CARD_W, height: CARD_H, display: 'flex',
        backgroundColor: BG_INK, position: 'relative', fontFamily: 'Inter',
      },
      children: [
        // Crisp diagonal bar motif (DSv5.2): engineered, no blur.
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute', top: 40, right: -50, width: 360, height: 26,
              borderRadius: 13, backgroundColor: accent, transform: 'rotate(-32deg)',
            },
          },
        },
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute', top: 118, right: -80, width: 300, height: 26,
              borderRadius: 13, backgroundColor: `${accent}66`, transform: 'rotate(-32deg)',
            },
          },
        },
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute', top: 196, right: -110, width: 240, height: 26,
              borderRadius: 13, backgroundColor: `${accent}2e`, transform: 'rotate(-32deg)',
            },
          },
        },
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute', top: 24, left: 24, right: 24, bottom: 24,
              border: `1px solid ${HAIRLINE}`, borderRadius: 22,
            },
          },
        },
        // Level word in the accent (the official AWS badge-color system)
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute', left: 60, bottom: 188,
              fontSize: 26, fontWeight: 700, letterSpacing: 8,
              color: accent, textTransform: 'uppercase',
            },
            children: (level ?? '').toUpperCase(),
          },
        },
        // Oversized mono cert code, the single confident element
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute', left: 56, bottom: 64,
              fontSize: 110, fontWeight: 700, letterSpacing: 2,
              color: TEXT_PRIMARY, lineHeight: 1,
            },
            children: shortName,
          },
        },
        // Accent underline beneath the code
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute', left: 60, bottom: 44,
              width: 168, height: 6, borderRadius: 3, backgroundColor: accent,
            },
          },
        },
        ...(logoDataUri
          ? [{
              type: 'img',
              props: { src: logoDataUri, width: 52, height: 52, style: { position: 'absolute', top: 48, left: 52 } },
            }]
          : []),
      ],
    },
  }
}

async function renderCardPng(spec, fonts) {
  const svg = await satori(cardTemplate(spec), { width: CARD_W, height: CARD_H, fonts })
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: CARD_W } })
  return resvg.render().asPng()
}

async function main() {
  mkdirSync(OG_DIR, { recursive: true })

  const fonts = [
    { name: 'Inter', data: readFileSync(FONT_REGULAR), weight: 400, style: 'normal' },
    { name: 'Inter', data: readFileSync(FONT_BOLD), weight: 700, style: 'normal' },
  ]

  // Bare brand mark (matches the favicon and the site header): orange cloud +
  // white check, NO tile. Built inline so the art never depends on the email
  // asset (logo-email.svg keeps its white tile for email-client rendering).
  const glyphSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" fill="${AWS_ORANGE}" stroke="${AWS_ORANGE}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M16.2 9.6 11.4 14.4 9 12" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`
  const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(glyphSvg, 'utf8').toString('base64')}`

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
      domainName: null,
      code: cert.code,
      level: cert.level,
    })
    for (const domain of cert.domains) {
      targets.push({
        file: `og-${cert.code}-${domain.slug}.png`,
        title: cert.name,
        tagline: 'Free Practice Exams',
        domainName: domain.name,
        code: cert.code,
        level: cert.level,
      })
    }
  }

  let rendered = 0
  let fellBack = 0
  const failures = []

  for (const t of targets) {
    const outPath = resolve(OG_DIR, t.file)
    try {
      const png = await renderPng({ title: t.title, tagline: t.tagline, domainName: t.domainName, code: t.code ?? null, level: t.level ?? null, logoDataUri }, fonts)
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

  // Cert tile art for the site (CertTile.astro): card-<code>.webp per cert.
  // WebP via sharp (bundled with Astro): the dark gradient art compresses
  // ~5x better than PNG, keeping the homepage light (DSv5.1 weight budget).
  let cardsRendered = 0
  const { default: sharp } = await import('sharp')
  for (const cert of certs) {
    try {
      const png = await renderCardPng({ shortName: cert.shortName, level: cert.level, logoDataUri }, fonts)
      const webp = await sharp(png).webp({ quality: 82 }).toBuffer()
      writeFileSync(resolve(OG_DIR, `card-${cert.code}.webp`), webp)
      cardsRendered++
    } catch (err) {
      failures.push(`card-${cert.code}.webp: ${err.message}`)
    }
  }

  // Assert every expected file now exists on disk (R6.14).
  const missing = targets.filter(t => !existsSync(resolve(OG_DIR, t.file)))

  console.log(`✓ OG images: ${rendered} rendered, ${fellBack} fell back, ${targets.length} expected; ${cardsRendered} cert tile art`)

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
