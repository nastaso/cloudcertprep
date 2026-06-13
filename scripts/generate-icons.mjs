// Generates the v6 brand icon set from ONE source so every surface shows the
// SAME mark: the AWS-orange Lucide cloud + ink check on the v6 "stage" ink
// tile (#0E1116). Run manually (`npm run icons`) and commit the outputs — these
// are static brand assets, NOT build-time-dynamic, so this is deliberately NOT
// wired into prebuild (it would re-rasterize every build for no reason).
//
// Outputs:
//   public/favicon.svg            vector, rounded ink tile + hairline (browsers)
//   public/apple-touch-icon.png   180x180, full-bleed opaque ink (iOS masks it)
//   public/icon-192.png           192x192, maskable (Android home screen)
//   public/icon-512.png           512x512, maskable (PWA install / splash)
//   public/icon-google-consent.png 256x256, opaque (hand to Alex for the Google
//                                   OAuth consent screen upload — owner action)
//   public/logo-email-v2.svg      vector source of the email mark (white tile)
//   public/logo-email-v2.png      92x92, white tile + ink check (email-client
//                                 mark; NEW file — the old public/logo-email.png
//                                 URL is hot-linked by sent emails and must keep
//                                 resolving, so we version instead of overwrite)
//
// Design rationale (DESIGN_SYSTEM_v6.md): "one stage" — the ink tile is the same
// #0E1116 surface every hero renders on, so the icon reads as part of the v6
// system. The mark (orange cloud + ink check, matching the header) is identical
// across favicon + apple-touch + email + OG + consent — ONE coherent brand mark.
// On the dark tile the ink check is a cut-out; on the email's white tile it is a
// solid dark check on the orange. The header keeps its own tile-less variant.
// The email mark IS regenerated here now (as logo-email-v2, ink check), because
// the canonical check flipped from white to ink (Alex, 2026-06-13).
//
// resvg (SVG -> PNG) is already a dep (the OG pipeline uses it); no new deps.

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { Resvg } from '@resvg/resvg-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC = resolve(__dirname, '../public')

// Palette — single source of truth, mirrors the site stage + brand tokens.
const INK = '#0E1116' // .stage / dark page surface (DESIGN_SYSTEM_v6 §1.2)
const ORANGE = '#FF9900' // --color-brand
const CHECK = '#0E1116' // ink check (cut-out): canonical mark per Alex
// (2026-06-13) is the HEADER treatment -- a dark check that reads as the tile
// showing through the orange cloud. On the dark stage tile it is a true cut-out
// (check color == tile color); on the white email tile it is a solid dark check
// on the orange cloud. Same visual on every surface. Trade-off accepted: the
// cut-out has less contrast at 16px than a white check would.

// Lucide glyph paths (lucide-react is React-only; inline the path data).
const CLOUD = 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z'
const CHECK_PATH = 'M20 6 9 17l-5-5'

// 92x92 design space — reuses the proven, optically-centred geometry from
// logo-email.svg (cloud translate(18,18) scale(2.333); check translate(25,25)
// scale(1.75)). The glyph sits well inside the central circle (corners ~32px
// from centre vs a 46px inradius), so it survives Google's circular crop and
// Android's maskable safe-zone without extra padding.
const SIZE = 92

function buildSvg({ rx = 0, glow = true, hairline = false, tile = INK, check = CHECK } = {}) {
  const defs = glow
    ? `<defs>
    <radialGradient id="glow" cx="50%" cy="44%" r="58%">
      <stop offset="0%" stop-color="${ORANGE}" stop-opacity="0.20"/>
      <stop offset="60%" stop-color="${ORANGE}" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="${ORANGE}" stop-opacity="0"/>
    </radialGradient>
  </defs>`
    : ''
  const glowRect = glow ? `<rect width="${SIZE}" height="${SIZE}" rx="${rx}" fill="url(#glow)"/>` : ''
  const hairlineRect = hairline
    ? `<rect x="0.9" y="0.9" width="${SIZE - 1.8}" height="${SIZE - 1.8}" rx="${Math.max(rx - 1, 0)}" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="1.4"/>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  ${defs}
  <rect width="${SIZE}" height="${SIZE}" rx="${rx}" fill="${tile}"/>
  ${glowRect}
  <g transform="translate(18,18) scale(2.333)">
    <path d="${CLOUD}" fill="${ORANGE}" stroke="${ORANGE}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <g transform="translate(25,25) scale(1.75)">
    <path d="${CHECK_PATH}" fill="none" stroke="${check}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  ${hairlineRect}
</svg>`
}

function renderPng(svg, px) {
  // fitTo width scales the 92-unit design space up to the target pixel size.
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: px } })
  return resvg.render().asPng()
}

// --- favicon.svg: rounded ink tile + hairline so the dark tile separates from
// dark browser chrome. Rounded corners are fine here (SVG favicon, shown as-is).
const faviconSvg = buildSvg({ rx: 20, glow: true, hairline: true })
writeFileSync(resolve(PUBLIC, 'favicon.svg'), faviconSvg + '\n')

// --- apple-touch + maskable + consent: FULL-BLEED ink square (rx 0) so the PNG
// is fully opaque (no transparent corners -> no iOS black-composite surprise,
// satisfies Google's opaque-background rule) and the platform applies its own
// mask (iOS superellipse, Android maskable circle/squircle).
const squareSvg = buildSvg({ rx: 0, glow: true, hairline: false })
const targets = [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-google-consent.png', 256],
]
for (const [file, px] of targets) {
  writeFileSync(resolve(PUBLIC, file), renderPng(squareSvg, px))
}

// --- email mark (logo-email-v2): WHITE rounded tile (Outlook / dark-client
// compat, deliberate) + orange cloud + ink check. Shipped as a NEW versioned
// file so the old public/logo-email.png URL (hot-linked by already-sent emails)
// keeps resolving. The email templates point at logo-email-v2.png.
const emailSvg = buildSvg({ rx: 18, glow: false, hairline: false, tile: '#FFFFFF', check: '#0E1116' })
writeFileSync(resolve(PUBLIC, 'logo-email-v2.svg'), emailSvg + '\n')
writeFileSync(resolve(PUBLIC, 'logo-email-v2.png'), renderPng(emailSvg, 92))

console.log(`✓ icons: favicon.svg + ${targets.map(t => t[0]).join(', ')} + logo-email-v2.svg/png regenerated from one source (ink check)`)
