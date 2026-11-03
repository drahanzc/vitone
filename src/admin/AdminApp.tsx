import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type SubmitEvent,
} from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import {
  createAssessmentLink,
  getAssessmentLinks,
  getCenterProfile,
  getFreshCenterSession,
  getLinkAssessments,
  getPassages,
  loginCenter,
  readCenterSession,
  revokeCenterSession,
  writeCenterSession,
  type AssessmentLink,
  type AssessmentListItem,
  type CenterProfile,
  type CenterSession,
  type CreateLinkRequest,
  type PassageChoice,
} from './admin-api'
import './admin.css'

// Authentication is shared by the login page and every protected admin route.
type CenterAuthValue = {
  session: CenterSession | null
  updateSession: (session: CenterSession | null) => void
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const CenterAuthContext = createContext<CenterAuthValue | null>(null)

function useCenterAuth(): CenterAuthValue {
  const context = useContext(CenterAuthContext)
  if (!context) throw new Error('CenterAuthContext is required')
  return context
}

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

type IconName =
  | 'dashboard'
  | 'assessment'
  | 'search'
  | 'folder'
  | 'clock'
  | 'check'
  | 'arrow'
  | 'link'
  | 'close'
  | 'eye'
  | 'star'
  | 'bell'
  | 'info'
  | 'sidebar'
  | 'plus'
  | 'settings'
  | 'chevron'
  | 'users'

function Icon({ name }: { name: IconName }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: name === 'link' ? 1.5 : 1.7,
  }

  const paths: Record<IconName, ReactNode> = {
    dashboard: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.4" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.4" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.4" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.4" /></>,
    assessment: <><path d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 19V7A1.5 1.5 0 0 1 4 5.5Z" /><path d="M7 3.5h10M7 10h10M7 14h6" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.4" /><path d="m15.5 15.5 5 5" /></>,
    folder: <><path d="M3 7.5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 10h18" /></>,
    clock: <><circle cx="12" cy="12" r="8.8" /><path d="M12 7v5l3.3 2" /></>,
    check: <path d="m5 12.5 4.3 4.3L19.5 6.8" />,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    link: <path transform="translate(1.333 4)" d="M4.6667 4 8.6667 4M8.6667 0 9.3333 0C10.3942 0 11.4116 0.4214 12.1618 1.1716 12.9119 1.9217 13.3333 2.9391 13.3333 4s-.4214 2.0783-1.1715 2.8284C11.4116 7.5786 10.3942 8 9.3333 8h-.6666M4.6667 8H4C2.9391 8 1.9217 7.5786 1.1716 6.8284.4214 6.0783 0 5.0609 0 4s.4214-2.0783 1.1716-2.8284C1.9217.4214 2.9391 0 4 0h.6667" />,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    eye: <><path d="M2.5 12s3.4-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.4 5.5-9.5 5.5S2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
    star: <path d="m12 3 2.7 5.7 6.3.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.3-.9L12 3Z" />,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
    sidebar: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    settings: <><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" /><path d="m19.4 15 .1.1 1.1.9-1.2 2-1.3-.5a7.8 7.8 0 0 1-1.5.9l-.2 1.4h-2.4l-.3-1.4a7.8 7.8 0 0 1-1.5-.9l-1.3.5-1.2-2 1.1-.9a7.7 7.7 0 0 1 0-1.8l-1.1-.9 1.2-2 1.3.5a7.8 7.8 0 0 1 1.5-.9l.3-1.4h2.4l.2 1.4a7.8 7.8 0 0 1 1.5.9l1.3-.5 1.2 2-1.1.9a7.7 7.7 0 0 1 0 1.8Z" transform="translate(-1 -1)" /></>,
    chevron: <path d="m6 9 6 6 6-6" />,
    users: <><path d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-4A4.5 4.5 0 0 0 3 18.5V20" /><circle cx="9.5" cy="7.5" r="3.5" /><path d="M17 11a3.5 3.5 0 1 0-1.2-6.8M21 20v-1.5a4.5 4.5 0 0 0-3.2-4.3" /></>,
  }

  return <svg aria-hidden="true" viewBox={name === 'link' ? '0 0 16 16' : '0 0 24 24'} {...common}>{paths[name]}</svg>
}

function BrandMark() {
  return <span className="admin-brand-mark" aria-hidden="true"><img src="/assets/vitone-mark.png" alt="" /></span>
}

// Login and route protection retain the original deep-link return behavior.
export function AdminLoginPage() {
  const { session, signIn } = useCenterAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (session) navigate('/admin', { replace: true })
  }, [session, navigate])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await signIn(email.trim(), password)
      const returnTo = (location.state as { from?: string } | null)?.from
      navigate(returnTo?.startsWith('/admin') ? returnTo : '/admin', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="admin-login-page">
      <section className="admin-login-art">
        <div className="admin-login-brand"><BrandMark /><span>Vitone</span></div>
        <div className="admin-login-art-copy">
          <span className="admin-eyebrow">CENTER WORKSPACE</span>
          <h1>Every reading is a step forward.</h1>
          <p>Create assessments, share them with learners, and follow their progress.</p>
        </div>
        <img className="admin-login-illustration" src="/assets/new-apartment.png" alt="" />
      </section>
      <section className="admin-login-panel">
        <Link className="admin-student-link" to="/">Student page <Icon name="arrow" /></Link>
        <form className="admin-login-card" onSubmit={submit}>
          <span className="admin-eyebrow">WELCOME BACK</span>
          <h2>Sign in to your center</h2>
          <p>Use the email and password provided for your center account.</p>
          <label htmlFor="center-email">Email address</label>
          <input id="center-email" type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} />
          <label htmlFor="center-password">Password</label>
          <input id="center-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required />
          {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
          <button className="admin-primary-button admin-login-submit" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'} <Icon name="arrow" />
          </button>
        </form>
        <p className="admin-login-footnote">Access is provided by your Vitone administrator.</p>
      </section>
    </main>
  )
}

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

function AdminSidebar({
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

function AdminTopbar({ activePage }: { activePage: string }) {
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

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function statusName(status: string): string {
  const knownLabels: Record<string, string> = {
    ACTIVE: 'Active',
    DISABLED: 'Disabled',
    CREATED: 'Created',
    UPLOADING: 'Uploading',
    UPLOADED: 'Submitted',
    PROCESSING: 'Processing',
    COMPLETED: 'Completed',
    FAILED: 'Failed',
  }
  return knownLabels[status] || status.replaceAll('_', ' ').toLowerCase().replace(/^./, char => char.toUpperCase())
}

function statusStyle(status: string): string {
  if (status === 'COMPLETED' || status === 'ACTIVE') return 'is-good'
  if (status === 'FAILED' || status === 'DISABLED') return 'is-bad'
  return 'is-pending'
}

function isShareableLink(link: AssessmentLink, now: number): boolean {
  return link.status === 'ACTIVE'
    && (!link.expires_at || Date.parse(link.expires_at) > now)
    && (link.max_submissions == null || link.submission_count < link.max_submissions)
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const input = document.createElement('textarea')
  input.value = value
  input.setAttribute('readonly', '')
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.appendChild(input)
  input.select()
  const copied = document.execCommand('copy')
  input.remove()
  if (!copied) throw new Error('Copy is unavailable in this browser. Select and copy the link manually.')
}

function passageDescription(context: string | null | undefined, referenceText: string): string {
  const firstParagraph = (context?.trim() || referenceText.trim()).split(/\n\s*\n/, 1)[0]
  if (!firstParagraph) return 'Students will read this passage aloud for assessment.'
  const sentences = firstParagraph.match(/[^.!?]+[.!?]+/g)
  const excerpt = sentences?.slice(0, 2).join(' ').trim() || firstParagraph
  return excerpt.length > 240 ? `${excerpt.slice(0, 237).trimEnd()}…` : excerpt
}

type RecentAssessment = AssessmentListItem & { linkTitle: string }

type DashboardData = {
  passages: PassageChoice[]
  links: AssessmentLink[]
  recent: RecentAssessment[]
}

function useDashboardData(
  session: CenterSession | null,
  updateSession: (session: CenterSession | null) => void,
  refreshIndex: number,
) {
  const [data, setData] = useState<DashboardData>({ passages: [], links: [], recent: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const addLink = useCallback((link: AssessmentLink) => {
    setData(current => ({
      ...current,
      links: [link, ...current.links.filter(item => item.id !== link.id)]
        .sort((left, right) => right.created_at.localeCompare(left.created_at)),
    }))
  }, [])

  useEffect(() => {
    if (!session) return
    let active = true

    async function load() {
      setLoading(true)
      try {
        if (!session) return
        const [passages, fetchedLinks] = await Promise.all([
          getPassages(session, updateSession),
          getAssessmentLinks(session, updateSession),
        ])
        const links = [...fetchedLinks].sort((left, right) => right.created_at.localeCompare(left.created_at))
        if (!active) return
        setData(current => ({ ...current, passages, links }))

        const assessmentPages = await Promise.all(links.slice(0, 8).map(async link => {
          try {
            if (!session) return []
            const page = await getLinkAssessments(link.id, session, updateSession)
            return page.items.map(item => ({ ...item, linkTitle: link.title }))
          } catch {
            return []
          }
        }))
        const recent = assessmentPages.flat()
          .sort((left, right) => right.created_at.localeCompare(left.created_at))
          .slice(0, 7)

        if (!active) return
        setData({ passages, links, recent })
        setError('')
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Dashboard data could not be loaded.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => { active = false }
  }, [session, updateSession, refreshIndex])

  return { ...data, loading, error, setError, addLink }
}

function useCopyAssessmentLink(setError: (message: string) => void) {
  const [copiedLinkId, setCopiedLinkId] = useState('')

  const copyLink = useCallback(async (link: AssessmentLink) => {
    try {
      await copyText(link.share_url)
      setCopiedLinkId(link.id)
      window.setTimeout(() => {
        setCopiedLinkId(current => current === link.id ? '' : current)
      }, 1800)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The link could not be copied.')
    }
  }, [setError])

  return { copiedLinkId, copyLink }
}

export function AdminDashboardPage() {
  const { session, updateSession } = useCenterAuth()
  const [refreshIndex, setRefreshIndex] = useState(0)
  const [selectedPassage, setSelectedPassage] = useState<PassageChoice | null>(null)
  const [previewPassage, setPreviewPassage] = useState<PassageChoice | null>(null)
  const data = useDashboardData(session, updateSession, refreshIndex)
  const { copiedLinkId, copyLink } = useCopyAssessmentLink(data.setError)
  const [now] = useState(Date.now)

  const totalSubmissions = data.links.reduce((sum, link) => sum + link.submission_count, 0)
  const processingCount = data.links.reduce((sum, link) => sum + link.in_progress_count, 0)
  const completedCount = data.links.reduce((sum, link) => sum + link.completed_count, 0)
  const previewLink = previewPassage
    ? data.links.find(link =>
        link.passage_id === previewPassage.passage_id
        && link.passage_version === previewPassage.version
        && isShareableLink(link, now),
      ) ?? null
    : null

  function handleCreated(link: AssessmentLink) {
    // Update the visible row immediately; the refresh also brings in fresh counts.
    data.addLink(link)
    setRefreshIndex(index => index + 1)
  }

  return (
    <main className="admin-page admin-dashboard-page">
      <section className="admin-page-heading">
        <div><h1>Dashboard</h1><p>Create and share reading assessments, and follow up on student results.</p></div>
      </section>
      {data.error ? <div className="admin-error-banner" role="alert">{data.error}</div> : null}

      <section className="admin-overview-cards" aria-label="Submission overview">
        <MetricCard label="Total submissions" value={data.loading ? '—' : String(totalSubmissions)} icon="submissions" />
        <MetricCard label="Processing" value={data.loading ? '—' : String(processingCount)} icon="processing" />
        <MetricCard label="Completed" value={data.loading ? '—' : String(completedCount)} icon="completed" />
      </section>

      <section className="admin-dashboard-columns">
        <div className="admin-library-panel admin-panel">
          <div className="admin-panel-heading">
            <div><h2>Assessment Library</h2></div>
            <Link to="/admin/assessments" className="admin-text-link">View all <Icon name="arrow" /></Link>
          </div>
          {data.loading ? <div className="admin-skeleton-card" aria-label="Loading passages" /> : data.passages.length ? (
            <div className="admin-passage-list">
              {data.passages.map(passage => {
                const existingLink = data.links.find(link =>
                  link.passage_id === passage.passage_id
                  && link.passage_version === passage.version
                  && isShareableLink(link, now),
                )
                return (
                  <article className="admin-passage-card" key={`${passage.passage_id}-${passage.version}`}>
                    <div className="admin-passage-media">
                      <img className="admin-passage-art" src="/assets/new-apartment.png" alt="" />
                      <button className="admin-outline-button admin-passage-secondary" type="button" onClick={() => setPreviewPassage(passage)}>
                        Preview assessment <Icon name="eye" />
                      </button>
                    </div>
                    <div className="admin-passage-content">
                      <div className="admin-passage-copy">
                        <h3>{passage.title}</h3>
                        <p>{passageDescription(passage.context, passage.reference_text)}</p>
                        <div className="admin-passage-stats" aria-label="Assessment details">
                          <span className="admin-passage-stat"><Icon name="users" /><span>{passage.required_readings ?? 2} reading {passage.required_readings === 1 ? 'attempt' : 'attempts'}</span></span>
                          <span className="admin-passage-stat-divider" aria-hidden="true" />
                          <span className="admin-passage-stat"><Icon name="clock" /><span>{estimatedReadingTime(passage.word_count)}</span></span>
                        </div>
                      </div>
                      {existingLink ? (
                        <button className="admin-primary-button admin-passage-create" type="button" onClick={() => void copyLink(existingLink)}>
                          <span>{copiedLinkId === existingLink.id ? 'Copied' : 'Copy Link'}</span><Icon name="link" />
                        </button>
                      ) : (
                        <button className="admin-primary-button admin-passage-create" type="button" onClick={() => setSelectedPassage(passage)}>
                          <span>Create Link</span><Icon name="link" />
                        </button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="admin-empty-state"><Icon name="folder" /><h3>No passages available</h3><p>Passage packages need to be seeded before your center can create links.</p></div>
          )}
        </div>

        <aside className="admin-share-panel">
          <div className="admin-share-content">
            <div className="admin-share-copy" aria-live="polite">
              <h2>{data.loading ? 'Loading results…' : `${completedCount} ${completedCount === 1 ? 'result' : 'results'} ready to review`}</h2>
              <p>{completedCount > 0 ? 'Review results from completed student assessments.' : 'Results from completed student assessments will appear here.'}</p>
            </div>
            <div className="admin-share-mascot" aria-hidden="true">
              <div className="admin-mascot-orientation">
                <div className="admin-mascot-assets">
                  <img className="admin-mascot-glow" src="/assets/nota-mascot-glow.png" alt="" />
                  <div className="admin-mascot-core">
                    <img className="admin-mascot-body" src="/assets/nota-mascot-body.png" alt="" />
                    <img className="admin-mascot-gloss" src="/assets/nota-mascot-gloss.png" alt="" />
                    <span className="admin-mascot-eye admin-mascot-eye-left" />
                    <span className="admin-mascot-eye admin-mascot-eye-right" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <Link to="/admin/assessments" className="admin-share-link">Go to Assessments <Icon name="arrow" /></Link>
        </aside>
      </section>

      <RecentAssessments items={data.recent} loading={data.loading} />
      {selectedPassage ? (
        <CreateLinkDialog
          passage={selectedPassage}
          existingLinkCount={data.links.filter(link => link.passage_id === selectedPassage.passage_id).length}
          onClose={() => setSelectedPassage(null)}
          onCreated={handleCreated}
        />
      ) : null}
      {previewPassage ? (
        <PassagePreviewDialog
          passage={previewPassage}
          existingLink={previewLink}
          copied={previewLink ? copiedLinkId === previewLink.id : false}
          onCopyLink={copyLink}
          onCreateLink={passage => {
            setPreviewPassage(null)
            setSelectedPassage(passage)
          }}
          onClose={() => setPreviewPassage(null)}
        />
      ) : null}
    </main>
  )
}

function estimatedReadingTime(wordCount: number): string {
  const fastestMinutes = Math.max(1, Math.round(wordCount / 160))
  const slowestMinutes = Math.max(fastestMinutes, Math.ceil(wordCount / 120))
  if (fastestMinutes === slowestMinutes) {
    return `~${fastestMinutes} ${fastestMinutes === 1 ? 'minute' : 'minutes'}`
  }
  return `~${fastestMinutes}–${slowestMinutes} minutes`
}

function PassagePreviewDialog({
  passage,
  existingLink,
  copied,
  onCopyLink,
  onCreateLink,
  onClose,
}: {
  passage: PassageChoice
  existingLink: AssessmentLink | null
  copied: boolean
  onCopyLink: (link: AssessmentLink) => Promise<void>
  onCreateLink: (passage: PassageChoice) => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  function close() {
    dialogRef.current?.close()
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="admin-passage-preview-dialog"
      aria-labelledby="passage-preview-title"
      aria-describedby="passage-preview-summary"
      onCancel={event => { event.preventDefault(); close() }}
      onClick={event => { if (event.target === event.currentTarget) close() }}
    >
      <button
        className="admin-passage-preview-close"
        type="button"
        aria-label="Close passage preview"
        onClick={close}
        autoFocus
      >
        <img src="/assets/admin-preview-icons/close.svg" alt="" />
      </button>
      <div className="admin-passage-preview-content">
        <section className="admin-passage-preview-summary" aria-label="Passage summary">
          <img className="admin-passage-preview-art" src="/assets/new-apartment.png" alt="" />
          <div className="admin-passage-preview-copy">
            <h2 id="passage-preview-title">{passage.title}</h2>
            <p id="passage-preview-summary" className="admin-passage-preview-description">
              {passage.context?.trim() || passageDescription(passage.context, passage.reference_text)}
            </p>
            <div className="admin-passage-preview-details" aria-label="Assessment details">
              <span className="admin-passage-preview-detail">
                <img src="/assets/admin-preview-icons/readers.svg" alt="" />
                <span>{passage.required_readings} reading {passage.required_readings === 1 ? 'attempt' : 'attempts'}</span>
              </span>
              <span className="admin-passage-preview-divider" aria-hidden="true" />
              <span className="admin-passage-preview-detail">
                <img src="/assets/admin-preview-icons/clock.svg" alt="" />
                <span>{estimatedReadingTime(passage.word_count)}</span>
              </span>
            </div>
          </div>
          <button
            className="admin-passage-preview-action"
            type="button"
            onClick={() => existingLink ? void onCopyLink(existingLink) : onCreateLink(passage)}
          >
            <span aria-live="polite">{existingLink ? copied ? 'Copied' : 'Copy Link' : 'Create Link'}</span>
            <img src="/assets/admin-preview-icons/link.svg" alt="" />
          </button>
        </section>
        <section className="admin-passage-preview-reading" aria-labelledby="passage-preview-reading-title">
          <div className="admin-passage-preview-badge">
            <img src="/assets/admin-preview-icons/book.svg" alt="" />
            <h3 id="passage-preview-reading-title">Reading Passage</h3>
          </div>
          <div className="admin-passage-preview-text" role="region" aria-label="Passage text" tabIndex={0}>
            {passage.reference_text.split(/\n\s*\n/).map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </section>
      </div>
    </dialog>
  )
}

const metricIconAssets = {
  submissions: '/assets/admin-metric-icons/submissions.svg',
  processing: '/assets/admin-metric-icons/processing.svg',
  completed: '/assets/admin-metric-icons/completed.svg',
} as const

function MetricCard({ label, value, icon }: { label: string; value: string; icon: keyof typeof metricIconAssets }) {
  return (
    <article className="admin-metric-card">
      <div className="admin-metric-label">
        <span>{label}</span>
        <span className="admin-metric-icon" aria-hidden="true"><img src={metricIconAssets[icon]} alt="" /></span>
      </div>
      <strong>{value}</strong>
    </article>
  )
}

function RecentAssessments({ items, loading }: { items: RecentAssessment[]; loading: boolean }) {
  return (
    <section className="admin-recent-section">
      <div className="admin-recent-heading">
        <h2>Recent Assessment</h2>
        <Link to="/admin/assessments" className="admin-text-link">View all assessments <Icon name="arrow" /></Link>
      </div>
      <div className="admin-recent-panel admin-panel">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead><tr><th>Student</th><th>Assessment</th><th>Submitted at</th><th>Status</th><th>Result</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="admin-table-message">Loading submissions…</td></tr> : items.length ? items.map(item => (
                <tr key={item.id}>
                  <td><div className="admin-student-cell"><strong>{item.learner_reference}</strong></div></td>
                  <td>{item.linkTitle}</td>
                  <td>{formatDate(item.completed_at || item.created_at)}</td>
                  <td><span className={`admin-status ${statusStyle(item.status)}`}><i />{statusName(item.status)}</span></td>
                  <td><span className="admin-result-text">{item.headline.length ? item.headline.join(' · ') : item.status === 'COMPLETED' ? 'Report ready' : '—'}</span></td>
                </tr>
              )) : <tr><td colSpan={5} className="admin-table-message">No student submissions yet. Share an assessment link to get started.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function defaultExpiryDate(): string {
  const date = new Date()
  date.setDate(date.getDate() + 30)
  return formatDateInput(date)
}

function todayDate(): string {
  return formatDateInput(new Date())
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function linkExpiry(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 23, 59, 59).toISOString()
}

function CreateLinkDialog({
  passage,
  existingLinkCount,
  onClose,
  onCreated,
}: {
  passage: PassageChoice
  existingLinkCount: number
  onClose: () => void
  onCreated: (link: AssessmentLink) => void
}) {
  const { session, updateSession } = useCenterAuth()
  const [title, setTitle] = useState(`${passage.title} Assessment${existingLinkCount ? ` ${existingLinkCount + 1}` : ''}`)
  const [expiresAt, setExpiresAt] = useState(defaultExpiryDate)
  const [minimumExpiryDate] = useState(todayDate)
  const [maxSubmissions, setMaxSubmissions] = useState('40')
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const [created, setCreated] = useState<AssessmentLink | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function markEdited() {
    setIdempotencyKey(crypto.randomUUID())
    setCreated(null)
    setCopied(false)
  }

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!session) return

    const limit = maxSubmissions.trim() === '' ? null : Number(maxSubmissions)
    if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 5000)) {
      setError('Enter a submission limit between 1 and 5,000, or leave it blank for no limit.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const input: CreateLinkRequest = {
        title: title.trim(),
        passage_id: passage.passage_id,
        expires_at: expiresAt ? linkExpiry(expiresAt) : null,
        max_submissions: limit,
      }
      const link = await createAssessmentLink(input, idempotencyKey, session, updateSession)
      setCreated(link)
      onCreated(link)
      try {
        await copyText(link.share_url)
        setCopied(true)
      } catch {
        setCopied(false)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The assessment link could not be created.')
    } finally {
      setBusy(false)
    }
  }

  async function copyCreatedLink() {
    if (!created) return
    try {
      await copyText(created.share_url)
      setCopied(true)
      setError('')
    } catch (cause) {
      setCopied(false)
      setError(cause instanceof Error ? cause.message : 'Copy failed. Select the link and copy it manually.')
    }
  }

  return (
    <div className="admin-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <section className="admin-create-dialog" role="dialog" aria-modal="true" aria-labelledby="create-link-title">
        <button className="admin-dialog-close" type="button" onClick={onClose} aria-label="Close" disabled={busy}><Icon name="close" /></button>
        {!created ? (
          <>
            <span className="admin-eyebrow">ASSESSMENT LIBRARY</span>
            <h2 id="create-link-title">Create an assessment link</h2>
            <p className="admin-dialog-intro">Set up a student link for <strong>{passage.title}</strong>.</p>
            <form className="admin-create-form" onSubmit={submit}>
              <label htmlFor="assessment-title">Assessment name</label>
              <input id="assessment-title" value={title} onChange={event => { setTitle(event.target.value); markEdited() }} maxLength={120} required disabled={busy} />
              <div className="admin-form-two-columns">
                <div>
                  <label htmlFor="assessment-expiry">Link expires</label>
                  <input id="assessment-expiry" type="date" value={expiresAt} min={minimumExpiryDate} onChange={event => { setExpiresAt(event.target.value); markEdited() }} disabled={busy} />
                </div>
                <div>
                  <label htmlFor="assessment-limit">Submission limit</label>
                  <input id="assessment-limit" type="number" min={1} max={5000} value={maxSubmissions} onChange={event => { setMaxSubmissions(event.target.value); markEdited() }} placeholder="No limit" disabled={busy} />
                </div>
              </div>
              <div className="admin-form-note"><span><Icon name="clock" /></span><p>This assessment uses <strong>{passage.word_count} words</strong>. The required number of readings is set by your assessment configuration.</p></div>
              {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
              <div className="admin-dialog-actions">
                <button className="admin-outline-button" type="button" onClick={onClose} disabled={busy}>Cancel</button>
                <button className="admin-primary-button" type="submit" disabled={busy || !title.trim()}>{busy ? 'Creating…' : 'Create and copy link'} <Icon name="link" /></button>
              </div>
            </form>
          </>
        ) : (
          <>
            <span className="admin-created-check"><Icon name="check" /></span>
            <span className="admin-eyebrow">LINK READY</span>
            <h2 id="create-link-title">Your assessment link is ready</h2>
            <p className="admin-dialog-intro">{created.title} · {created.required_readings} required {created.required_readings === 1 ? 'reading' : 'readings'}</p>
            <label className="admin-share-url-label" htmlFor="created-share-url">Share this link with your students</label>
            <input className="admin-share-url-input" id="created-share-url" readOnly value={created.share_url} onFocus={event => event.currentTarget.select()} />
            <p className={`admin-copy-feedback ${copied ? 'is-visible' : ''}`} role="status">{copied ? 'Copied to clipboard.' : 'Copy the link, or select it above.'}</p>
            {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
            <div className="admin-dialog-actions">
              <button className="admin-outline-button" type="button" onClick={onClose}>Done</button>
              <button className="admin-primary-button" type="button" onClick={() => void copyCreatedLink()}><Icon name="link" /> Copy Link</button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

export function AdminAssessmentsPage() {
  const { session, updateSession } = useCenterAuth()
  const [passages, setPassages] = useState<PassageChoice[]>([])
  const [links, setLinks] = useState<AssessmentLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshIndex, setRefreshIndex] = useState(0)
  const [selectedPassage, setSelectedPassage] = useState<PassageChoice | null>(null)
  const [selectedPassageId, setSelectedPassageId] = useState('')
  const [query, setQuery] = useState('')
  const [now] = useState(Date.now)
  const { copiedLinkId, copyLink } = useCopyAssessmentLink(setError)

  useEffect(() => {
    if (!session) return
    let active = true
    Promise.all([getPassages(session, updateSession), getAssessmentLinks(session, updateSession)])
      .then(([passageItems, fetchedLinks]) => {
        if (!active) return
        setPassages(passageItems)
        setLinks([...fetchedLinks].sort((left, right) => right.created_at.localeCompare(left.created_at)))
        setSelectedPassageId(current => current || passageItems[0]?.passage_id || '')
        setError('')
      })
      .catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : 'Assessments could not be loaded.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session, updateSession, refreshIndex])

  const visibleLinks = links.filter(link =>
    `${link.title} ${link.passage_id} ${link.status}`.toLowerCase().includes(query.toLowerCase()),
  )

  function handleCreated(link: AssessmentLink) {
    setLinks(current => [link, ...current.filter(item => item.id !== link.id)]
      .sort((left, right) => right.created_at.localeCompare(left.created_at)))
    setRefreshIndex(index => index + 1)
  }

  const selectedPassageCount = selectedPassage
    ? links.filter(link => link.passage_id === selectedPassage.passage_id).length
    : 0

  return (
    <main className="admin-page admin-assessments-page">
      <section className="admin-page-heading">
        <div><h1>Assessments</h1><p>Create and manage links shared with your students.</p></div>
        <div className="admin-heading-actions">
          {passages.length > 1 ? (
            <>
              <label className="visually-hidden" htmlFor="assessment-passage-select">Passage</label>
              <select id="assessment-passage-select" className="admin-passage-selector" value={selectedPassageId || passages[0].passage_id} onChange={event => setSelectedPassageId(event.target.value)}>
                {passages.map(passage => <option value={passage.passage_id} key={passage.passage_id}>{passage.title}</option>)}
              </select>
            </>
          ) : null}
          <button
            className="admin-primary-button"
            type="button"
            disabled={!passages.length}
            onClick={() => {
              const passage = passages.find(item => item.passage_id === selectedPassageId) || passages[0]
              if (passage) setSelectedPassage(passage)
            }}
          >Create assessment <Icon name="arrow" /></button>
        </div>
      </section>
      {error ? <div className="admin-error-banner" role="alert">{error}</div> : null}

      <section className="admin-links-panel admin-panel">
        <div className="admin-links-toolbar">
          <div><h2>Assessment links</h2><p>{links.length} links created</p></div>
          <label className="admin-search"><Icon name="search" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search assessment links" /></label>
        </div>
        <div className="admin-table-scroll">
          <table className="admin-table admin-links-table">
            <thead><tr><th>Assessment</th><th>Passage</th><th>Created</th><th>Submissions</th><th>Status</th><th>Share link</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className="admin-table-message">Loading assessment links…</td></tr> : visibleLinks.length ? visibleLinks.map(link => (
                <AssessmentLinkRow
                  key={link.id}
                  link={link}
                  passageTitle={passages.find(passage => passage.passage_id === link.passage_id)?.title || `Passage ${link.passage_id}`}
                  now={now}
                  copied={copiedLinkId === link.id}
                  onCopy={() => void copyLink(link)}
                />
              )) : (
                <tr><td colSpan={6} className="admin-table-message">{query ? 'No links match your search.' : 'No assessment links yet. Create one to share with your students.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {selectedPassage ? (
        <CreateLinkDialog
          passage={selectedPassage}
          existingLinkCount={selectedPassageCount}
          onClose={() => setSelectedPassage(null)}
          onCreated={handleCreated}
        />
      ) : null}
    </main>
  )
}

function AssessmentLinkRow({
  link,
  passageTitle,
  now,
  copied,
  onCopy,
}: {
  link: AssessmentLink
  passageTitle: string
  now: number
  copied: boolean
  onCopy: () => void
}) {
  const unavailable = !isShareableLink(link, now) && link.status === 'ACTIVE'
  return (
    <tr>
      <td><strong>{link.title}</strong><small className="admin-table-subtitle">{link.required_readings} required {link.required_readings === 1 ? 'reading' : 'readings'}</small></td>
      <td>{passageTitle}<small className="admin-table-subtitle">Version {link.passage_version}</small></td>
      <td>{formatDate(link.created_at)}</td>
      <td>{link.submission_count}{link.max_submissions ? ` / ${link.max_submissions}` : ''}<small className="admin-table-subtitle">{link.completed_count} completed · {link.in_progress_count} in progress</small></td>
      <td><span className={`admin-status ${statusStyle(link.status)}`}><i />{statusName(link.status)}{unavailable ? ' · unavailable' : ''}</span></td>
      <td>
        <div className="admin-link-url-cell">
          <a href={link.share_url} target="_blank" rel="noreferrer" title={link.share_url}>{link.share_url}</a>
          <button className="admin-copy-row-button" type="button" onClick={onCopy}><Icon name="link" />{copied ? 'Copied' : 'Copy'}</button>
        </div>
      </td>
    </tr>
  )
}
