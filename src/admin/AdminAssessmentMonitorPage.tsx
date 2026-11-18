import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { getLinkedAssessment } from './admin-api'
import { AssessmentMonitor } from './AssessmentMonitor'
import { AssessmentRerunButton } from './AssessmentRerunButton'
import { AssessmentResultDetailsPanel } from './AssessmentResultDetails'
import { ExpertReportComparison } from './ExpertReportComparison'
import { useCenterAuth } from './center-auth-context'
import { formatDate, statusName, statusStyle } from './assessment-utils'

export function AdminAssessmentMonitorPage() {
  const { id } = useParams()
  const { session, updateSession } = useCenterAuth()
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getLinkedAssessment>> | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    if (!id || !session) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    async function load() {
      try {
        const value = await getLinkedAssessment(id!, session!, updateSession)
        if (!active) return
        setDetail(value)
        setError('')
        if (value.status === 'COMPLETED') setNotice('')
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Assessment could not be loaded.')
      } finally {
        if (active) timer = setTimeout(() => void load(), 5000)
      }
    }
    void load()
    return () => { active = false; clearTimeout(timer) }
  }, [id, session, updateSession, refresh])

  function handleRerunQueued() {
    setNotice('Scoring rerun queued from saved results. Report findings will return when it completes.')
    setDetail(current => current ? {
      ...current,
      status: 'UPLOADED',
      completed_at: null,
      failure_message: null,
    } : current)
    setRefresh(value => value + 1)
  }

  const current = detail?.id === id ? detail : null
  return <main className="admin-page admin-monitor-page admin-assessment-monitor-page">
    <div className="admin-monitor-page-nav"><Link className="admin-text-link" to="/admin/monitor">← Monitor queue</Link></div>
    <section className="admin-page-heading">
      <div><h1>Assessment monitor</h1><p>Inspect processing checkpoints, saved readings, and report findings. Status refreshes every five seconds.</p></div>
      <button type="button" className="admin-outline-button" onClick={() => setRefresh(value => value + 1)}>Refresh now</button>
    </section>
    {error && <p className="admin-error-banner" role="alert">{error}</p>}
    {!current && !error && <p role="status">Loading assessment…</p>}
    {current && session && <>
      <section className="admin-panel admin-monitor-summary" aria-label="Assessment summary">
        <div className="admin-monitor-summary-copy">
          <h2>{current.learner_reference}</h2>
          <p>{current.learner_email || 'No email recorded'} · Submitted {formatDate(current.created_at)}</p>
          <p className="admin-monitor-id">Assessment ID: {current.id}</p>
        </div>
        <div className="admin-monitor-summary-actions">
          <span className={`admin-status ${statusStyle(current.status)}`}><i />{statusName(current.status)}</span>
          <AssessmentRerunButton item={{ ...current, headline: [] }} session={session} updateSession={updateSession} onQueued={handleRerunQueued} />
        </div>
      </section>
      {notice ? <p className="admin-monitor-notice" role="status">{notice}</p> : null}
      <AssessmentMonitor key={`${current.id}-${current.status}`} expanded item={{ ...current, headline: [] }} detail={current} session={session} updateSession={updateSession} onQueued={() => setRefresh(value => value + 1)} />
      <section className="admin-panel admin-monitor-readings">
        <div className="admin-panel-heading"><div><h2>Saved readings</h2><p>Recording clips available for processing</p></div></div>
        {current.readings.length ? <ul>{current.readings.map(reading => <li key={reading.reading_index}>Reading {reading.reading_index} <span>{(reading.duration_ms / 1000).toFixed(1)} seconds</span></li>)}</ul> : <p className="admin-monitor-empty">No reading clips have been saved yet.</p>}
      </section>
      {current.status === 'COMPLETED' ? <>
        <ExpertReportComparison key={`expert-${current.id}`} assessmentId={current.id} learnerReference={current.learner_reference} session={session} updateSession={updateSession} />
        <AssessmentResultDetailsPanel key={current.id} assessmentId={current.id} learnerReference={current.learner_reference} session={session} updateSession={updateSession} />
      </> : <section className="admin-panel admin-monitor-report-unavailable" aria-live="polite">
        <h2>Report findings</h2>
        <p>{current.status === 'FAILED' ? 'A completed report is not available for this assessment.' : 'Findings are available after processing completes.'}</p>
      </section>}
    </>}
  </main>
}
