import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadExamGuard() {
  vi.resetModules()
  return import('./examGuard')
}

function stubExamDocument(examActive?: 'true') {
  vi.stubGlobal('document', {
    body: {
      dataset: examActive ? { examActive } : {},
    },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('examGuard', () => {
  it('reports whether an exam is active from the body dataset', async () => {
    stubExamDocument()
    const guard = await loadExamGuard()

    expect(guard.isExamActive()).toBe(false)

    document.body.dataset.examActive = 'true'
    expect(guard.isExamActive()).toBe(true)

    delete document.body.dataset.examActive
    expect(guard.isExamActive()).toBe(false)
  })

  it('treats missing document globals as inactive', async () => {
    const guard = await loadExamGuard()

    expect(guard.isExamActive()).toBe(false)
  })

  it('guards active exams by calling the registered leave handler', async () => {
    stubExamDocument('true')
    const guard = await loadExamGuard()
    const handler = vi.fn()

    guard.registerExamLeaveHandler(handler)

    expect(guard.guardExamLeave('/history')).toBe(true)
    expect(handler).toHaveBeenCalledWith('/history')
  })

  it('allows navigation when no exam is active', async () => {
    stubExamDocument()
    const guard = await loadExamGuard()
    const handler = vi.fn()

    guard.registerExamLeaveHandler(handler)

    expect(guard.guardExamLeave('/login')).toBe(false)
    expect(handler).not.toHaveBeenCalled()
  })

  it('allows navigation when no leave handler is registered', async () => {
    stubExamDocument('true')
    const guard = await loadExamGuard()

    expect(guard.guardExamLeave('/login')).toBe(false)
  })

  it('cleans up only the handler registered by that cleanup function', async () => {
    stubExamDocument('true')
    const guard = await loadExamGuard()
    const firstHandler = vi.fn()
    const secondHandler = vi.fn()

    const cleanupFirst = guard.registerExamLeaveHandler(firstHandler)
    const cleanupSecond = guard.registerExamLeaveHandler(secondHandler)

    cleanupFirst()

    expect(guard.guardExamLeave('/stats')).toBe(true)
    expect(firstHandler).not.toHaveBeenCalled()
    expect(secondHandler).toHaveBeenCalledWith('/stats')

    cleanupSecond()

    expect(guard.guardExamLeave('/stats')).toBe(false)
  })

  it('marks confirmed leaves as intentional and navigates', async () => {
    const assign = vi.fn()
    vi.stubGlobal('window', {
      location: { assign },
    })
    const guard = await loadExamGuard()

    expect(guard.isIntentionalLeave()).toBe(false)

    guard.confirmExamLeave('/results')

    expect(guard.isIntentionalLeave()).toBe(true)
    expect(assign).toHaveBeenCalledWith('/results')
  })
})
