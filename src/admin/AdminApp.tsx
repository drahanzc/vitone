import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
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
  type CenterProfile,
  type CenterSession,
  type CreateLinkRequest,
  type PassageChoice,
  type AssessmentListItem,
} from './admin-api'
import './admin.css'

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
    const current = session
    if (!current) return
    try {
      const fresh = await getFreshCenterSession(current, updateSession)
      await revokeCenterSession(fresh, updateSession)
    } catch {
      // Clear the local session even when the server cannot revoke it.
    } finally {
      updateSession(null)
    }
  }, [session, updateSession])
  const value = useMemo(() => ({ session, updateSession, signIn, signOut }), [session, updateSession, signIn, signOut])

  return <CenterAuthContext.Provider value={value}>{children}</CenterAuthContext.Provider>
}

function Icon({ name }: { name: 'dashboard' | 'assessment' | 'search' | 'folder' | 'clock' | 'check' | 'arrow' | 'link' | 'close' | 'eye' }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 1.7 }
  const paths: Record<typeof name, ReactNode> = {
    dashboard: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.4" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.4" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.4" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.4" /></>,
    assessment: <><path d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 19V7A1.5 1.5 0 0 1 4 5.5Z" /><path d="M7 3.5h10M7 10h10M7 14h6" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.4" /><path d="m15.5 15.5 5 5" /></>,
    folder: <><path d="M3 7.5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 10h18" /></>,
    clock: <><circle cx="12" cy="12" r="8.8" /><path d="M12 7v5l3.3 2" /></>,
    check: <path d="m5 12.5 4.3 4.3L19.5 6.8" />,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    link: <><path d="M10 13.8 8.7 15a4 4 0 1 1-5.7-5.7l3.2-3.2a4 4 0 0 1 5.7 0" /><path d="m14 10.2 1.3-1.3A4 4 0 1 1 21 14.6l-3.2 3.2a4 4 0 0 1-5.7 0" /><path d="m8.8 15.2 6.4-6.4" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    eye: <><path d="M2.5 12s3.4-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.4 5.5-9.5 5.5S2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
  }
  return <svg aria-hidden="true" viewBox="0 0 24 24" {...common}>{paths[name]}</svg>
}

function BrandMark() {
  return <span className="admin-brand-mark" aria-hidden="true"><img src="/assets/vitone-mark.png" alt="" /></span>
}

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
          <button className="admin-primary-button admin-login-submit" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <Icon name="arrow" /></button>
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
  const activePage = location.pathname.endsWith('/assessments') ? 'Assessments' : 'Dashboard'

  useEffect(() => {
    if (!session) return
    let active = true
    getCenterProfile(session, updateSession).then(value => {
      if (active) setProfile(value)
    }).catch(cause => {
      if (active) setProfileError(cause instanceof Error ? cause.message : 'Profile could not be loaded.')
    })
    return () => { active = false }
  }, [session, updateSession])

  const displayName = profile?.center.name || profile?.user.email || 'Center account'
  const initials = displayName.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'V'

  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <Link className="admin-brand" to="/admin"><BrandMark /><span>Vitone</span></Link>
        <div className="admin-side-section-label">Workspace</div>
        <nav className="admin-nav" aria-label="Center workspace">
          <NavLink to="/admin" end className={({ isActive }) => `admin-nav-link ${isActive ? 'is-active' : ''}`}><Icon name="dashboard" /><span>Dashboard</span></NavLink>
          <NavLink to="/admin/assessments" className={({ isActive }) => `admin-nav-link ${isActive ? 'is-active' : ''}`}><Icon name="assessment" /><span>Assessments</span></NavLink>
        </nav>
        <div className="admin-side-divider" />
        <div className="admin-sidebar-bottom">
          <div className="admin-profile-avatar">{initials}</div>
          <div className="admin-profile-copy"><strong title={displayName}>{displayName}</strong><span>{profile?.user.email || 'Center workspace'}</span></div>
          <button className="admin-signout-button" type="button" onClick={() => void signOut()} aria-label="Sign out" title="Sign out">↪</button>
        </div>
      </aside>
      <div className="admin-main-area">
        <header className="admin-topbar">
          <div className="admin-breadcrumb"><Link to="/admin">Dashboard</Link><span>/</span><strong>{activePage === 'Dashboard' ? 'Overview' : activePage}</strong></div>
        </header>
        {profileError ? <div className="admin-profile-warning" role="status">{profileError}</div> : null}
        <Outlet />
      </div>
    </div>
  )
}

function pageDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

function statusName(status: string): string {
  const labels: Record<string, string> = { ACTIVE: 'Active', DISABLED: 'Disabled', CREATED: 'Created', UPLOADING: 'Uploading', UPLOADED: 'Submitted', PROCESSING: 'Processing', COMPLETED: 'Completed', FAILED: 'Failed' }
  return labels[status] || status.replaceAll('_', ' ').toLowerCase().replace(/^./, char => char.toUpperCase())
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

type RecentAssessment = AssessmentListItem & { linkTitle: string }

export function AdminDashboardPage() {
  const { session, updateSession } = useCenterAuth()
  const [passages, setPassages] = useState<PassageChoice[]>([])
  const [links, setLinks] = useState<AssessmentLink[]>([])
  const [recent, setRecent] = useState<RecentAssessment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshIndex, setRefreshIndex] = useState(0)
  const [selectedPassage, setSelectedPassage] = useState<PassageChoice | null>(null)
  const [copiedLinkId, setCopiedLinkId] = useState('')
  const [now] = useState(Date.now)

  useEffect(() => {
    if (!session) return
    let active = true
    async function load() {
      try {
        const [passageItems, linkItems] = await Promise.all([
          getPassages(session, updateSession),
          getAssessmentLinks(session, updateSession),
        ])
        if (!active) return
        setPassages(passageItems)
        const currentLinks = [...linkItems].sort((a, b) => b.created_at.localeCompare(a.created_at))
        setLinks(currentLinks)
        const assessmentPages = await Promise.all(currentLinks.slice(0, 8).map(async link => {
          try {
            const page = await getLinkAssessments(link.id, session, updateSession)
            return page.items.map(item => ({ ...item, linkTitle: link.title }))
          } catch {
            return []
          }
        }))
        if (!active) return
        setRecent(assessmentPages.flat().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8))
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

  const totalSubmissions = links.reduce((sum, link) => sum + link.submission_count, 0)
  const processingCount = links.reduce((sum, link) => sum + link.in_progress_count, 0)
  const completedCount = links.reduce((sum, link) => sum + link.completed_count, 0)
  async function copyLink(link: AssessmentLink) {
    try {
      await copyText(link.share_url)
      setCopiedLinkId(link.id)
      window.setTimeout(() => setCopiedLinkId(current => current === link.id ? '' : current), 1800)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The link could not be copied.')
    }
  }

  return (
    <main className="admin-page admin-dashboard-page">
      <section className="admin-page-heading">
        <div><h1>Dashboard</h1><p>Create and share reading assessments, and follow up on student results.</p></div>
      </section>

      {error ? <div className="admin-error-banner" role="alert">{error}</div> : null}

      <section className="admin-overview-cards" aria-label="Submission overview">
        <MetricCard label="Total submissions" value={loading ? '—' : String(totalSubmissions)} icon="folder" tone="blue" />
        <MetricCard label="Processing" value={loading ? '—' : String(processingCount)} icon="clock" tone="cyan" />
        <MetricCard label="Completed" value={loading ? '—' : String(completedCount)} icon="check" tone="green" />
      </section>

      <section className="admin-dashboard-columns">
        <div className="admin-library-panel admin-panel">
          <div className="admin-panel-heading"><div><h2>Assessment Library</h2></div><Link to="/admin/assessments" className="admin-text-link">View all <Icon name="arrow" /></Link></div>
          {loading ? <div className="admin-skeleton-card" aria-label="Loading passages" /> : passages.length ? (
            <div className="admin-passage-list">
              {passages.map(passage => {
                const existingLink = links.find(link => link.passage_id === passage.passage_id && link.passage_version === passage.version && isShareableLink(link, now))
                return <article className="admin-passage-card" key={`${passage.passage_id}-${passage.version}`}>
                  <img className="admin-passage-art" src="/assets/new-apartment.png" alt="" />
                  <div className="admin-passage-copy"><h3>{passage.title}</h3><p>Students will read this passage aloud for assessment.</p><small>{passage.word_count} words{existingLink ? ` · ${existingLink.required_readings} required ${existingLink.required_readings === 1 ? 'reading' : 'readings'}` : ''}</small></div>
                    <div className="admin-passage-actions">
                      {existingLink ? <><a className="admin-outline-button admin-passage-secondary" href={existingLink.share_url} target="_blank" rel="noreferrer">Preview assessment <Icon name="eye" /></a><button className="admin-primary-button admin-passage-create" type="button" onClick={() => void copyLink(existingLink)}><span>{copiedLinkId === existingLink.id ? 'Copied' : 'Copy Link'}</span><Icon name="link" /></button></> : <button className="admin-primary-button admin-passage-create" type="button" onClick={() => setSelectedPassage(passage)}>Create Link <Icon name="link" /></button>}
                    </div>
                </article>
              })}
            </div>
          ) : <div className="admin-empty-state"><Icon name="folder" /><h3>No passages available</h3><p>Passage packages need to be seeded before your center can create links.</p></div>}
        </div>

        <aside className="admin-share-panel">
          <div className="admin-share-copy"><span className="admin-eyebrow">READY TO SHARE</span><h2>{links.filter(link => link.status === 'ACTIVE').length} active assessment {links.filter(link => link.status === 'ACTIVE').length === 1 ? 'link' : 'links'}</h2><p>Share a link with your students so they can complete their reading assessment.</p><Link to="/admin/assessments" className="admin-share-link">View assessments <Icon name="arrow" /></Link></div>
          <div className="admin-share-mascot" aria-hidden="true"><span className="admin-mascot-glow" /><span className="admin-mascot-core"><img src="/assets/mascot-gloss.svg" alt="" /><img src="/assets/mascot-eye.svg" alt="" /><img src="/assets/mascot-eye-alt.svg" alt="" /></span></div>
        </aside>
      </section>

      <section className="admin-recent-section">
        <div className="admin-recent-heading"><h2>Recent Assessment</h2><Link to="/admin/assessments" className="admin-text-link">View all assessments <Icon name="arrow" /></Link></div>
        <div className="admin-recent-panel admin-panel">
          <div className="admin-table-scroll"><table className="admin-table">
            <thead><tr><th>Student</th><th>Assessment</th><th>Submitted at</th><th>Status</th><th>Result</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="admin-table-message">Loading submissions…</td></tr> : recent.length ? recent.map(item => (
                <tr key={item.id}><td><div className="admin-student-cell"><strong>{item.learner_reference}</strong></div></td><td>{item.linkTitle}</td><td>{pageDate(item.completed_at || item.created_at)}</td><td><span className={`admin-status ${statusStyle(item.status)}`}><i />{statusName(item.status)}</span></td><td><span className="admin-result-text">{item.headline.length ? item.headline.join(' · ') : item.status === 'COMPLETED' ? 'Report ready' : '—'}</span></td></tr>
              )) : <tr><td colSpan={5} className="admin-table-message">No student submissions yet. Share an assessment link to get started.</td></tr>}
            </tbody>
          </table></div>
        </div>
      </section>
      {selectedPassage ? <CreateLinkDialog passage={selectedPassage} existingLinkCount={links.filter(link => link.passage_id === selectedPassage.passage_id).length} onClose={() => setSelectedPassage(null)} onCreated={created => { setLinks(current => [created, ...current.filter(link => link.id !== created.id)].sort((a, b) => b.created_at.localeCompare(a.created_at))); setRefreshIndex(value => value + 1) }} /> : null}
    </main>
  )
}

function MetricCard({ label, value, icon, tone }: { label: string; value: string; icon: 'folder' | 'clock' | 'check'; tone: 'blue' | 'cyan' | 'green' }) {
  return <article className="admin-metric-card"><div className="admin-metric-label"><span>{label}</span><span className={`admin-metric-icon is-${tone}`}><Icon name={icon} /></span></div><strong>{value}</strong></article>
}

function dateInputDefault(): string {
  const date = new Date()
  date.setDate(date.getDate() + 30)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateInputToday(): string {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function linkExpiry(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 23, 59, 59).toISOString()
}

function CreateLinkDialog({ passage, existingLinkCount, onClose, onCreated }: { passage: PassageChoice; existingLinkCount: number; onClose: () => void; onCreated: (link: AssessmentLink) => void }) {
  const { session, updateSession } = useCenterAuth()
  const [title, setTitle] = useState(`${passage.title} Assessment${existingLinkCount ? ` ${existingLinkCount + 1}` : ''}`)
  const [expiresAt, setExpiresAt] = useState(dateInputDefault)
  const [minimumExpiryDate] = useState(dateInputToday)
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

  async function submit(event: FormEvent<HTMLFormElement>) {
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
      const result = await createAssessmentLink(input, idempotencyKey, session, updateSession)
      setCreated(result)
      onCreated(result)
      try {
        await copyText(result.share_url)
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
        {!created ? <>
          <span className="admin-eyebrow">ASSESSMENT LIBRARY</span>
          <h2 id="create-link-title">Create an assessment link</h2>
          <p className="admin-dialog-intro">Set up a student link for <strong>{passage.title}</strong>.</p>
          <form className="admin-create-form" onSubmit={submit}>
            <label htmlFor="assessment-title">Assessment name</label>
            <input id="assessment-title" value={title} onChange={event => { setTitle(event.target.value); markEdited() }} maxLength={120} required disabled={busy} />
            <div className="admin-form-two-columns">
              <div><label htmlFor="assessment-expiry">Link expires</label><input id="assessment-expiry" type="date" value={expiresAt} min={minimumExpiryDate} onChange={event => { setExpiresAt(event.target.value); markEdited() }} disabled={busy} /></div>
              <div><label htmlFor="assessment-limit">Submission limit</label><input id="assessment-limit" type="number" min={1} max={5000} value={maxSubmissions} onChange={event => { setMaxSubmissions(event.target.value); markEdited() }} placeholder="No limit" disabled={busy} /></div>
            </div>
            <div className="admin-form-note"><span><Icon name="clock" /></span><p>This assessment uses <strong>{passage.word_count} words</strong>. The required number of readings is set by your assessment configuration.</p></div>
            {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
            <div className="admin-dialog-actions"><button className="admin-outline-button" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="admin-primary-button" type="submit" disabled={busy || !title.trim()}>{busy ? 'Creating…' : 'Create and copy link'} <Icon name="link" /></button></div>
          </form>
        </> : <>
          <span className="admin-created-check"><Icon name="check" /></span>
          <span className="admin-eyebrow">LINK READY</span>
          <h2 id="create-link-title">Your assessment link is ready</h2>
          <p className="admin-dialog-intro">{created.title} · {created.required_readings} required {created.required_readings === 1 ? 'reading' : 'readings'}</p>
          <label className="admin-share-url-label" htmlFor="created-share-url">Share this link with your students</label>
          <input className="admin-share-url-input" id="created-share-url" readOnly value={created.share_url} onFocus={event => event.currentTarget.select()} />
          <p className={`admin-copy-feedback ${copied ? 'is-visible' : ''}`} role="status">{copied ? 'Copied to clipboard.' : 'Copy the link, or select it above.'}</p>
          {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
          <div className="admin-dialog-actions"><button className="admin-outline-button" type="button" onClick={onClose}>Done</button><button className="admin-primary-button" type="button" onClick={() => void copyCreatedLink()}><Icon name="link" /> Copy Link</button></div>
        </>}
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
  const [copiedLinkId, setCopiedLinkId] = useState('')
  const [query, setQuery] = useState('')
  const [now] = useState(Date.now)

  useEffect(() => {
    if (!session) return
    let active = true
    Promise.all([getPassages(session, updateSession), getAssessmentLinks(session, updateSession)]).then(([passageItems, items]) => {
      if (!active) return
      setPassages(passageItems)
      setLinks([...items].sort((a, b) => b.created_at.localeCompare(a.created_at)))
      setSelectedPassageId(current => current || passageItems[0]?.passage_id || '')
      setError('')
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'Assessments could not be loaded.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [session, updateSession, refreshIndex])

  const visible = links.filter(link => `${link.title} ${link.passage_id} ${link.status}`.toLowerCase().includes(query.toLowerCase()))

  async function copyLink(link: AssessmentLink) {
    try {
      await copyText(link.share_url)
      setCopiedLinkId(link.id)
      window.setTimeout(() => setCopiedLinkId(current => current === link.id ? '' : current), 1800)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The link could not be copied.')
    }
  }

  return (
    <main className="admin-page admin-assessments-page">
      <section className="admin-page-heading"><div><h1>Assessments</h1><p>Create and manage links shared with your students.</p></div><div className="admin-heading-actions">{passages.length > 1 ? <label className="visually-hidden" htmlFor="assessment-passage-select">Passage</label> : null}{passages.length > 1 ? <select id="assessment-passage-select" className="admin-passage-selector" value={selectedPassageId || passages[0].passage_id} onChange={event => setSelectedPassageId(event.target.value)}>{passages.map(passage => <option value={passage.passage_id} key={passage.passage_id}>{passage.title}</option>)}</select> : null}<button className="admin-primary-button" type="button" onClick={() => { const passage = passages.find(item => item.passage_id === selectedPassageId) || passages[0]; if (passage) setSelectedPassage(passage) }} disabled={!passages.length}>Create assessment <Icon name="arrow" /></button></div></section>
      {error ? <div className="admin-error-banner" role="alert">{error}</div> : null}
      <section className="admin-links-panel admin-panel">
        <div className="admin-links-toolbar"><div><h2>Assessment links</h2><p>{links.length} links created</p></div><label className="admin-search"><Icon name="search" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search assessment links" /></label></div>
        <div className="admin-table-scroll"><table className="admin-table admin-links-table">
          <thead><tr><th>Assessment</th><th>Passage</th><th>Created</th><th>Submissions</th><th>Status</th><th>Share link</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="admin-table-message">Loading assessment links…</td></tr> : visible.length ? visible.map(link => {
              const passageTitle = passages.find(passage => passage.passage_id === link.passage_id)?.title || `Passage ${link.passage_id}`
              return <tr key={link.id}><td><strong>{link.title}</strong><small className="admin-table-subtitle">{link.required_readings} required {link.required_readings === 1 ? 'reading' : 'readings'}</small></td><td>{passageTitle}<small className="admin-table-subtitle">Version {link.passage_version}</small></td><td>{pageDate(link.created_at)}</td><td>{link.submission_count}{link.max_submissions ? ` / ${link.max_submissions}` : ''}<small className="admin-table-subtitle">{link.completed_count} completed · {link.in_progress_count} in progress</small></td><td><span className={`admin-status ${statusStyle(link.status)}`}><i />{statusName(link.status)}{isShareableLink(link, now) ? '' : link.status === 'ACTIVE' ? ' · unavailable' : ''}</span></td><td><div className="admin-link-url-cell"><a href={link.share_url} target="_blank" rel="noreferrer" title={link.share_url}>{link.share_url}</a><button className="admin-copy-row-button" type="button" onClick={() => void copyLink(link)}><Icon name="link" />{copiedLinkId === link.id ? 'Copied' : 'Copy'}</button></div></td></tr>
            }) : <tr><td colSpan={6} className="admin-table-message">{query ? 'No links match your search.' : 'No assessment links yet. Create one to share with your students.'}</td></tr>}
          </tbody>
        </table></div>
      </section>
      {selectedPassage ? <CreateLinkDialog passage={selectedPassage} existingLinkCount={links.filter(link => link.passage_id === selectedPassage.passage_id).length} onClose={() => setSelectedPassage(null)} onCreated={created => { setLinks(current => [created, ...current.filter(link => link.id !== created.id)].sort((a, b) => b.created_at.localeCompare(a.created_at))); setRefreshIndex(value => value + 1) }} /> : null}
    </main>
  )
}
