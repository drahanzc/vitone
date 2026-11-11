import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { getLinkedAssessment } from './admin-api'
import { AssessmentMonitor } from './AssessmentMonitor'
import { useCenterAuth } from './center-auth-context'
import { formatDate, statusName, statusStyle } from './assessment-utils'

export function AdminAssessmentMonitorPage() {
  const { id } = useParams()
  const { session, updateSession } = useCenterAuth()
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getLinkedAssessment>> | null>(null)
  const [error, setError] = useState('')
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
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Assessment could not be loaded.')
      } finally {
        if (active) timer = setTimeout(() => void load(), 5000)
      }
    }
    void load()
    return () => { active = false; clearTimeout(timer) }
  }, [id, session, updateSession, refresh])

  const current = detail?.id === id ? detail : null
  return <main className="admin-page admin-monitor-page">
    <Link className="admin-text-link" to="/admin/assessments">← Back to assessments</Link>
    <section className="admin-page-heading"><div><h1>Monitor / Troubleshoot</h1><p>Observe assessment processing. Refreshes every five seconds.</p></div>
      <button type="button" className="admin-outline-button" onClick={() => setRefresh(value => value + 1)}>Refresh now</button>
    </section>
    {error && <p className="admin-error-banner" role="alert">{error}</p>}
    {!current && !error && <p role="status">Loading assessment…</p>}
    {current && session && <>
      <section className="admin-panel admin-monitor-summary" aria-label="Assessment summary">
        <div><h2>{current.learner_reference}</h2><p>Submitted {formatDate(current.created_at)}</p><p className="admin-monitor-id">Assessment ID: {current.id}</p></div>
        <span className={`admin-status ${statusStyle(current.status)}`}><i />{statusName(current.status)}</span>
      </section>
      <AssessmentMonitor key={`${current.id}-${current.status}`} expanded item={{ ...current, headline: [] }} detail={current} session={session} updateSession={updateSession} onQueued={() => setRefresh(value => value + 1)} />
      <section className="admin-panel admin-monitor-readings">
        <div className="admin-panel-heading"><div><h2>Saved readings</h2><p>Recording clips available for processing</p></div></div>
        {current.readings.length ? <ul>{current.readings.map(reading => <li key={reading.reading_index}>Reading {reading.reading_index} <span>{(reading.duration_ms / 1000).toFixed(1)} seconds</span></li>)}</ul> : <p className="admin-monitor-empty">No reading clips have been saved yet.</p>}
      </section>
    </>}
  </main>
}
