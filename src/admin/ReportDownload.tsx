import { useState } from 'react'
import { getCenterReportPdf, type AssessmentListItem, type CenterSession } from './admin-api'
import { AssessmentResultDetailsDialog } from './AssessmentResultDetailsDialog'
import { openPdfPreview, type PdfPreview } from './pdf-preview'
import { Icon } from './AdminPrimitives'

export function ReportDownload({ item, session, updateSession }: {
  item: AssessmentListItem
  session: CenterSession
  updateSession: (session: CenterSession | null) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [viewing, setViewing] = useState(false)

  async function viewPdf() {
    setError('')
    let preview: PdfPreview | undefined
    try {
      preview = openPdfPreview(`Report · ${item.learner_reference}`)
      setViewing(true)
      const pdf = await getCenterReportPdf(item.id, session, updateSession)
      preview.show(pdf)
    } catch (cause) {
      preview?.close()
      setError(cause instanceof Error ? cause.message : 'The PDF could not be opened.')
    } finally {
      setViewing(false)
    }
  }

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
      <button className="admin-report-download" type="button" disabled={viewing} onClick={() => void viewPdf()} aria-label={`View PDF report for ${item.learner_reference} (opens in a new tab)`}>
        <Icon name="eye" /><span>{viewing ? 'Opening…' : 'View PDF'}</span>
      </button>
      <button className="admin-report-download" type="button" onClick={() => setDetailsOpen(true)} aria-label={`View result details for ${item.learner_reference}`}>
        <Icon name="eye" /><span>Details</span>
      </button>
      {error ? <span className="admin-report-error" role="alert">{error}</span> : null}
      {detailsOpen ? <AssessmentResultDetailsDialog assessmentId={item.id} learnerReference={item.learner_reference}
        session={session} updateSession={updateSession} onClose={() => setDetailsOpen(false)} /> : null}
    </div>
  )
}
