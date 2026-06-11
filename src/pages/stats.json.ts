/**
 * /stats.json — machine-readable community stats endpoint.
 *
 * Serves the same build-time snapshot that /stats prerenders and that the
 * Dataset JSON-LD on /stats describes. Exists so the Dataset
 * `distribution.contentUrl` points at a genuine application/json resource
 * rather than the HTML page (audit W8), giving LLMs and data consumers a
 * real downloadable dataset. Static (prerendered) output; no request-time
 * logic. Contains zero PII — aggregated figures only.
 */
import type { APIRoute } from 'astro'
import snapshot from '../lib/generated/stats-snapshot.json'

export const GET: APIRoute = () =>
  new Response(JSON.stringify(snapshot, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
