import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { AssessmentListItem, CenterSession, ReportShareLink } from './admin-api'
import { createAssessmentReportShare, getAssessmentReportShare, revokeAssessmentReportShare } from './admin-api'
import { getPublicSharedReportPdf } from '../student-api'

type ConfirmAction = 'replace' | 'revoke' | null

export function ReportSharingButton({ item, session, updateSession }: {
  item: AssessmentListItem
  session: CenterSession
  updateSession: (session: CenterSession | null) => void
}) {
  const [open, setOpen] = useState(false)

  return <>
    <button className="admin-report-download" type="button" onClick={() => setOpen(true)} aria-label={`Share report for ${item.learner_reference}`}>
      <span aria-hidden="true">↗</span><span>Share Report</span>
    </button>
    {open ? <ReportSharingDialog key={item.id} item={item} session={session} updateSession={updateSession} onClose={() => setOpen(false)} /> : null}
  </>
}

function formatShareDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

export function ReportShareSummary({ share, learnerReference, canCreate }: {
  share: ReportShareLink | null
  learnerReference: string
  canCreate: boolean
}) {
  return share ? <div className="report-share-summary-copy">
    <p>Anyone with this link can view {learnerReference}’s name and results, and download the PDF. The report content updates after each successful assessment rerun; the link stays the same.</p>
    <p className="report-share-date">Link created {formatShareDate(share.created_at)} · Report generated {formatShareDate(share.report_generated_at)}</p>
  </div> : <p>Create a read-only link for this completed report. Anyone with the link can view the learner’s name and results, and download the PDF. The report content updates after each successful assessment rerun.{canCreate ? '' : ' A completed report is required before a share link can be created.'}</p>
}

function ReportSharingDialog({ item, session, updateSession, onClose }: {
  item: AssessmentListItem
  session: CenterSession
  updateSession: (session: CenterSession | null) => void
  onClose: () => void
}) {
  const [share, setShare] = useState<ReportShareLink | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<ConfirmAction | 'create' | 'download' | null>(null)
  const [confirm, setConfirm] = useState<ConfirmAction>(null)
  const [error, setError] = useState('')
  const [copyMessage, setCopyMessage] = useState('')
  const id = useId().replace(/:/g, '')
  const fieldRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const mountedRef = useRef(false)
  const sessionRef = useRef<CenterSession | null>(session)
  const statusControllerRef = useRef<AbortController | null>(null)
  const statusGenerationRef = useRef(0)
  const actionControllerRef = useRef<AbortController | null>(null)
  const operationInFlightRef = useRef(false)
  const canCreate = item.status === 'COMPLETED'
  const titleId = `report-share-title-${id}`
  const urlId = `report-share-url-${id}`
  const confirmTitleId = `report-share-confirm-title-${id}`
  const confirmCopyId = `report-share-confirm-copy-${id}`
  useLayoutEffect(() => { sessionRef.current = session }, [session])

  const updateSessionAndRef = useCallback((next: CenterSession | null) => {
    sessionRef.current = next
    updateSession(next)
  }, [updateSession])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      statusControllerRef.current?.abort()
      actionControllerRef.current?.abort()
      statusGenerationRef.current += 1
    }
  }, [])

  useEffect(() => {
    if (operationInFlightRef.current) return
    const generation = ++statusGenerationRef.current
    statusControllerRef.current?.abort()
    const controller = new AbortController()
    statusControllerRef.current = controller
    let active = true
    const isCurrent = () => active && mountedRef.current && !controller.signal.aborted
      && generation === statusGenerationRef.current && statusControllerRef.current === controller
    setLoading(true)
    setError('')
    const currentSession = sessionRef.current
    if (!currentSession) {
      setError('Your center session has expired. Sign in again to manage this share link.')
      setLoading(false)
      return () => { active = false; controller.abort() }
    }
    getAssessmentReportShare(item.id, currentSession, updateSessionAndRef, controller.signal)
      .then(state => { if (isCurrent()) setShare(state.share) })
      .catch(cause => {
        if (isCurrent()) setError(cause instanceof Error ? cause.message : 'The share link could not be loaded.')
      })
      .finally(() => { if (isCurrent()) setLoading(false) })
    return () => {
      active = false
      if (generation === statusGenerationRef.current) statusGenerationRef.current += 1
      if (statusControllerRef.current === controller) statusControllerRef.current = null
      controller.abort()
    }
  }, [item.id, session, updateSessionAndRef])

  async function reloadShareStatus(uncertainAction = false) {
    const generation = ++statusGenerationRef.current
    const controller = new AbortController()
    statusControllerRef.current?.abort()
    statusControllerRef.current = controller
    setLoading(true)
    setShare(null)
    setError('')
    setCopyMessage('')
    const currentSession = sessionRef.current
    const isCurrent = () => mountedRef.current && !controller.signal.aborted
      && generation === statusGenerationRef.current && statusControllerRef.current === controller
    if (!currentSession) {
      setLoading(false)
      setError('Your center session has expired. Sign in again to manage this share link.')
      return
    }
    try {
      const state = await getAssessmentReportShare(item.id, currentSession, updateSessionAndRef, controller.signal)
      if (!isCurrent()) return
      setShare(state.share)
      if (uncertainAction) setCopyMessage('The action result was uncertain. The current share status has been refreshed.')
    } catch (cause) {
      if (!isCurrent()) return
      setShare(null)
      setError(uncertainAction
        ? 'The action result could not be confirmed. Reload the current share status before trying again.'
        : cause instanceof Error ? cause.message : 'The share link could not be loaded.')
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [])

  function closeDialog() {
    dialogRef.current?.close()
    onClose()
  }

  function invalidateStatusRequests() {
    statusGenerationRef.current += 1
    statusControllerRef.current?.abort()
    statusControllerRef.current = null
  }

  async function createOrReplace() {
    if (operationInFlightRef.current) return
    operationInFlightRef.current = true
    invalidateStatusRequests()
    const controller = new AbortController()
    actionControllerRef.current?.abort()
    actionControllerRef.current = controller
    setBusy(confirm === 'replace' ? 'replace' : 'create')
    setError('')
    setCopyMessage('')
    try {
      const currentSession = sessionRef.current
      if (!currentSession) throw new Error('Your center session has expired. Sign in again to manage this share link.')
      const created = await createAssessmentReportShare(item.id, currentSession, updateSessionAndRef, controller.signal)
      if (!mountedRef.current || controller.signal.aborted) return
      setShare(created)
      setConfirm(null)
    } catch {
      if (!mountedRef.current || controller.signal.aborted) return
      setConfirm(null)
      await reloadShareStatus(true)
    } finally {
      operationInFlightRef.current = false
      if (mountedRef.current) setBusy(null)
    }
  }

  async function revoke() {
    if (operationInFlightRef.current) return
    operationInFlightRef.current = true
    invalidateStatusRequests()
    const controller = new AbortController()
    actionControllerRef.current?.abort()
    actionControllerRef.current = controller
    setBusy('revoke')
    setError('')
    try {
      const currentSession = sessionRef.current
      if (!currentSession) throw new Error('Your center session has expired. Sign in again to manage this share link.')
      await revokeAssessmentReportShare(item.id, currentSession, updateSessionAndRef, controller.signal)
      if (!mountedRef.current || controller.signal.aborted) return
      setShare(null)
      setConfirm(null)
      setCopyMessage('The share link was revoked.')
    } catch {
      if (!mountedRef.current || controller.signal.aborted) return
      setConfirm(null)
      await reloadShareStatus(true)
    } finally {
      operationInFlightRef.current = false
      if (mountedRef.current) setBusy(null)
    }
  }

  async function copyLink() {
    if (!share || operationInFlightRef.current) return
    operationInFlightRef.current = true
    setError('')
    setCopyMessage('')
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.')
      await navigator.clipboard.writeText(share.share_url)
      if (mountedRef.current) setCopyMessage('Link copied.')
    } catch {
      if (!mountedRef.current) return
      fieldRef.current?.focus()
      fieldRef.current?.select()
      try {
        if (document.execCommand('copy')) {
          setCopyMessage('Link copied.')
          return
        }
      } catch {
        // Keep the selected URL available for manual copying.
      }
      setCopyMessage('The link is selected. Copy it with your keyboard shortcut.')
    } finally {
      operationInFlightRef.current = false
    }
  }

  async function downloadPdf() {
    if (!share || operationInFlightRef.current) return
    operationInFlightRef.current = true
    const controller = new AbortController()
    actionControllerRef.current?.abort()
    actionControllerRef.current = controller
    setBusy('download')
    setError('')
    try {
      const pdf = await getPublicSharedReportPdf(shareTokenFromUrl(share.share_url), controller.signal)
      if (!mountedRef.current || controller.signal.aborted) return
      const url = URL.createObjectURL(pdf)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `report-${item.id}.pdf`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (cause) {
      if (mountedRef.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'The shared PDF could not be downloaded.')
    } finally {
      operationInFlightRef.current = false
      if (mountedRef.current) setBusy(null)
    }
  }

  const unavailableMessage = busy === 'download' ? 'Downloading…' : 'Download shared PDF'
  return (
    <dialog className="report-share-dialog" ref={dialogRef} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); closeDialog() }} onClick={event => { if (event.target === event.currentTarget) closeDialog() }}>
        <header className="report-share-heading">
          <div><span className="eyebrow">Report access</span><h2 id={titleId}>Share report</h2><p>{item.learner_reference}</p></div>
          <button className="admin-result-details-close" type="button" onClick={closeDialog} aria-label="Close share report dialog" autoFocus>×</button>
        </header>

        {loading ? <p role="status">Checking for an existing share link…</p> : error && !share ? <div className="report-share-error" role="alert">{error}<button className="admin-outline-button" type="button" disabled={busy !== null} onClick={() => void reloadShareStatus()}>Reload share status</button></div> : share ? (
          <div className="report-share-active">
            <ReportShareSummary share={share} learnerReference={item.learner_reference} canCreate={canCreate} />
            <label className="report-share-link-label" htmlFor={urlId}>Read-only report link</label>
            <div className="report-share-url-row">
              <input id={urlId} ref={fieldRef} type="url" value={share.share_url} readOnly onFocus={event => event.currentTarget.select()} />
              <button className="admin-outline-button" type="button" onClick={() => void copyLink()}>Copy link</button>
            </div>
            <div className="report-share-actions">
              <a className="admin-outline-button" href={share.share_url} target="_blank" rel="noreferrer">Open shared report</a>
              <button className="admin-outline-button" type="button" disabled={busy !== null} onClick={() => void downloadPdf()}>{unavailableMessage}</button>
            </div>
            {canCreate ? <button className="admin-share-danger-link" type="button" disabled={busy !== null} onClick={() => setConfirm('replace')}>Replace shared copy</button> : null}
            <button className="admin-share-danger-link" type="button" disabled={busy !== null} onClick={() => setConfirm('revoke')}>Revoke link</button>
          </div>
        ) : (
          <div className="report-share-empty">
            <ReportShareSummary share={null} learnerReference={item.learner_reference} canCreate={canCreate} />
            <button className="admin-primary-button" type="button" disabled={!canCreate || busy !== null} onClick={() => void createOrReplace()}>{busy === 'create' ? 'Creating…' : 'Create share link'}</button>
          </div>
        )}

        {confirm ? <div className="report-share-confirm" role="alertdialog" aria-labelledby={confirmTitleId} aria-describedby={confirmCopyId}>
          <h3 id={confirmTitleId}>{confirm === 'revoke' ? 'Revoke this link?' : 'Replace this shared copy?'}</h3>
          <p id={confirmCopyId}>{confirm === 'revoke'
            ? 'Anyone using this URL will no longer be able to open the report.'
            : 'The current URL will stop working and a new link will be created for the latest completed report.'}</p>
          <div className="report-share-confirm-actions">
            <button className="admin-outline-button" type="button" disabled={busy !== null} onClick={() => setConfirm(null)}>Cancel</button>
            <button className="admin-primary-button" type="button" disabled={busy !== null} onClick={() => void (confirm === 'revoke' ? revoke() : createOrReplace())}>
              {busy === 'revoke' ? 'Revoking…' : busy === 'replace' ? 'Replacing…' : confirm === 'revoke' ? 'Revoke link' : 'Replace link'}
            </button>
          </div>
        </div> : null}

        {error && share ? <p className="report-share-error" role="alert">{error}</p> : null}
        {copyMessage ? <p className="report-share-status" role="status">{copyMessage}</p> : null}
        <footer className="report-share-footer"><button className="admin-outline-button" type="button" onClick={closeDialog}>Close</button></footer>
    </dialog>
  )
}

function shareTokenFromUrl(shareUrl: string): string {
  try {
    const segments = new URL(shareUrl, window.location.origin).pathname.split('/').filter(Boolean)
    const index = segments.lastIndexOf('shared-reports')
    return index >= 0 ? decodeURIComponent(segments[index + 1] || '') : ''
  } catch {
    return ''
  }
}
