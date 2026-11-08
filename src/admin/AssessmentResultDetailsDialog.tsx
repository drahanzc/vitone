import { useEffect, useId, useRef, useState } from 'react'
import { getAssessmentResultDetails, type AssessmentResultDetails, type CenterSession } from './admin-api'
import { Icon } from './AdminPrimitives'
import { mergeResultDetailsPage, resultDetailKey as rowKey, resultFindingLocation } from './result-details-utils'

type Props = {
  assessmentId: string
  learnerReference: string
  session: CenterSession
  updateSession: (session: CenterSession | null) => void
  onClose: () => void
}

type ErrorDetail = AssessmentResultDetails['errors'][number]
type UncertaintyDetail = AssessmentResultDetails['uncertainties'][number]
type Summary = AssessmentResultDetails['item_summaries'][number]
type NonPerfectItem = AssessmentResultDetails['non_perfect_items'][number]
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
          <p id={descriptionId}>Confirmed detector errors and uncertain evidence are shown separately. For percentage checks, uncertain examples can lower a band without being pronunciation errors.</p></div>
        <button className="admin-result-details-close" type="button" aria-label="Close result details" onClick={close} autoFocus><Icon name="close" /></button>
      </header>
      <ResultFindings key={`${assessmentId}:${readingIndex ?? 'all'}`} assessmentId={assessmentId} session={session} updateSession={updateSession}
        readingIndex={readingIndex} onReadingChange={setReadingIndex} />
    </dialog>
  )
}

function ResultFindings({ assessmentId, session, updateSession, readingIndex, onReadingChange }: {
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
    getAssessmentResultDetails(assessmentId, session, updateSession, { readingIndex, cursor, includeUncertainties: true, signal: controller.signal })
      .then(page => {
        if (controller.signal.aborted) return
        setData(current => cursor ? mergeResultDetailsPage(current, page) : page)
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
      {data ? <div className="admin-result-details-filters" role="group" aria-label="Filter findings by reading">
        <button className="admin-outline-button" type="button" aria-pressed={readingIndex === undefined} onClick={() => onReadingChange(undefined)}>All readings</button>
        {data.readings.map(reading => <button className="admin-outline-button" type="button" key={reading.reading_index}
          aria-pressed={readingIndex === reading.reading_index} onClick={() => onReadingChange(reading.reading_index)}>Reading {reading.reading_index}</button>)}
      </div> : null}
      {readings.filter(reading => !reading.details_available).map(reading => <p className="admin-result-details-notice" key={reading.reading_index}>
        Reading {reading.reading_index}: detailed detector evidence is unavailable for this historical result. This does not mean the reading had no errors.
      </p>)}
      <div className="admin-result-details-scroll" aria-busy={loading}>
        {data ? <ResultEvidenceSummary items={data.non_perfect_items} summaries={data.item_summaries ?? []} errors={data.errors}
          hasMoreFindings={Boolean(data.next_cursor)} readingIndex={readingIndex} /> : null}
        <ResultFindingsTable errors={data?.errors ?? []} uncertainties={data?.uncertainties ?? []} readingIndex={readingIndex}
          loading={loading} error={error} available={available} />
      </div>
      <footer className="admin-result-details-footer">
        <p>Reference positions are one-based: sentence and word within that sentence, plus word in the full passage. Reference sentences follow the engine passage, not workbook human-line numbers. Recognized-word positions are labelled separately. Counts describe stored examples, not individual phonemes. “Not recorded” means that detail was not stored. Missing evidence can also count as uncertain. Saved bands are not recalculated here.</p>
        {error ? <p className="admin-form-error" role="alert">{error} <button className="admin-outline-button" type="button" onClick={() => { setLoading(true); setError(''); setCursor(undefined); setData(null); setAttempt(value => value + 1) }}>Reload details</button></p> : null}
        {data?.next_cursor && !error ? <button className="admin-outline-button" type="button" disabled={loading} onClick={() => { setLoading(true); setError(''); setCursor(data.next_cursor || undefined) }}>{loading ? 'Loading…' : 'Load more findings'}</button> : null}
      </footer>
    </>
  )
}

/** Counts all selected readings, independently of how many detail pages are loaded. */
export function ResultEvidenceSummary({ items, summaries, errors = [], hasMoreFindings = false, readingIndex }: {
  items?: NonPerfectItem[]; summaries: Summary[]; errors?: ErrorDetail[]; hasMoreFindings?: boolean; readingIndex?: number
}) {
  const grouped = new Map<number, Summary>()
  for (const summary of summaries) {
    if (readingIndex !== undefined && summary.reading_index !== readingIndex) continue
    const current = grouped.get(summary.item_id)
    grouped.set(summary.item_id, current ? {
      ...current,
      details_available: current.details_available && summary.details_available,
      expected_examples: current.expected_examples + summary.expected_examples,
      correct_examples: current.correct_examples + summary.correct_examples,
      error_examples: current.error_examples + summary.error_examples,
      uncertain_examples: current.uncertain_examples + summary.uncertain_examples,
      uncertainty_affects_band: current.uncertainty_affects_band || summary.uncertainty_affects_band,
    } : { ...summary })
  }
  // The saved list includes checks without percentage summaries (e.g. incidence
  // checks), and must not disappear when the selected reading has no findings.
  const tracked = (items ?? [...grouped.values()])
    .filter(row => row.band && row.band !== 'Perfect').sort((a, b) => a.item_id - b.item_id)
  return <section className="admin-evidence-summary" aria-label="Scored items below Perfect">
    <h3>Scored items below Perfect{items ? ` (${tracked.length})` : ''}</h3>
    <p>Perfect and unscored checks are omitted. Saved bands cover all readings, even when you filter the evidence below. For percentage checks, uncertain examples remain in the denominator; they are not confirmed pronunciation errors.</p>
    {!items ? <p className="admin-result-details-notice">Only checks with available example summaries are listed by this older server; the list may be incomplete.</p> : null}
    {!tracked.length ? <p>{items ? 'No scored items below Perfect.' : 'No below-Perfect checks in the available summaries.'}</p> : null}
    <div className="admin-table-scroll"><table className="admin-table admin-evidence-summary-table">
      <caption className="visually-hidden">Coverage for {readingIndex === undefined ? 'all readings' : `Reading ${readingIndex}`}; saved bands are unchanged</caption>
      <thead><tr><th scope="col">Check</th><th scope="col">Saved band (all readings)</th><th scope="col">Counted as correct</th><th scope="col">Error examples</th><th scope="col">Uncertain examples</th><th scope="col">Confirmed error words / positions</th><th scope="col">Explanation</th></tr></thead>
      <tbody>{tracked.map(item => {
        const row = grouped.get(item.item_id)
        const locations = errors.filter(error => error.item_id === item.item_id
          && (readingIndex === undefined || error.reading_index === readingIndex))
        return <tr key={item.item_id}>
          <td><strong>{item.item_id}. {item.item_label}</strong></td><td>{item.band}</td>
          <td>{row?.details_available ? `${row.correct_examples} / ${row.expected_examples}` : 'Coverage unavailable'}</td>
          <td>{row?.details_available ? row.error_examples : '—'}</td><td>{row?.details_available ? row.uncertain_examples : '—'}</td>
          <td>{locations.length ? <ul>{locations.map(error => <li key={rowKey(error)}>
            <strong>{error.example || 'Word / span not localized'}</strong>
            <small>Reading {error.reading_index} · {resultFindingLocation(error)}</small>
          </li>)}</ul> : row?.details_available && row.error_examples === 0
            ? 'No confirmed error examples in selected readings.' : 'No error locations loaded.'}
            {hasMoreFindings ? <small>Locations reflect loaded findings only. Load more findings to see remaining occurrences.</small> : null}</td>
          <td>{!row ? 'No percentage-example summary is available for this check. Review the findings below.'
            : !row.details_available ? 'Some selected readings lack detailed evidence; counts cannot explain the saved band reliably.'
            : row.uncertainty_affects_band ? row.error_examples === 0
              ? 'No confirmed pronunciation errors, but some examples could not be confirmed. This reduces the percentage.'
              : 'Both error examples and uncertain examples reduce the percentage.'
            : row.error_examples > 0 ? 'Confirmed pronunciation errors were detected in the selected readings.'
            : row.uncertain_examples > 0 ? 'Stored evidence contains uncertainty. The saved band has not been recalculated.'
            : 'All selected examples were counted as correct. The saved all-readings band has not been recalculated.'}</td>
        </tr>
      })}</tbody>
    </table></div>
  </section>
}

export function ResultFindingsTable({ errors, uncertainties, readingIndex, loading = false, error = '', available = true }: {
  errors: ErrorDetail[]
  uncertainties: UncertaintyDetail[]
  readingIndex?: number
  loading?: boolean
  error?: string
  available?: boolean
}) {
  const rows = [...errors.map(row => ({ ...row, outcome: 'ERROR' as const })), ...uncertainties]
    .filter(row => readingIndex === undefined || row.reading_index === readingIndex)
    .sort((a, b) => a.reading_index - b.reading_index || a.item_id - b.item_id || a.target_occurrence_id.localeCompare(b.target_occurrence_id))
  const label = (outcome: typeof rows[number]['outcome']) => outcome === 'ERROR' ? 'Confirmed error'
    : outcome === 'AMBIGUOUS' ? 'Uncertain · conflicting evidence'
    : outcome === 'UNASSESSABLE' ? 'Uncertain · insufficient evidence' : 'Not supported'
  return <div className="admin-table-scroll"><table className="admin-table admin-error-details-table">
    <caption className="visually-hidden">Persisted errors and uncertainty by reading</caption>
    <thead><tr><th scope="col">Reading</th><th scope="col">Check</th><th scope="col">Outcome</th><th scope="col">Reference word / span</th><th scope="col">Position / context</th><th scope="col">Expected</th><th scope="col">Observed</th><th scope="col">Finding detail</th></tr></thead>
    <tbody>
      {rows.map(row => <tr key={rowKey(row)}>
        <td>Reading {row.reading_index}</td>
        <td><strong>{row.item_id}. {row.item_label}</strong>{!row.scored_in_report ? <small>Check not scored in saved report</small> : null}</td>
        <td><span className={`admin-finding-outcome ${row.outcome === 'ERROR' ? 'admin-finding-error' : 'admin-finding-uncertain'}`}>{label(row.outcome)}</span></td>
        <td><strong>{row.example || 'Word / span not localized'}</strong></td>
        <td>{resultFindingLocation(row)}{row.context && row.context !== row.example ? <small>Context: {row.context}</small> : null}
          <small className="admin-result-target-id">{row.target_occurrence_id}</small></td>
        <td>{row.expected || 'Not recorded'}</td><td>{row.observed || 'Not recorded'}</td>
        <td title={row.reason_code ?? undefined}>{row.reason}</td>
      </tr>)}
      {!rows.length ? <tr><td colSpan={8} className="admin-table-message">
        {loading ? 'Loading result details…' : error ? 'Result details could not be loaded.' : available
          ? 'No stored error or uncertainty rows on this page. This does not establish complete correctness; check coverage above and any remaining pages.'
          : 'Detailed results are unavailable.'}
      </td></tr> : null}
    </tbody>
  </table></div>
}
