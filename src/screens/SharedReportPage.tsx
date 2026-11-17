import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { ApiError, getPublicSharedReportPdf } from '../student-api'

type ReportFailure = { kind: 'invalid' | 'temporary' | 'other'; message: string }

export function SharedReportPage() {
  const { token = '' } = useParams()
  return <SharedReportReader key={token} token={token} />
}

function SharedReportReader({ token }: { token: string }) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [failure, setFailure] = useState<ReportFailure | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const previousTitle = document.title
    const robotsMeta = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
    const createdMeta = robotsMeta === null
    const meta = robotsMeta || document.createElement('meta')
    const previousRobots = meta.content
    if (createdMeta) {
      meta.name = 'robots'
      document.head.appendChild(meta)
    }
    meta.content = 'noindex, nofollow, noarchive'
    document.title = 'Shared pronunciation report'
    return () => {
      document.title = previousTitle
      if (createdMeta) meta.remove()
      else meta.content = previousRobots
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    let objectUrl: string | null = null

    getPublicSharedReportPdf(token, controller.signal)
      .then(pdf => {
        if (!active || controller.signal.aborted) return
        if (pdf.type !== 'application/pdf') throw new Error('The server did not return a PDF report.')
        objectUrl = URL.createObjectURL(pdf)
        setPdfUrl(objectUrl)
      })
      .catch(cause => {
        if (!active || controller.signal.aborted) return
        if (cause instanceof ApiError && cause.status === 404) {
          setFailure({ kind: 'invalid', message: 'This shared report link may have been revoked or may be incorrect.' })
        } else if (cause instanceof ApiError && cause.status === 503) {
          setFailure({ kind: 'temporary', message: 'The report PDF is temporarily unavailable. Please try again later.' })
        } else {
          setFailure({ kind: 'other', message: 'The report could not be opened. Please try again later.' })
        }
      })

    return () => {
      active = false
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [token, attempt])

  if (failure) {
    return <SharedReportUnavailable
      kind={failure.kind}
      message={failure.message}
      onRetry={failure.kind === 'temporary' ? () => {
        setFailure(null)
        setAttempt(value => value + 1)
      } : undefined}
    />
  }
  if (!pdfUrl) {
    return <main className="shared-report-status" role="status"><div className="shared-report-status-card"><span className="eyebrow">Shared pronunciation report</span><h1>Opening report…</h1><p>The PDF is loading.</p></div></main>
  }

  return <SharedReportPdfViewer url={pdfUrl} />
}

export function SharedReportPdfViewer({ url }: { url: string }) {
  return <main className="shared-report-viewer">
    <iframe className="shared-report-pdf" src={url} title="Shared pronunciation report" />
  </main>
}

export function SharedReportUnavailable({ kind, message, onRetry }: {
  kind: ReportFailure['kind']
  message: string
  onRetry?: () => void
}) {
  const invalid = kind === 'invalid'
  return <main className="shared-report-status">
    <section className="shared-report-status-card" aria-labelledby="shared-report-unavailable-title">
      <span className="eyebrow">Shared pronunciation report</span>
      <h1 id="shared-report-unavailable-title">{invalid ? 'This report link is unavailable' : 'We couldn’t open this report'}</h1>
      <p role="alert">{message}</p>
      {invalid ? <p>Ask the person who shared it to check that the link is current.</p> : null}
      {onRetry ? <button className="primary-button" type="button" onClick={onRetry}>Try again</button> : null}
    </section>
  </main>
}
