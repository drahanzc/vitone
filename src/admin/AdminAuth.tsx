import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { getFreshCenterSession, loginCenter, readCenterSession, revokeCenterSession, writeCenterSession, type CenterSession } from './admin-api'

import { CenterAuthContext } from './center-auth-context'

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CenterSession | null>(() => readCenterSession())

  const updateSession = useCallback((next: CenterSession | null) => {
    writeCenterSession(next)
    setSession(next)
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const next = await loginCenter(email, password)
    setSession(next)
  }, [])

  const signOut = useCallback(async () => {
    if (!session) return
    try {
      const freshSession = await getFreshCenterSession(session, updateSession)
      await revokeCenterSession(freshSession, updateSession)
    } catch {
      // Local credentials must still be cleared if revocation is unavailable.
    } finally {
      updateSession(null)
    }
  }, [session, updateSession])

  const value = useMemo(
    () => ({ session, updateSession, signIn, signOut }),
    [session, updateSession, signIn, signOut],
  )

  return <CenterAuthContext.Provider value={value}>{children}</CenterAuthContext.Provider>
}
