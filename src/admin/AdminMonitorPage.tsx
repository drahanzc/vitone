import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { getAssessmentLinks, getLinkAssessments, type AssessmentListItem, type AssessmentLink } from './admin-api'
import { useCenterAuth } from './center-auth-context'
import { formatDate, statusName, statusStyle } from './assessment-utils'
import { MetricCard } from './MetricCard'
import { Icon } from './AdminPrimitives'

type MonitorFilter = 'all' | 'processing' | 'failed' | 'completed'

const monitorFilters: { value: MonitorFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'processing', label: 'Processing' },
  { value: 'failed', label: 'Failed' },
  { value: 'completed', label: 'Completed' },
]

function matchesFilter(status: string, filter: MonitorFilter): boolean {
  if (filter === 'processing') return ['CREATED', 'UPLOADING', 'UPLOADED', 'PROCESSING'].includes(status)
  if (filter === 'failed') return status === 'FAILED'
  if (filter === 'completed') return status === 'COMPLETED'
  return true
}

function mergeAssessmentPage(current: AssessmentListItem[], next: AssessmentListItem[]): AssessmentListItem[] {
  const merged = new Map(current.map(item => [item.id, item]))
  for (const item of next) merged.set(item.id, item)
  return [...merged.values()]
}

export function AdminMonitorPage() {
  const { session, updateSession } = useCenterAuth()
  const [links, setLinks] = useState<AssessmentLink[]>([])
  const [selectedLinkId, setSelectedLinkId] = useState('')
  const [linksLoading, setLinksLoading] = useState(true)
  const [linksError, setLinksError] = useState('')
  const [linksAttempt, setLinksAttempt] = useState(0)
  const [items, setItems] = useState<AssessmentListItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [requestCursor, setRequestCursor] = useState<string>()
  const [pageError, setPageError] = useState('')
  const [pageAttempt, setPageAttempt] = useState(0)
  const [loadedPageKey, setLoadedPageKey] = useState<string | null>(null)
  const [failedPageKey, setFailedPageKey] = useState<string | null>(null)
  const [filter, setFilter] = useState<MonitorFilter>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!session) return
    let active = true
    getAssessmentLinks(session, updateSession)
      .then(fetched => {
        if (!active) return
        const sorted = [...fetched].sort((left, right) => right.created_at.localeCompare(left.created_at))
        setLinks(sorted)
        setSelectedLinkId(current => sorted.some(link => link.id === current) ? current : sorted[0]?.id ?? '')
        setLinksError('')
      })
      .catch(cause => {
        if (active) setLinksError(cause instanceof Error ? cause.message : 'Assessment links could not be loaded.')
      })
      .finally(() => { if (active) setLinksLoading(false) })
    return () => { active = false }
  }, [session, updateSession, linksAttempt])

  useEffect(() => {
    if (!session || !selectedLinkId) return
    let active = true
    const pageRequestKey = `${selectedLinkId}:${requestCursor ?? 'first'}:${pageAttempt}`
    getLinkAssessments(selectedLinkId, session, updateSession, requestCursor)
      .then(page => {
        if (!active) return
        setItems(current => requestCursor ? mergeAssessmentPage(current, page.items) : page.items)
        setCursor(page.next_cursor || null)
        setLoadedPageKey(pageRequestKey)
        setFailedPageKey(null)
        setPageError('')
      })
      .catch(cause => {
        if (active) {
          setPageError(cause instanceof Error ? cause.message : 'Assessments could not be loaded.')
          setFailedPageKey(pageRequestKey)
        }
      })
    return () => { active = false }
  }, [selectedLinkId, session, updateSession, requestCursor, pageAttempt])

  const selectedLink = links.find(link => link.id === selectedLinkId) ?? null
  const pageRequestKey = `${selectedLinkId}:${requestCursor ?? 'first'}:${pageAttempt}`
  const pageLoading = Boolean(selectedLinkId) && loadedPageKey !== pageRequestKey && failedPageKey !== pageRequestKey
  const visiblePageError = failedPageKey === pageRequestKey ? pageError : ''
  const filteredItems = useMemo(() => items.filter(item =>
    matchesFilter(item.status, filter)
    && `${item.learner_reference} ${item.id}`.toLowerCase().includes(query.trim().toLowerCase()),
  ), [items, filter, query])

  function selectLink(linkId: string) {
    setSelectedLinkId(linkId)
    setItems([])
    setCursor(null)
    setRequestCursor(undefined)
    setFilter('all')
    setQuery('')
  }

  function refresh() {
    setLinksLoading(true)
    setLinksError('')
    setPageError('')
    setLinksAttempt(value => value + 1)
    setItems([])
    setCursor(null)
    setRequestCursor(undefined)
    setPageAttempt(value => value + 1)
  }

  function loadMore() {
    if (!cursor || pageLoading) return
    setRequestCursor(cursor)
  }

  return <main className="admin-page admin-monitor-page admin-monitor-overview">
    <section className="admin-page-heading">
      <div><h1>Monitor</h1><p>Track assessment processing, find failures, and open a submission to inspect its checkpoints and report findings.</p></div>
      <button type="button" className="admin-outline-button" disabled={linksLoading || pageLoading} onClick={refresh}>
        <Icon name="clock" />{linksLoading || pageLoading ? 'Refreshing…' : 'Refresh'}
      </button>
    </section>

    {linksError ? <p className="admin-error-banner" role="alert">{linksError} <button className="admin-assessment-select" type="button" onClick={() => { setLinksLoading(true); setLinksError(''); setLinksAttempt(value => value + 1) }}>Try again</button></p> : null}
    {linksLoading && !links.length ? <p role="status">Loading assessment links…</p> : null}
    {!linksLoading && !linksError && !links.length ? <section className="admin-empty-state admin-panel">
      <Icon name="assessment" /><h2>No assessments to monitor</h2><p>Create an assessment link and submissions will appear here.</p>
      <Link className="admin-primary-button" to="/admin/assessments">Go to Assessments <Icon name="arrow" /></Link>
    </section> : null}

    {links.length > 0 ? <>
      <section className="admin-panel admin-monitor-overview-controls" aria-label="Monitor filters">
        <div className="admin-monitor-link-select">
          <label htmlFor="monitor-assessment-link">Assessment link</label>
          <select id="monitor-assessment-link" value={selectedLinkId} onChange={event => selectLink(event.target.value)}>
            {links.map(link => <option value={link.id} key={link.id}>{link.title}</option>)}
          </select>
        </div>
        <label className="admin-monitor-search" htmlFor="monitor-search">
          <Icon name="search" /><span className="visually-hidden">Search loaded assessments</span>
          <input id="monitor-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search learner or ID" />
        </label>
      </section>

      {selectedLink ? <>
        <section className="admin-overview-cards admin-monitor-cards" aria-label={`Assessment counts for ${selectedLink.title}`}>
          <MetricCard label="Submissions" value={String(selectedLink.submission_count)} icon="submissions" />
          <MetricCard label="Processing" value={String(selectedLink.in_progress_count)} icon="processing" />
          <MetricCard label="Completed" value={String(selectedLink.completed_count)} icon="completed" />
        </section>

        <section className="admin-panel admin-monitor-queue" aria-labelledby="monitor-queue-title">
          <div className="admin-results-heading">
            <div><h2 id="monitor-queue-title">{selectedLink.title}</h2><p>Recent submissions · {selectedLink.passage_id} · version {selectedLink.passage_version}</p></div>
            <div className="admin-results-filters" role="group" aria-label="Filter monitor submissions">
              {monitorFilters.map(option => {
                const count = option.value === 'all' ? selectedLink.submission_count
                  : option.value === 'processing' ? selectedLink.in_progress_count
                    : option.value === 'failed' ? selectedLink.failed_count : selectedLink.completed_count
                return <button key={option.value} type="button" aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}>{option.label} ({count})</button>
              })}
            </div>
          </div>
          <div className="admin-table-scroll">
            <table className="admin-table admin-monitor-table">
              <thead><tr><th>Student</th><th>Submitted</th><th>Status</th><th>Assessment</th></tr></thead>
              <tbody>
                {filteredItems.map(item => <tr key={item.id}>
                  <td><strong>{item.learner_reference}</strong></td>
                  <td>{formatDate(item.created_at)}</td>
                  <td><span className={`admin-status ${statusStyle(item.status)}`}><i />{statusName(item.status)}</span></td>
                  <td><Link className="admin-report-download" to={`/admin/monitor/${encodeURIComponent(item.id)}`} aria-label={`Open monitor for ${item.learner_reference}`}><Icon name="settings" /><span>Open monitor</span></Link></td>
                </tr>)}
                {!filteredItems.length ? <tr><td className="admin-table-message" colSpan={4}>{pageLoading ? 'Loading submissions…' : visiblePageError ? 'Submissions could not be loaded.' : items.length ? 'No loaded submissions match these filters.' : 'No submissions for this assessment link.'}</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="admin-results-footer">
            <span>{filteredItems.length} matching · {items.length} loaded</span>
            {visiblePageError ? <p className="admin-form-error" role="alert">{visiblePageError} <button className="admin-assessment-select" type="button" onClick={() => { setPageError(''); setPageAttempt(value => value + 1) }}>Retry</button></p> : null}
            {cursor ? <button className="admin-outline-button" type="button" disabled={pageLoading} onClick={loadMore}>{pageLoading ? 'Loading…' : 'Load more submissions'}</button> : null}
          </div>
        </section>
      </> : null}
    </> : null}
  </main>
}
