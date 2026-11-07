import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { getCenterProfile, type CenterProfile } from './admin-api'
import { useCenterAuth } from './center-auth-context'
import { AdminSidebar, AdminTopbar } from './AdminLayout'

export function AdminProtectedLayout() {
  const { session } = useCenterAuth()
  const location = useLocation()
  if (!session) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />
  return <AdminShell />
}

function AdminShell() {
  const { session, updateSession, signOut } = useCenterAuth()
  const location = useLocation()
  const [profile, setProfile] = useState<CenterProfile | null>(null)
  const [profileError, setProfileError] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    if (!session) return
    let active = true
    setProfileError('')
    getCenterProfile(session, updateSession)
      .then(value => { if (active) setProfile(value) })
      .catch(cause => {
        if (active) setProfileError(cause instanceof Error ? cause.message : 'Profile could not be loaded.')
      })
    return () => { active = false }
  }, [session, updateSession])

  const displayName = profile?.center.name || profile?.user.email || 'Center account'
  const initials = displayName.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'V'
  const activePage = location.pathname.endsWith('/assessments') ? 'Assessments' : 'Dashboard'

  return (
    <div className="admin-app">
      <AdminSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(value => !value)}
        displayName={displayName}
        email={profile?.user.email}
        initials={initials}
        onSignOut={() => void signOut()}
      />
      <div className="admin-main-area">
        <AdminTopbar activePage={activePage} />
        {profileError ? <div className="admin-profile-warning" role="status">{profileError}</div> : null}
        <Outlet />
      </div>
    </div>
  )
}
