/**
 * Theme as a module-level singleton.
 *
 * The pre-paint inline script in BaseLayout.astro decides the initial theme
 * before any island hydrates. This hook lets components react to subsequent
 * toggles. No Context, no Provider — useTheme() composes safely across any
 * number of islands on the same page.
 */

import { useCallback, useSyncExternalStore } from 'react'

type Theme = 'light' | 'dark'

const THEME_KEY = 'cloudcertprep_theme'

function read(): Theme {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

let theme: Theme = read()
const listeners = new Set<() => void>()
let initialised = false

function notify() { listeners.forEach(cb => cb()) }

function init() {
  if (initialised || typeof window === 'undefined') return
  initialised = true
  // DSv5.1: the brand is dark-first (pre-paint script defaults to dark; light
  // only on explicit stored choice). OS-theme mirroring is intentionally
  // retired with the dark-first default: the OS signal no longer decides.
}

function subscribe(cb: () => void) {
  init()
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function getSnapshot(): Theme { return theme }
function getServerSnapshot(): Theme { return 'dark' }

export function useTheme() {
  const t = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const toggleTheme = useCallback(() => {
    const root = document.documentElement
    root.classList.add('no-transition')
    const next: Theme = t === 'dark' ? 'light' : 'dark'
    root.classList.toggle('dark', next === 'dark')
    localStorage.setItem(THEME_KEY, next)
    theme = next
    notify()
    requestAnimationFrame(() => {
      requestAnimationFrame(() => root.classList.remove('no-transition'))
    })
  }, [t])

  return { theme: t, toggleTheme }
}

