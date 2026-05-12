import { createContext, useContext, useEffect, useState, createElement } from 'react'
import { supabase } from '../lib/supabase'
import { logError } from '../lib/logger'
import type { User } from '@supabase/supabase-js'
import type { ReactNode } from 'react'

interface AuthContextValue {
  user: User | null
  loading: boolean
  signOut: () => Promise<{ error: Error | null }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // If Supabase is briefly unreachable on boot (DNS blip, offline, RLS error)
    // a missing .catch leaves loading=true forever and every gated route stalls
    // on LoadingSpinner. Always resolve loading, even on failure (P1-1).
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null)
        setLoading(false)
      })
      .catch((err: unknown) => {
        logError('useAuth.getSession', err)
        setLoading(false)
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signOut = () => supabase.auth.signOut()

  return createElement(AuthContext.Provider, { value: { user, loading, signOut } }, children)
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
