import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { ErrorBoundary } from './ErrorBoundary'
import * as logger from '../lib/logger'

// This repo's vitest environment is 'node' (no DOM) and has no
// react-test-renderer / @testing-library/react (AGENTS.md: no new
// dependencies), so an island throwing can't be exercised end-to-end through
// a real client render here. React's SSR renderers don't help either -
// renderToStaticMarkup/renderToPipeableStream do not recover inline from a
// synchronous root-level throw the way the client reconciler does (verified
// by hand before writing this file, not assumed). Instead this drives
// ErrorBoundary's own lifecycle methods directly - the exact same methods
// React itself calls - and inspects the returned element tree structurally.
function containsText(node: ReactNode, text: string): boolean {
  if (typeof node === 'string') return node.includes(text)
  if (Array.isArray(node)) return node.some(n => containsText(n, text))
  if (node && typeof node === 'object' && 'props' in node) {
    return containsText((node as { props?: { children?: ReactNode } }).props?.children, text)
  }
  return false
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('getDerivedStateFromError flags the caught error', () => {
    const error = new Error('boom')
    expect(ErrorBoundary.getDerivedStateFromError(error)).toEqual({ hasError: true, error })
  })

  it('renders children unchanged before anything has errored', () => {
    const instance = new ErrorBoundary({ children: <div>hello from a healthy island</div> })
    expect(containsText(instance.render(), 'hello from a healthy island')).toBe(true)
  })

  it('renders the recovery card instead of blanking once an error is caught', () => {
    const instance = new ErrorBoundary({ children: <div>hello</div> })
    instance.state = ErrorBoundary.getDerivedStateFromError(new Error('boom'))

    const rendered = instance.render()

    expect(containsText(rendered, 'Something went wrong')).toBe(true)
    expect(containsText(rendered, 'Reload page')).toBe(true)
    // The broken child is replaced, not overlaid - this is what stops a
    // throwing island from leaving stale/partial content on screen.
    expect(containsText(rendered, 'hello')).toBe(false)
  })

  it('calls logError with the caught error when componentDidCatch runs', () => {
    const logErrorSpy = vi.spyOn(logger, 'logError').mockImplementation(() => {})
    const instance = new ErrorBoundary({ children: null })
    const error = new Error('boom')

    instance.componentDidCatch(error, {})

    expect(logErrorSpy).toHaveBeenCalledWith('ErrorBoundary', error)
  })
})
