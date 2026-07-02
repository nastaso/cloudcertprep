/**
 * Theme as a module-level singleton.
 *
 * The pre-paint inline script in BaseLayout.astro decides the initial theme
 * before any island hydrates. This hook lets components react to subsequent
 * toggles. No Context, no Provider — useTheme() composes safely across any
 * number of islands on the same page.
 */

import { useCallback, useSyncExternalStore } from 'react'
import { storageSet } from '../lib/storage'

type Theme = 'light' | 'dark'

const THEME_KEY = 'cloudcertprep_theme'

function read(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

let theme: Theme = read()
const listeners = new Set<() => void>()
let initialised = false

function notify() { listeners.forEach(cb => cb()) }

function init() {
  if (initialised || typeof window === 'undefined') return
  initialised = true
  // Light default (pre-paint script applies dark only on explicit stored
  // choice). OS-theme mirroring is intentionally retired: the OS signal
  // never decides; only the user's explicit toggle does.
}

function subscribe(cb: () => void) {
  init()
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function getSnapshot(): Theme { return theme }
function getServerSnapshot(): Theme { return 'light' }

export function useTheme() {
  const t = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const toggleTheme = useCallback(() => {
    const root = document.documentElement
    root.classList.add('no-transition')
    const next: Theme = t === 'dark' ? 'light' : 'dark'
    root.classList.toggle('dark', next === 'dark')
    // storageSet catches SecurityError in private/cookies-disabled browsers;
    // execution continues so theme and no-transition are always resolved.
    storageSet(THEME_KEY, next)
    theme = next
    notify()
    requestAnimationFrame(() => {
      requestAnimationFrame(() => root.classList.remove('no-transition'))
    })
  }, [t])

  return { theme: t, toggleTheme }
}

