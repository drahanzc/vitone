import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { getAssessmentLinks, getLinkAssessments, getLinkedAssessment, getPassages, type AssessmentLink, type AssessmentListItem, type CenterSession, type PassageChoice } from './admin-api'
import { useCenterAuth } from './center-auth-context'
import { failureReason, formatDate, isShareableLink, matchesSubmissionFilter, statusName, statusStyle, useCopyAssessmentLink, type SubmissionFilter } from './assessment-utils'
import { CreateLinkDialog } from './CreateLinkDialog'
import { MetricCard } from './MetricCard'
import { ReportDownload } from './ReportDownload'
import { AssessmentRerunButton } from './AssessmentRerunButton'
import { Icon } from './AdminPrimitives'

export function AdminAssessmentsPage() {
  const { session, updateSession } = useCenterAuth()
  const location = useLocation()
  const selectedAssessmentId = new URLSearchParams(location.search).get('assessment')
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
  const refreshOverview = useCallback(() => setRefreshIndex(index => index + 1), [])

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
    (!selectedAssessmentId || link.id === selectedAssessmentId)
    && `${link.title} ${link.passage_id} ${link.status} ${passages.find(passage => passage.passage_id === link.passage_id)?.title || ''}`.toLowerCase().includes(query.toLowerCase()),
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
      {selectedAssessmentId ? <Link to="/admin/assessments" className="admin-text-link">← View all assessments</Link> : null}
      {!loading && !visibleLinks.length ? <div className="admin-empty-state admin-panel"><Icon name="folder" /><h3>{query || selectedAssessmentId ? 'No matching assessments' : 'No assessments yet'}</h3><p>{selectedAssessmentId ? 'This assessment is unavailable.' : query ? 'Try another search.' : 'Create an assessment to share with your students.'}</p></div> : null}
      {session ? visibleLinks.slice(0, visibleCount).map(link => (
        <AssessmentResults key={link.id} link={link} passageTitle={passages.find(passage => passage.passage_id === link.passage_id && passage.version === link.passage_version)?.title || `Passage ${link.passage_id}`} session={session} updateSession={updateSession} copied={copiedLinkId === link.id} onCopy={() => void copyLink(link)} onSubmissionChange={refreshOverview} />
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

function AssessmentResults({ link, passageTitle, session, updateSession, copied, onCopy, onSubmissionChange }: {
  link: AssessmentLink
  passageTitle: string
  session: CenterSession
  updateSession: (session: CenterSession | null) => void
  copied: boolean
  onCopy: () => void
  onSubmissionChange: () => void
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
        <SubmissionTable key={filter} link={link} filter={filter} session={session} updateSession={updateSession} onSubmissionChange={onSubmissionChange} />
      </div>
    </section>
  )
}

function SubmissionTable({ link, filter, session, updateSession, onSubmissionChange }: {
  link: AssessmentLink
  filter: SubmissionFilter
  session: CenterSession
  updateSession: (session: CenterSession | null) => void
  onSubmissionChange: () => void
}) {
  const [items, setItems] = useState<AssessmentListItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [requestCursor, setRequestCursor] = useState<string | undefined>()
  const [attempt, setAttempt] = useState(0)
  const [notice, setNotice] = useState('')

  const updateStatus = useCallback((id: string, status: string, completedAt: string | null, queued = false) => {
    setItems(current => current
      .map(item => item.id === id ? { ...item, status, completed_at: completedAt, headline: [] } : item)
      .filter(item => matchesSubmissionFilter(item.status, filter)))
    if (queued) setNotice('Assessment queued for rescoring from saved results. The previous scoring report is no longer available.')
    onSubmissionChange()
  }, [filter, onSubmissionChange])

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
        collected.push(...page.items.filter(item => matchesSubmissionFilter(item.status, filter)))
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
            <thead><tr><th>Student</th><th>Email</th><th>Submitted at</th><th>Status</th><th>Result</th><th>Actions</th></tr></thead>
            <tbody>
              {items.map(item => <SubmissionRow key={item.id} item={item} session={session} updateSession={updateSession} onStatusChange={updateStatus} />)}
              {!items.length && !error ? <tr><td className="admin-table-message" colSpan={6}>{loading ? 'Loading submissions…' : cursor ? 'No matches in the pages checked. Load more to continue.' : 'No submissions in this view.'}</td></tr> : null}
            </tbody>
          </table>
        </div>
        {notice ? <p role="status">{notice}</p> : null}
        {error ? <p className="admin-form-error" role="alert">{error} <button type="button" className="admin-assessment-select" onClick={() => { setError(''); setLoading(true); setAttempt(value => value + 1) }}>Try again</button></p> : null}
        <div className="admin-results-footer">
          <span>{items.length} {items.length === 1 ? 'submission' : 'submissions'} loaded</span>
          {cursor && !error ? <button className="admin-outline-button" type="button" disabled={loading} onClick={() => { setLoading(true); setRequestCursor(cursor) }}>{loading ? 'Loading…' : 'Load more'}</button> : null}
        </div>
    </>
  )
}

function SubmissionRow({ item, session, updateSession, onStatusChange }: {
  item: AssessmentListItem
  session: CenterSession
  updateSession: (session: CenterSession | null) => void
  onStatusChange: (id: string, status: string, completedAt: string | null, queued?: boolean) => void
}) {
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getLinkedAssessment>> | null>(null)
  const detailVersion = useRef(0)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    const version = detailVersion.current
    let timer: number | undefined
    async function loadDetail() {
      try {
        const value = await getLinkedAssessment(item.id, session, updateSession)
        if (!active || version !== detailVersion.current) return
        setDetail(value)
        setFailed(false)
        if (value.status !== item.status) onStatusChange(item.id, value.status, value.completed_at)
        if (matchesSubmissionFilter(value.status, 'processing')) {
          timer = window.setTimeout(() => void loadDetail(), 5000)
        }
      } catch {
        if (active && version === detailVersion.current) setFailed(true)
      }
    }
    void loadDetail()
    return () => { active = false; window.clearTimeout(timer) }
  }, [item.id, item.status, session, updateSession, attempt, onStatusChange])

  return <tr>
    <td><strong>{item.learner_reference}</strong></td>
    <td>{failed ? <button className="admin-assessment-select" type="button" onClick={() => { setFailed(false); setDetail(null); setAttempt(value => value + 1) }}>Details unavailable · Retry</button> : detail ? detail.learner_email || '—' : 'Loading…'}</td>
    <td>{formatDate(item.created_at)}</td>
    <td><span className={`admin-status ${statusStyle(item.status)}`}><i />{statusName(item.status)}</span></td>
    <td>{item.status === 'COMPLETED' ? <ReportDownload item={item} session={session} updateSession={updateSession} />
      : item.status === 'FAILED' ? <span className="admin-failure-reason">{failed ? 'Reason unavailable' : detail ? detail.failure_message || failureReason(detail.failure_code) : 'Loading reason…'}</span> : '—'}</td>
    <td><AssessmentRerunButton item={item} session={session} updateSession={updateSession} onQueued={() => {
      detailVersion.current += 1
      setDetail(null)
      setFailed(false)
      onStatusChange(item.id, 'UPLOADED', null, true)
    }} /></td>
  </tr>
}
