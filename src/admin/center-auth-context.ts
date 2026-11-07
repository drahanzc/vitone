import { createContext, useContext } from 'react'
import type { CenterSession } from './admin-api'

type CenterAuthValue = {
  session: CenterSession | null
  updateSession: (session: CenterSession | null) => void
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export const CenterAuthContext = createContext<CenterAuthValue | null>(null)

export function useCenterAuth(): CenterAuthValue {
  const context = useContext(CenterAuthContext)
  if (!context) throw new Error('CenterAuthContext is required')
  return context
}
