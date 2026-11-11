import { useState } from 'react'
import { retryAssessment, type AssessmentListItem, type CenterSession, getLinkedAssessment } from './admin-api'
import { formatDate, statusName, statusStyle } from './assessment-utils'

type Detail = Awaited<ReturnType<typeof getLinkedAssessment>>

export function AssessmentMonitor({ item, detail, session, updateSession, onQueued, expanded = false }: {
  expanded?: boolean
  item: AssessmentListItem
  detail: Detail | null
  session: CenterSession
  updateSession: (session: CenterSession | null) => void
  onQueued: () => void
}) {
  const [open, setOpen] = useState(expanded)
  const [busy, setBusy] = useState(false)
  const [queued, setQueued] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function retry() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await retryAssessment(item.id, session, updateSession)
      setQueued(true)
      onQueued()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not retry processing.')
    } finally {
      setBusy(false)
    }
  }

  return <div>
    {!expanded && <button className="admin-outline-button" type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Close monitor' : 'Monitor assessment'}</button>}
    {open && <section className="admin-panel admin-monitor-steps" aria-label={`Assessment monitor for ${item.learner_reference}`}>
      <div className="admin-monitor-steps-heading"><div className="admin-panel-heading"><div><h2>Processing checkpoints</h2><p>Review progress and troubleshoot failed steps.</p></div></div>
        {item.status === 'FAILED' && <button className="admin-primary-button" type="button" disabled={busy || queued} onClick={() => void retry()}>{busy ? 'Queueing…' : queued ? 'Retry queued' : 'Retry assessment'}</button>}
      </div>
      {queued && <p className="admin-monitor-notice" role="status">Retry queued. Processing will resume from saved results.</p>}
      {error && <p className="admin-form-error" role="alert">{error}</p>}
      {detail?.failure_message && !queued && <p className="admin-error-banner" role="alert">{detail.failure_message}</p>}
      <p className="admin-monitor-help">Retries resume unfinished steps using saved clips and matching results. Completed readings are skipped and input validation runs again.</p>
      {detail?.checkpoints?.length ? <ol className="admin-checkpoint-list">{detail.checkpoints.map(checkpoint => <li key={`${checkpoint.step}-${checkpoint.reading_index}`}>
        <div className="admin-checkpoint-heading"><strong>[step-{checkpoint.step}]: {checkpoint.label}</strong><span className={`admin-status ${statusStyle(checkpoint.status)}`}><i />{statusName(checkpoint.status)}</span></div>
        <p>{checkpoint.reading_index > 0 ? `Reading ${checkpoint.reading_index} · ` : ''}Executions: {checkpoint.executions}</p>
        <p>Started: {formatDate(checkpoint.started_at)}{checkpoint.completed_at ? ` · Finished: ${formatDate(checkpoint.completed_at)}` : ''}</p>
        {checkpoint.error_summary && <p className="admin-checkpoint-error" role="alert">{checkpoint.error_summary}</p>}
        {checkpoint.status === 'FAILED' && checkpoint.retryable === false && <p className="admin-checkpoint-error">Automatic retry is disabled for this error. Repair the recording or worker configuration before retrying.</p>}
      </li>)}</ol> : <p className="admin-monitor-empty">No step checkpoints have been recorded. Assessments processed before checkpoint support do not have historical step details.</p>}
    </section>}
  </div>
}
