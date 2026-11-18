import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { getAssessmentReport, getAssessmentResultDetails, type AssessmentReport, type AssessmentResultDetails, type CenterSession } from './admin-api'
import { buildItemComparisons, comparisonStatusLabel, parseExpertReviewFile, type ExpertReviewRow, type ReadingComparison } from './expert-report-comparison'

type Props = {
  assessmentId: string
  learnerReference: string
  session: CenterSession
  updateSession: (session: CenterSession | null) => void
}

export function ExpertReportComparison({ assessmentId, learnerReference, session, updateSession }: Props) {
  const [report, setReport] = useState<AssessmentReport | null>(null)
  const [details, setDetails] = useState<AssessmentResultDetails | null>(null)
  const [reportError, setReportError] = useState('')
  const [reviewRows, setReviewRows] = useState<ExpertReviewRow[] | null>(null)
  const [reviewName, setReviewName] = useState('')
  const [reviewError, setReviewError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      getAssessmentReport(assessmentId, session, updateSession, controller.signal),
      getAssessmentResultDetails(assessmentId, session, updateSession, { includeUncertainties: true, signal: controller.signal }),
    ]).then(([savedReport, resultDetails]) => {
      if (controller.signal.aborted) return
      setReport(savedReport)
      setDetails(resultDetails)
      setReportError('')
    }).catch(cause => {
      if (!controller.signal.aborted) setReportError(cause instanceof Error ? cause.message : 'Saved report data could not be loaded.')
    })
    return () => controller.abort()
  }, [assessmentId, session, updateSession])

  const comparisons = useMemo(() => reviewRows && report && details
    ? buildItemComparisons(reviewRows, report.content.items, details.item_summaries)
    : [], [reviewRows, report, details])
  const totals = useMemo(() => comparisons.reduce((total, row) => {
    for (const reading of [row.reading1, row.reading2]) {
      total.exact += Number(reading.status === 'counts-match')
      total.comparable += Number(reading.status === 'counts-match' || reading.status === 'counts-differ')
    }
    return total
  }, { exact: 0, comparable: 0 }), [comparisons])
  const fileTotals = useMemo(() => (reviewRows ?? []).reduce((total, row) => {
    for (const label of [row.reading1, row.reading2]) {
      if (label === null) total.unreviewed += 1
      else total.labels += 1
    }
    return total
  }, { labels: 0, unreviewed: 0 }), [reviewRows])
  const fileMatchesLearner = reviewName && normalizedIdentity(reviewName.replace(/\.csv$/i, '')) === normalizedIdentity(learnerReference)

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    setReviewRows(null)
    setReviewName('')
    setReviewError('')
    if (!file) return
    try {
      const parsed = await parseExpertReviewFile(file)
      setReviewRows(parsed)
      setReviewName(file.name)
    } catch (cause) {
      setReviewError(cause instanceof Error ? cause.message : 'The reviewed CSV could not be read.')
    }
  }

  return <section className="admin-panel admin-expert-comparison" aria-label="Compare report with expert review">
    <header className="admin-panel-heading">
      <div><h2>Compare with expert review</h2>
        <p>Compare this saved report with reviewer labels from the matching student CSV.</p></div>
    </header>
    <p className="admin-expert-comparison-help">Choose a CSV from <code>fixtures/calibration_reports/by_student/</code>. Labels are read locally: <strong>1 = correct</strong>, <strong>0 = error</strong>, blank = not reviewed. The saved report is read-only; reviewer labels are not uploaded or saved.</p>
    <label className="admin-expert-comparison-upload">
      Reviewed student CSV
      <input type="file" accept=".csv,text/csv" onChange={event => void handleFileChange(event)} />
    </label>
    {reviewError ? <p className="admin-form-error" role="alert">{reviewError}</p> : null}
    {reportError ? <p className="admin-form-error" role="alert">{reportError}</p> : null}
    {!report && !reportError ? <p role="status">Loading saved report comparison data…</p> : null}
    {reviewRows && report && details ? <>
      <div className="admin-expert-comparison-summary" role="status">
        <strong>{reviewName}</strong>
        <span>{fileTotals.labels} reviewed labels across {comparisons.length} checks; {fileTotals.unreviewed} blank labels.</span>
        <span>{totals.comparable ? `${totals.exact} of ${totals.comparable} directly comparable reading/check counts match.` : 'No reading/check pairs have comparable coverage.'}</span>
      </div>
      {!fileMatchesLearner ? <p className="admin-result-details-notice">The CSV filename does not match learner reference “{learnerReference}”. Confirm you selected the right expert review before interpreting these results.</p> : null}
      <p className="admin-expert-comparison-caveat">A count comparison is marked directly comparable only when every CSV example is reviewed, the engine has the same example count, and its evidence has no uncertain examples. Matching totals do not show that the same individual examples were judged correctly. The report band remains the saved result and is not recalculated from these labels.</p>
      <div className="admin-table-scroll">
        <table className="admin-table admin-expert-comparison-table">
          <caption className="visually-hidden">Expert labels and saved engine evidence by item and reading</caption>
          <thead><tr><th scope="col">Item</th><th scope="col">Saved report</th><th scope="col">Expert R1</th><th scope="col">Engine R1</th><th scope="col">R1 comparison</th><th scope="col">Expert R2</th><th scope="col">Engine R2</th><th scope="col">R2 comparison</th></tr></thead>
          <tbody>{comparisons.map(row => <tr key={row.itemId}>
            <th scope="row">{row.itemId}. {row.itemLabel || `Item ${row.itemId}`}</th>
            <td>{row.reportItem?.status === 'SCORED' ? row.reportItem.band ?? 'Scored' : row.reportItem?.unscored_reason ? `Unscored · ${row.reportItem.unscored_reason}` : row.reportItem?.status ?? 'Not in report'}</td>
            <td>{formatExpert(row.reading1)}</td><td>{formatEngine(row.reading1)}</td><td>{comparisonStatusLabel(row.reading1.status)}</td>
            <td>{formatExpert(row.reading2)}</td><td>{formatEngine(row.reading2)}</td><td>{comparisonStatusLabel(row.reading2.status)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {!comparisons.length ? <p className="admin-monitor-empty">This CSV has no reviewed labels to compare.</p> : null}
    </> : null}
  </section>
}

function normalizedIdentity(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, '')
}

function formatExpert(reading: ReadingComparison): string {
  const { correct, errors, unreviewed, rowCount } = reading.expert
  return `${correct} correct · ${errors} error · ${unreviewed} not reviewed (${rowCount} examples)`
}

function formatEngine(reading: ReadingComparison): string {
  const engine = reading.engine
  if (!engine || !engine.details_available) return 'Per-reading details unavailable'
  return `${engine.correct_examples} correct · ${engine.error_examples} error · ${engine.uncertain_examples} uncertain (${engine.expected_examples} examples)`
}
