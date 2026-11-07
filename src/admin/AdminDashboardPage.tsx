import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { getAssessmentLinks, getPassages, type AssessmentLink, type CenterSession, type PassageChoice } from './admin-api'
import { useCenterAuth } from './center-auth-context'
import { formatDate, isShareableLink, statusName, statusStyle, useCopyAssessmentLink } from './assessment-utils'
import { CreateLinkDialog } from './CreateLinkDialog'
import { MetricCard } from './MetricCard'
import { Icon } from './AdminPrimitives'

function passageDescription(context: string | null | undefined, referenceText: string): string {
  const summary = context?.trim()
  const excerpt = referenceText.trim().split(/\n\s*\n/, 1)[0]
  const description = summary && summary.length < 140 && excerpt && excerpt !== summary
    ? `${summary} Passage excerpt: ${excerpt}`
    : summary || excerpt
  if (!description) return 'Students will read this passage aloud for assessment.'
  return description.length > 400 ? `${description.slice(0, 397).trimEnd()}…` : description
}

type DashboardData = {
  passages: PassageChoice[]
  links: AssessmentLink[]
}

function useDashboardData(
  session: CenterSession | null,
  updateSession: (session: CenterSession | null) => void,
  refreshIndex: number,
) {
  const [data, setData] = useState<DashboardData>({ passages: [], links: [] })
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
        setData({ passages, links })
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

      <RecentAssessments items={data.links.slice(0, 7)} loading={data.loading} />
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

function RecentAssessments({ items, loading }: { items: AssessmentLink[]; loading: boolean }) {
  return (
    <section className="admin-recent-section">
      <div className="admin-recent-heading">
        <h2>Recent assessments</h2>
        <Link to="/admin/assessments" className="admin-text-link">View all assessments <Icon name="arrow" /></Link>
      </div>
      <div className="admin-recent-panel admin-panel">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead><tr><th scope="col">Assessment</th><th scope="col">Submissions</th><th scope="col">Deadline</th><th scope="col">Limit</th><th scope="col">Status</th><th scope="col">Results</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className="admin-table-message">Loading assessments…</td></tr> : items.length ? items.map(item => (
                <tr key={item.id}>
                  <td><div className="admin-student-cell"><strong>{item.title}</strong></div></td>
                  <td>{item.submission_count}</td>
                  <td>{item.expires_at ? formatDate(item.expires_at) : 'No deadline'}</td>
                  <td>{item.max_submissions ?? 'Unlimited'}</td>
                  <td><span className={`admin-status ${statusStyle(item.status)}`}><i />{statusName(item.status)}</span></td>
                  <td><Link className="admin-recent-results-link" to={`/admin/assessments?assessment=${encodeURIComponent(item.id)}`} aria-label={`View results for ${item.title}`}>View results <Icon name="arrow" /></Link></td>
                </tr>
              )) : <tr><td colSpan={6} className="admin-table-message">No assessments yet. Create an assessment to get started.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
