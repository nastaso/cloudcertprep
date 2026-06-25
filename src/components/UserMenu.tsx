import { useEffect, useId, useRef, useState } from 'react'
import { UserCircle, History, Settings, Sun, Moon, LogOut, ChevronDown } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useSignOut } from '../hooks/useSignOut'
import { useTheme } from '../hooks/useTheme'
import { guardExamLeave, SIGN_OUT_SENTINEL } from '../lib/examGuard'

/**
 * Desktop account/user menu - the right-edge avatar disclosure that holds the
 * signed-in user's identity + account actions (History, Account, theme, Sign
 * out). Replaces the flat History/Account links + the naked Sign out button,
 * which mixed marketing nav with account actions and gave no "this is me /
 * sign out" affordance (standard SaaS pattern: Linear/Vercel/GitHub/Stripe).
 *
 * Link+disclosure (NOT an ARIA menu role): outside-click + Escape close,
 * Escape returns focus to the trigger - mirrors PracticeMenu. CSS-gated via
 * `cc-auth-in` so it shows only when authenticated (pre-paint, no flash); the
 * mobile drawer keeps its own flat History/Account/Sign out rows.
 */
export function UserMenu() {
  const { user } = useAuth()
  const signOut = useSignOut()
  const { theme, toggleTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus() }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const itemClass =
    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-text-primary hover:bg-bg-card-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand'

  return (
    <div
      ref={wrapRef}
      className="relative cc-auth-in"
      onBlur={(e) => { if (!wrapRef.current?.contains(e.relatedTarget as Node)) setOpen(false) }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Account menu"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 rounded-full text-on-header transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-on-header focus-visible:ring-offset-2 focus-visible:ring-offset-header-bg"
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-on-header/30 bg-on-header/10">
          <UserCircle className="h-5 w-5" aria-hidden="true" />
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-border-hairline bg-bg-card p-2 shadow-card-hover"
        >
          {user?.email && (
            <p className="truncate px-2.5 pb-2 pt-1 text-xs text-text-muted" title={user.email}>
              {user.email}
            </p>
          )}
          <a href="/history" className={itemClass}>
            <History className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
            Exam history
          </a>
          <a href="/account" className={itemClass}>
            <Settings className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
            Account
          </a>
          <button type="button" onClick={toggleTheme} className={itemClass}>
            {theme === 'dark'
              ? <Sun className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              : <Moon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <div className="my-1.5 border-t border-border-hairline/70" />
          <button
            type="button"
            onClick={() => { setOpen(false); if (!guardExamLeave(SIGN_OUT_SENTINEL)) void signOut() }}
            className={`${itemClass} text-danger`}
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
