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
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import {
  createAssessmentLink,
  getAssessmentLinks,
  getCenterProfile,
  getCenterReportPdf,
  getFreshCenterSession,
  getLinkAssessments,
  getLinkedAssessment,
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
import { AdminSidebar, AdminTopbar } from './AdminLayout'
import { BrandMark, Icon } from './AdminPrimitives'

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
  const summary = context?.trim()
  const excerpt = referenceText.trim().split(/\n\s*\n/, 1)[0]
  const description = summary && summary.length < 140 && excerpt && excerpt !== summary
    ? `${summary} Passage excerpt: ${excerpt}`
    : summary || excerpt
  if (!description) return 'Students will read this passage aloud for assessment.'
  return description.length > 400 ? `${description.slice(0, 397).trimEnd()}…` : description
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
  const [query, _setQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(5)
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
    `${link.title} ${link.passage_id} ${link.status} ${passages.find(passage => passage.passage_id === link.passage_id)?.title || ''}`.toLowerCase().includes(query.toLowerCase()),
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
        <div><h1>Assessments</h1><p>View and manage student submissions for each assessment.</p></div>
        <div className="admin-heading-actions">
          {passages.length > 1 ? (
            <>
              <label className="visually-hidden" htmlFor="assessment-passage-select">Passage</label>
              <select id="assessment-passage-select" className="admin-passage-selector" value={selectedPassageId || passages[0].passage_id} onChange={event => setSelectedPassageId(event.target.value)}>
                {passages.map(passage => <option value={passage.passage_id} key={passage.passage_id}>{passage.title}</option>)}
              </select>
            </>
          ) : null}
          {/* <button
            className="admin-primary-button"
            type="button"
            disabled={!passages.length}
            onClick={() => {
              const passage = passages.find(item => item.passage_id === selectedPassageId) || passages[0]
              if (passage) setSelectedPassage(passage)
            }}
          >Create assessment <Icon name="arrow" /></button> */}
        </div>
      </section>
      {error ? <div className="admin-error-banner" role="alert">{error}</div> : null}

      {/* <div className="admin-assessments-toolbar">
        <p>{loading ? 'Loading assessments…' : `${visibleLinks.length} ${visibleLinks.length === 1 ? 'assessment' : 'assessments'}`}</p>
        <label className="admin-search"><Icon name="search" /><span className="visually-hidden">Search assessments</span><input value={query} onChange={event => { _setQuery(event.target.value); setVisibleCount(5) }} placeholder="Search assessments" /></label>
      </div> */}
      {!loading && !visibleLinks.length ? <div className="admin-empty-state admin-panel"><Icon name="folder" /><h3>{query ? 'No matching assessments' : 'No assessments yet'}</h3><p>{query ? 'Try another search.' : 'Create an assessment to share with your students.'}</p></div> : null}
      {session ? visibleLinks.slice(0, visibleCount).map(link => (
        <AssessmentResults key={link.id} link={link} passageTitle={passages.find(passage => passage.passage_id === link.passage_id && passage.version === link.passage_version)?.title || `Passage ${link.passage_id}`} session={session} updateSession={updateSession} copied={copiedLinkId === link.id} onCopy={() => void copyLink(link)} />
      )) : null}
      {visibleLinks.length > visibleCount ? <button className="admin-outline-button admin-load-assessments" type="button" onClick={() => setVisibleCount(count => count + 5)}>Show more assessments</button> : null}
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

function AssessmentResults({ link, passageTitle, session, updateSession, copied, onCopy }: {
  link: AssessmentLink
  passageTitle: string
  session: CenterSession
  updateSession: (session: CenterSession | null) => void
  copied: boolean
  onCopy: () => void
}) {
  const [filter, setFilter] = useState<SubmissionFilter>('all')
  const [now] = useState(Date.now)

  return (
    <section className="admin-assessment-group" aria-labelledby={`assessment-title-${link.id}`}>
      <div className="admin-assessment-summary">
        <div className="admin-assessment-description">
          <h2 id={`assessment-title-${link.id}`}>{link.title}</h2>
          <p>{passageTitle} · Version {link.passage_version}</p>
          <div className="admin-assessment-meta"><span className={`admin-status ${statusStyle(link.status)}`}><i />{statusName(link.status)}{link.status === 'ACTIVE' && !isShareableLink(link, now) ? ' · unavailable' : ''}</span><span>Created {formatDate(link.created_at)}</span><button className="admin-copy-row-button" type="button" onClick={onCopy}><Icon name="link" />{copied ? 'Copied' : 'Copy link'}</button></div>
        </div>
        <div className="admin-overview-cards" aria-label={`Submission overview for ${link.title}`}>
          <MetricCard label="Total submissions" value={String(link.submission_count)} icon="submissions" />
          <MetricCard label="Processing" value={String(link.in_progress_count)} icon="processing" />
          <MetricCard label="Completed" value={String(link.completed_count)} icon="completed" />
        </div>
      </div>
      <div className="admin-results-panel admin-panel">
        <div className="admin-results-heading">
          <div><h3>Student submissions</h3><p>Results for {link.title}</p></div>
          <div className="admin-results-filters" role="group" aria-label={`Filter submissions for ${link.title}`}>
            {([['all', 'All', link.submission_count], ['processing', 'Processing', link.in_progress_count], ['completed', 'Completed', link.completed_count]] as const).map(([value, label, count]) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label} ({count})</button>
            ))}
          </div>
        </div>
        <SubmissionTable key={filter} link={link} filter={filter} session={session} updateSession={updateSession} />
      </div>
    </section>
  )
}

type SubmissionFilter = 'all' | 'processing' | 'completed'

function SubmissionTable({ link, filter, session, updateSession }: {
  link: AssessmentLink
  filter: SubmissionFilter
  session: CenterSession
  updateSession: (session: CenterSession | null) => void
}) {
  const [items, setItems] = useState<AssessmentListItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [requestCursor, setRequestCursor] = useState<string | undefined>()
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    async function loadPage() {
      let next = requestCursor
      const collected: AssessmentListItem[] = []
      const seen = new Set<string>(next ? [next] : [])
      // Processing spans four API statuses. Scan a bounded number of pages per request.
      for (let pageNumber = 0; pageNumber < (filter === 'processing' ? 5 : 1); pageNumber++) {
        const page = await getLinkAssessments(link.id, session, updateSession, next, filter === 'completed' ? 'COMPLETED' : undefined)
        if (!active) return null
        collected.push(...page.items.filter(item => filter !== 'processing' || ['CREATED', 'UPLOADING', 'UPLOADED', 'PROCESSING'].includes(item.status)))
        next = page.next_cursor || undefined
        if (!next) break
        if (seen.has(next)) throw new Error('Could not load more submissions. Please try again.')
        seen.add(next)
        if (collected.length >= 5) break
      }
      return { items: collected, next_cursor: next }
    }
    loadPage()
      .then(page => {
        if (!page) return
        if (!active) return
        setItems(current => requestCursor ? [...current.filter(item => !page.items.some(next => next.id === item.id)), ...page.items] : page.items)
        setCursor(page.next_cursor || null)
      })
      .catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : 'Student submissions could not be loaded.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [link.id, filter, session, updateSession, requestCursor, attempt])

  return (
    <>
        <div className="admin-table-scroll">
          <table className="admin-table admin-results-table">
            <thead><tr><th>Student</th><th>Email</th><th>Submitted at</th><th>Status</th><th>Result</th></tr></thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td><strong>{item.learner_reference}</strong></td>
                  <td><StudentEmail assessmentId={item.id} session={session} updateSession={updateSession} /></td>
                  <td>{formatDate(item.created_at)}</td>
                  <td><span className={`admin-status ${statusStyle(item.status)}`}><i />{statusName(item.status)}</span></td>
                  <td>{item.status === 'COMPLETED' ? <ReportDownload item={item} session={session} updateSession={updateSession} /> : '—'}</td>
                </tr>
              ))}
              {!items.length && !error ? <tr><td className="admin-table-message" colSpan={5}>{loading ? 'Loading submissions…' : cursor ? 'No matches in the pages checked. Load more to continue.' : 'No submissions in this view.'}</td></tr> : null}
            </tbody>
          </table>
        </div>
        {error ? <p className="admin-form-error" role="alert">{error} <button type="button" className="admin-assessment-select" onClick={() => { setError(''); setLoading(true); setAttempt(value => value + 1) }}>Try again</button></p> : null}
        <div className="admin-results-footer">
          <span>{items.length} {items.length === 1 ? 'submission' : 'submissions'} loaded</span>
          {cursor && !error ? <button className="admin-outline-button" type="button" disabled={loading} onClick={() => { setLoading(true); setRequestCursor(cursor) }}>{loading ? 'Loading…' : 'Load more'}</button> : null}
        </div>
    </>
  )
}

function StudentEmail({ assessmentId, session, updateSession }: {
  assessmentId: string
  session: CenterSession
  updateSession: (session: CenterSession | null) => void
}) {
  const [email, setEmail] = useState<string | null | undefined>()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    getLinkedAssessment(assessmentId, session, updateSession)
      .then(detail => { if (active) setEmail(detail.learner_email ?? null) })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [assessmentId, session, updateSession, attempt])

  if (failed) return <button className="admin-assessment-select" type="button" onClick={() => { setFailed(false); setEmail(undefined); setAttempt(value => value + 1) }}>Email unavailable · Retry</button>
  return <span>{email === undefined ? 'Loading…' : email || '—'}</span>
}

function ReportDownload({ item, session, updateSession }: {
  item: AssessmentListItem
  session: CenterSession
  updateSession: (session: CenterSession | null) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function download() {
    setBusy(true)
    setError('')
    try {
      const pdf = await getCenterReportPdf(item.id, session, updateSession)
      const url = URL.createObjectURL(pdf)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `report-${item.id}.pdf`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The PDF could not be downloaded.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-report-cell">
      <button className="admin-report-download" type="button" disabled={busy} onClick={() => void download()} aria-label={`Download PDF report for ${item.learner_reference}`}>
        <Icon name="pdf" /><span>{busy ? 'Downloading…' : 'PDF'}</span>
      </button>
      {error ? <span className="admin-report-error" role="alert">{error}</span> : null}
    </div>
  )
}
