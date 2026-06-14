// Scripted user flows. Each flow opens its own page, attaches the error
// listeners, drives the real UI, and screenshots each meaningful step through
// the injected `recorder.snap(page, sink, label)`. Every step is wrapped so a
// single broken selector records a finding instead of aborting the whole run.
//
// Guest flows (localStorage only) are safe on prod: ZERO DB writes. Logged-in
// flows WRITE to prod and must run only against the throwaway account.

import { attachListeners } from './capture.mjs'

const t = (page, ms) => page.waitForTimeout(ms)

// Answer the current practice question. Handles all four types: single grades on
// click; multi/ordering/matching enable a "Submit answer" button once complete.
async function answerPracticeQuestion(page) {
  const graded = () => page.getByText(/^(Correct!|Incorrect)$/).first().isVisible().catch(() => false)
  const submit = page.getByRole('button', { name: 'Submit answer' })
  const waitGraded = () => page.getByText(/^(Correct!|Incorrect)$/).first().waitFor({ timeout: 4000 }).catch(() => {})

  // matching: set every "Match for:" select, then submit
  const matchSel = page.locator('select[aria-label^="Match for:"]')
  if ((await matchSel.count().catch(() => 0)) > 0) {
    const c = await matchSel.count()
    for (let i = 0; i < c; i++) await matchSel.nth(i).selectOption({ index: 1 }).catch(() => {})
    await t(page, 150)
    if (await submit.isEnabled().catch(() => false)) await submit.click().catch(() => {})
    return waitGraded()
  }
  // ordering: one reorder is enough to mark it answered, then submit
  const moveDown = page.getByRole('button', { name: /^Move ".*" down$/ })
  if ((await moveDown.count().catch(() => 0)) > 0) {
    await moveDown.first().click().catch(() => {})
    await t(page, 150)
    if (await submit.isEnabled().catch(() => false)) await submit.click().catch(() => {})
    return waitGraded()
  }
  // single / multi MCQ
  const opts = page.locator('button[aria-pressed]')
  const n = await opts.count().catch(() => 0)
  for (let i = 0; i < Math.max(n, 1) + 2; i++) {
    if (await graded()) break
    if ((await submit.isVisible().catch(() => false)) && (await submit.isEnabled().catch(() => false))) {
      await submit.click().catch(() => {})
      break
    }
    const opt = opts.nth(i)
    if ((await opt.isVisible().catch(() => false)) && (await opt.isEnabled().catch(() => false))) {
      await opt.click().catch(() => {})
    }
    await t(page, 120)
  }
  return waitGraded()
}

// Answer the current exam question, handling single / multi / ordering / matching.
async function answerExamQuestion(page) {
  const matchSel = page.locator('select[aria-label^="Match for:"]')
  const mc = await matchSel.count().catch(() => 0)
  if (mc > 0) {
    for (let i = 0; i < mc; i++) await matchSel.nth(i).selectOption({ index: 1 }).catch(() => {})
    return
  }
  const moveDown = page.getByRole('button', { name: /^Move ".*" down$/ })
  if ((await moveDown.count().catch(() => 0)) > 0) {
    await moveDown.first().click().catch(() => {})
    return
  }
  const opts = page.locator('button[aria-pressed]').filter({ hasNotText: 'Flag' })
  const first = opts.first()
  if ((await first.isVisible().catch(() => false)) && (await first.isEnabled().catch(() => false))) {
    await first.click().catch(() => {})
  }
}

export async function runDomainPractice({ ctx, recorder, cert, domain, count = 5, label }) {
  const name = label || `practice:${cert}:d${domain}`
  const page = await ctx.newPage()
  const sink = attachListeners(page)
  const result = { name, ok: false, steps: [], findings: [], error: null }
  const step = async (lbl) => {
    const r = await recorder.snap(page, sink, `${name}/${lbl}`)
    result.steps.push(lbl)
    result.findings.push(...r.findings)
  }
  try {
    await page.goto(`${recorder.baseUrl}/aws/${cert}/domain-practice?domain=${domain}`, {
      waitUntil: 'domcontentloaded',
    })
    await step('config')
    // Drive the question count to its floor so the session is short and the loop
    // reliably reaches the results screen (the default is 20).
    const dec = page.getByRole('button', { name: 'Decrease question count' })
    for (let i = 0; i < 25; i++) {
      if (await dec.isEnabled().catch(() => false)) { await dec.click().catch(() => {}); await t(page, 40) } else break
    }
    const start = page.getByRole('button', { name: 'Start practice' })
    await start.waitFor({ timeout: 8000 })
    await start.click()
    await t(page, 400)
    // Answer until the results screen appears (bounded). `count` only caps the
    // number of per-question feedback screenshots we keep.
    const done = page.getByText('Practice session complete!')
    let q = 0
    for (; q < 40; q++) {
      if (await done.isVisible().catch(() => false)) break
      await answerPracticeQuestion(page)
      if (q === 0) await step('q1-feedback')
      const next = page.getByRole('button', { name: /^(Next question|Finish session)$/ })
      if (await next.isVisible().catch(() => false)) {
        await next.click().catch(() => {})
        await t(page, 200)
      } else if (!(await done.isVisible().catch(() => false))) {
        break // no advance control and not done: bail rather than spin
      }
    }
    await done.waitFor({ timeout: 8000 }).catch(() => {})
    await step('results')
    result.ok = await done.isVisible().catch(() => false)
    if (!result.ok) result.error = `did not reach results screen after ${q} questions`
  } catch (e) {
    result.error = String(e?.message || e)
    await recorder.snap(page, sink, `${name}/ERROR`).catch(() => {})
  } finally {
    await page.close().catch(() => {})
  }
  return result
}

export async function runMockExam({ ctx, recorder, cert, label, minDurationMs = 0 }) {
  const name = label || `exam:${cert}`
  const page = await ctx.newPage()
  const sink = attachListeners(page)
  const result = { name, ok: false, steps: [], findings: [], error: null, total: null, persisted: null }
  const step = async (lbl) => {
    const r = await recorder.snap(page, sink, `${name}/${lbl}`)
    result.steps.push(lbl)
    result.findings.push(...r.findings)
  }
  const startedAt = Date.now()
  try {
    await page.goto(`${recorder.baseUrl}/aws/${cert}/practice-exam`, { waitUntil: 'domcontentloaded' })
    await step('start-screen')
    const startBtn = page.getByRole('button', { name: 'Start exam' })
    await startBtn.waitFor({ timeout: 8000 })
    await startBtn.click()
    const counter = page.getByText(/Question \d+ of \d+/).first()
    await counter.waitFor({ timeout: 8000 })
    const total = parseInt((await counter.innerText()).match(/of (\d+)/)[1], 10)
    result.total = total
    await step('in-exam-q1')
    for (let i = 0; i < total; i++) {
      await answerExamQuestion(page)
      if (i === Math.floor(total / 2)) await step('in-exam-mid')
      const next = page.getByRole('button', { name: 'Next' })
      if (i < total - 1 && (await next.isVisible().catch(() => false)) && (await next.isEnabled().catch(() => false))) {
        await next.click().catch(() => {})
        await t(page, 50)
      }
    }
    // Pace logged-in runs past the 60s persistence floor.
    const remain = minDurationMs - (Date.now() - startedAt)
    if (remain > 0) await t(page, Math.min(remain, 75000))
    await page.getByRole('button', { name: 'End exam' }).first().click()
    await step('end-modal')
    await page.getByRole('button', { name: 'Submit exam' }).click()
    const review = page.getByRole('button', { name: 'Review questions' })
    await review.waitFor({ timeout: 12000 }).catch(() => {})
    await step('results')
    const reachedResults = await review.isVisible().catch(() => false)
    if (reachedResults) {
      await review.click().catch(() => {})
      await t(page, 500)
      await step('review')
    }
    result.ok = reachedResults
    if (!reachedResults) result.error = 'did not reach exam results screen'
  } catch (e) {
    result.error = String(e?.message || e)
    await recorder.snap(page, sink, `${name}/ERROR`).catch(() => {})
  } finally {
    await page.close().catch(() => {})
  }
  return result
}

// Exercise the interactive ordering + matching SAMPLE cards on the two AIF
// domain landings (deterministic, documented selectors).
export async function runInteractiveSamples({ ctx, recorder }) {
  const out = []
  const samples = [
    {
      name: 'sample:ordering',
      path: '/aws/aif-c01/fundamentals-of-ai-and-ml',
      card: '.sample-ordering',
      async act(page, card) {
        await card.locator('.sample-ord-down').first().click().catch(() => {})
        await t(page, 150)
        await card.locator('.sample-ord-check').click()
      },
    },
    {
      name: 'sample:matching',
      path: '/aws/aif-c01/fundamentals-of-generative-ai',
      card: '.sample-matching',
      async act(page, card) {
        const sels = card.locator('.sample-mat-select')
        const c = await sels.count()
        for (let i = 0; i < c; i++) await sels.nth(i).selectOption({ index: 1 }).catch(() => {})
        await card.locator('.sample-mat-check').click()
      },
    },
  ]
  for (const s of samples) {
    const page = await ctx.newPage()
    const sink = attachListeners(page)
    const result = { name: s.name, ok: false, steps: [], findings: [], error: null }
    const step = async (lbl) => {
      const r = await recorder.snap(page, sink, `${s.name}/${lbl}`)
      result.steps.push(lbl)
      result.findings.push(...r.findings)
    }
    try {
      await page.goto(`${recorder.baseUrl}${s.path}`, { waitUntil: 'domcontentloaded' })
      const card = page.locator(s.card).first()
      await card.scrollIntoViewIfNeeded()
      await card.waitFor({ timeout: 8000 })
      await s.act(page, card)
      // The graded answer reveals .sample-answer (loses its `hidden` class).
      await card.locator('.sample-answer').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
      await step('checked')
      const revealed = await card.locator('.sample-answer').first().isVisible().catch(() => false)
      if (!revealed) {
        result.findings.push({
          ...recorder.meta, step: `${s.name}/checked`, type: 'flow_assert', severity: 'high',
          detail: { message: 'sample answer did not reveal after Check answer' },
        })
      }
      result.ok = revealed
    } catch (e) {
      result.error = String(e?.message || e)
      await recorder.snap(page, sink, `${s.name}/ERROR`).catch(() => {})
    } finally {
      await page.close().catch(() => {})
    }
    out.push(result)
  }
  return out
}
