import { useEffect, useId, useRef, useState } from 'react'
import { getAssessmentResultDetails, type AssessmentResultDetails, type CenterSession } from './admin-api'
import { Icon } from './AdminPrimitives'

type Props = {
  assessmentId: string
  learnerReference: string
  session: CenterSession
  updateSession: (session: CenterSession | null) => void
  onClose: () => void
}

export function AssessmentResultDetailsDialog({ assessmentId, learnerReference, session, updateSession, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const [readingIndex, setReadingIndex] = useState<number | undefined>()

  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [])

  function close() {
    ref.current?.close()
    onClose()
  }

  return (
    <dialog ref={ref} className="admin-result-details-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={event => { event.preventDefault(); close() }}
      onClick={event => { if (event.target === event.currentTarget) close() }}>
      <header className="admin-result-details-heading">
        <div><h2 id={titleId}>Result details · {learnerReference}</h2>
          <p id={descriptionId}>Each stored detector error, separated by reading. Missing or ambiguous evidence is not labeled as an error. Some checks may remain not assessed in the report.</p></div>
        <button className="admin-result-details-close" type="button" aria-label="Close result details" onClick={close} autoFocus><Icon name="close" /></button>
      </header>
      <ResultErrorsTable key={readingIndex ?? 'all'} assessmentId={assessmentId} session={session} updateSession={updateSession}
        readingIndex={readingIndex} onReadingChange={setReadingIndex} />
    </dialog>
  )
}

function ResultErrorsTable({ assessmentId, session, updateSession, readingIndex, onReadingChange }: {
  assessmentId: string
  session: CenterSession
  updateSession: (session: CenterSession | null) => void
  readingIndex: number | undefined
  onReadingChange: (index: number | undefined) => void
}) {
  const [data, setData] = useState<AssessmentResultDetails | null>(null)
  const [cursor, setCursor] = useState<string>()
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    getAssessmentResultDetails(assessmentId, session, updateSession, { readingIndex, cursor, signal: controller.signal })
      .then(page => {
        if (controller.signal.aborted) return
        setData(current => {
          if (!cursor || !current) return page
          const key = (row: AssessmentResultDetails['errors'][number]) => `${row.reading_index}:${row.item_id}:${row.target_occurrence_id}`
          const incoming = new Set(page.errors.map(key))
          return { ...page, errors: [...current.errors.filter(row => !incoming.has(key(row))), ...page.errors] }
        })
      })
      .catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Result details could not be loaded.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [assessmentId, session, updateSession, readingIndex, cursor, attempt])

  const readings = data?.readings.filter(reading => readingIndex === undefined || reading.reading_index === readingIndex) ?? []
  const available = readings.some(reading => reading.details_available)

  return (
    <>
      {data ? <div className="admin-result-details-filters" role="group" aria-label="Filter errors by reading">
        <button className="admin-outline-button" type="button" aria-pressed={readingIndex === undefined} onClick={() => onReadingChange(undefined)}>All readings</button>
        {data.readings.map(reading => <button className="admin-outline-button" type="button" key={reading.reading_index}
          aria-pressed={readingIndex === reading.reading_index} onClick={() => onReadingChange(reading.reading_index)}>Reading {reading.reading_index}</button>)}
      </div> : null}
      {readings.filter(reading => !reading.details_available).map(reading => <p className="admin-result-details-notice" key={reading.reading_index}>
        Reading {reading.reading_index}: detailed detector evidence is unavailable for this historical result. This does not mean the reading had no errors.
      </p>)}
      <div className="admin-table-scroll admin-result-details-scroll" aria-busy={loading}>
        <table className="admin-table admin-error-details-table">
          <caption className="visually-hidden">Persisted errors by reading</caption>
          <thead><tr><th scope="col">Reading</th><th scope="col">Check</th><th scope="col">Example / location</th><th scope="col">Expected</th><th scope="col">Observed</th><th scope="col">Error detail</th></tr></thead>
          <tbody>
            {data?.errors.map(row => <tr key={`${row.reading_index}:${row.item_id}:${row.target_occurrence_id}`}>
              <td>Reading {row.reading_index}</td>
              <td><strong>{row.item_id}. {row.item_label}</strong>{!row.scored_in_report ? <small>Not assessed in report</small> : null}</td>
              <td>{row.example || 'Not recorded'}{row.location ? <small>{row.location}</small> : null}<small className="admin-result-target-id">{row.target_occurrence_id}</small></td>
              <td>{row.expected || 'Not recorded'}</td><td>{row.observed || 'Not recorded'}</td>
              <td title={row.reason_code ?? undefined}>{row.reason}</td>
            </tr>)}
            {!data?.errors.length ? <tr><td colSpan={6} className="admin-table-message">
              {loading ? 'Loading result details…' : error ? 'Result details could not be loaded.' : available ? 'No stored detector errors in the available readings.' : 'Detailed results are unavailable.'}
            </td></tr> : null}
          </tbody>
        </table>
      </div>
      <footer className="admin-result-details-footer">
        <p>“Not recorded” means the detector did not store that detail. No scores or results are recalculated here.</p>
        {error ? <p className="admin-form-error" role="alert">{error} <button className="admin-outline-button" type="button" onClick={() => { setLoading(true); setError(''); setAttempt(value => value + 1) }}>Try again</button></p> : null}
        {data?.next_cursor && !error ? <button className="admin-outline-button" type="button" disabled={loading} onClick={() => { setLoading(true); setError(''); setCursor(data.next_cursor || undefined) }}>{loading ? 'Loading…' : 'Load more errors'}</button> : null}
      </footer>
    </>
  )
}
