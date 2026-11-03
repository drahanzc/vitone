import { Link, NavLink } from 'react-router'
import { BrandMark, Icon } from './AdminPrimitives'

export function AdminSidebar({
  collapsed,
  onToggle,
  displayName,
  email,
  initials,
  onSignOut,
}: {
  collapsed: boolean
  onToggle: () => void
  displayName: string
  email?: string
  initials: string
  onSignOut: () => void
}) {
  const toggleLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar'

  return (
    <aside className={`admin-sidebar ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="admin-sidebar-header">
        <Link className="admin-brand" to="/admin"><BrandMark /><span>Vitone</span></Link>
        <button className="admin-sidebar-toggle" type="button" onClick={onToggle} aria-label={toggleLabel} aria-expanded={!collapsed} title={toggleLabel}>
          <Icon name="sidebar" />
        </button>
      </div>
      <section className="admin-sidebar-workspace" aria-label="Workspace">
        <div className="admin-side-section-label">Workspace</div>
        <nav className="admin-nav" aria-label="Center workspace">
          <NavLink to="/admin" end className={({ isActive }) => `admin-nav-link ${isActive ? 'is-active' : ''}`}>
            <Icon name="dashboard" /><span>Dashboard</span>
          </NavLink>
          <NavLink to="/admin/assessments" className={({ isActive }) => `admin-nav-link ${isActive ? 'is-active' : ''}`}>
            <Icon name="assessment" /><span>Assessments</span>
          </NavLink>
        </nav>
      </section>
      {/* <div className="admin-side-divider" /> */}
      {/* <section className="admin-sidebar-starred" aria-label="Starred">
        <div className="admin-sidebar-group-heading"><span>Starred</span><span className="admin-sidebar-add-icon" aria-hidden="true"><Icon name="plus" /></span></div>
        <p className="admin-sidebar-empty">No starred classes yet</p>
      </section>
      <div className="admin-side-divider" />
      <div className="admin-sidebar-settings" aria-label="Settings">
        <div className="admin-sidebar-static-link"><Icon name="settings" /><span>Setting</span></div>
      </div> */}
      <div className="admin-sidebar-footer-divider" />
      <div className="admin-sidebar-bottom">
        <div className="admin-profile-avatar">{initials}</div>
        <div className="admin-profile-copy"><strong title={displayName}>{displayName}</strong><span>{email || 'Center workspace'}</span></div>
        <button className="admin-signout-button" type="button" onClick={onSignOut} aria-label="Sign out" title="Sign out"><Icon name="chevron" /></button>
      </div>
    </aside>
  )
}

export function AdminTopbar({ activePage }: { activePage: string }) {
  return (
    <header className="admin-topbar">
      <div className="admin-breadcrumb">
        <Icon name="star" />
        <div className="admin-breadcrumb-trail"><Link to="/admin">Dashboards</Link><span className={activePage === 'Dashboard' ? 'hidden' : ''}>/</span><strong>{activePage === 'Dashboard' ? '' : activePage}</strong></div>
      </div>
      {/* <div className="admin-topbar-actions" aria-hidden="true"><span><Icon name="bell" /></span><span><Icon name="info" /></span></div> */}
    </header>
  )
}

