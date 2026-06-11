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
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

let theme: Theme = read()
const listeners = new Set<() => void>()
let initialised = false

function notify() { listeners.forEach(cb => cb()) }

function init() {
  if (initialised || typeof window === 'undefined' || !window.matchMedia) return
  initialised = true

  // Follow OS theme changes mid-session, but only when the user has not made
  // an explicit choice (i.e. localStorage is empty). The pre-paint script in
  // BaseLayout handles the first paint; this listener handles subsequent OS
  // toggles for users whose explicit preference is to mirror the OS.
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', e => {
    if (localStorage.getItem(THEME_KEY)) return
    const next: Theme = e.matches ? 'dark' : 'light'
    document.documentElement.classList.toggle('dark', next === 'dark')
    theme = next
    notify()
  })
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
    localStorage.setItem(THEME_KEY, next)
    theme = next
    notify()
    requestAnimationFrame(() => {
      requestAnimationFrame(() => root.classList.remove('no-transition'))
    })
  }, [t])

  return { theme: t, toggleTheme }
}

