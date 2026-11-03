import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import {
  getPublicLink,
  MIN_AUDIO_SECONDS_PER_READING,
  saveReportSession,
  submitPublicAssessment,
  type PublicLink,
  type SavedReportSession,
} from '../student-api'
import { errorMessage, type FlowView, type RecordingState } from '../app/types'
import { LoadingScreen, Mascot, MessageScreen, StudentHeader } from '../components/StudentChrome'
import { PassagePanel } from '../components/assessment/PassagePanel'
import { StudioPanel } from '../components/assessment/RecordingPanel'
import { SubmissionModal } from '../components/assessment/SubmissionModal'

export function AssessmentRoute() {
  const { token = '', step } = useParams()
  return <AssessmentFlow key={token} token={token} step={step} />
}

function AssessmentFlow({ token, step }: { token: string; step?: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const basePath = `/a/${encodeURIComponent(token)}`
  const routeUrl = `${location.pathname}${location.search}${location.hash}`
  const routeUrlRef = useRef(routeUrl)
  const [link, setLink] = useState<PublicLink | null>(null)
  const [view, setView] = useState<FlowView>('overview')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [flowError, setFlowError] = useState('')
  const [modalError, setModalError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [recordingStarting, setRecordingStarting] = useState(false)
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [clip, setClip] = useState<Blob | null>(null)
  const [clipUrl, setClipUrl] = useState<string | null>(null)
  const [clipError, setClipError] = useState('')
  const [assessmentToken, setAssessmentToken] = useState('')
  const [reportUrl, setReportUrl] = useState('')
  const [assessmentStatus, setAssessmentStatus] = useState('')
  const [reportSession, setReportSession] = useState<SavedReportSession | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const capturedBytesRef = useRef(0)
  const clipUrlRef = useRef<string | null>(null)
  const recordingStartRef = useRef(0)
  const recordingStartingRef = useRef(false)
  const captureIdRef = useRef(0)
  const segmentElapsedMsRef = useRef(0)
  const segmentActiveSinceRef = useRef<number | null>(null)
  const captureFailedRef = useRef(false)
  const captureFailureMessageRef = useRef<string | null>(null)
  const assessmentInFlightRef = useRef(false)
  const submissionKeysRef = useRef<WeakMap<Blob, Map<string, string>>>(new WeakMap())
  const [captureId, setCaptureId] = useState(0)

  useEffect(() => {
    routeUrlRef.current = routeUrl
  }, [routeUrl])

  useEffect(() => {
    let cancelled = false
    getPublicLink(token).then(value => {
      if (cancelled) return
      setLink(value)
    }).catch(error => {
      if (!cancelled) setLoadError(errorMessage(error))
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [token])

  useEffect(() => {
    if (recordingState !== 'recording') return
    const maxRecordingMs = link
      ? link.limits.max_audio_seconds * 1000
      : Number.POSITIVE_INFINITY
    let timer: number | undefined
    const updateRecordingTime = () => {
      const activeSince = segmentActiveSinceRef.current
      const currentSegmentMs = segmentElapsedMsRef.current
        + (activeSince === null ? 0 : performance.now() - activeSince)
      setElapsed(Math.floor(currentSegmentMs / 1000))
      const remainingMs = maxRecordingMs - currentSegmentMs
      if (link && remainingMs <= 0) {
        const recorder = recorderRef.current
        if (recorder && recorder.state !== 'inactive') {
          const now = performance.now()
          if (segmentActiveSinceRef.current !== null) {
            segmentElapsedMsRef.current += now - segmentActiveSinceRef.current
            segmentActiveSinceRef.current = null
          }
          captureFailedRef.current = true
          captureFailureMessageRef.current = `The recording reached the ${link.limits.max_audio_seconds}-second duration limit. Please record again.`
          recorder.stop()
        }
        return
      }
      timer = window.setTimeout(updateRecordingTime, Math.min(200, Math.max(0, remainingMs)))
    }
    updateRecordingTime()
    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [recordingState, link])

  useEffect(() => {
    if (loading || !link) return

    const previewRequested = step === 'overview' && new URLSearchParams(location.search).get('preview') === '1'
    if (step === undefined || step === 'overview') {
      setView(previewRequested ? 'preview' : 'overview')
      return
    }

    if (step === 'record') {
      setView('record')
      return
    }

    if (step === 'submit') {
      if (!clip && !assessmentToken) {
        setFlowError('Your recording is not available in this session. Start again to continue.')
        setView('overview')
        navigate(`${basePath}/overview`, { replace: true })
        return
      }
      setView(assessmentToken ? 'submitted' : 'review')
      return
    }

    navigate(`${basePath}/overview`, { replace: true })
  }, [assessmentToken, basePath, clip, link, loading, location.search, navigate, step])

  function cancelRecordingStart() {
    if (!recordingStartingRef.current) return
    recordingStartRef.current += 1
    recordingStartingRef.current = false
    setRecordingStarting(false)
  }

  const discardUnsubmittedRecording = useCallback(() => {
    recordingStartRef.current += 1
    recordingStartingRef.current = false
    setRecordingStarting(false)
    const recorder = recorderRef.current
    if (recorder) {
      recorder.ondataavailable = null
      recorder.onerror = null
      recorder.onstop = null
      if (recorder.state !== 'inactive') recorder.stop()
    }
    recorderRef.current = null
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    chunksRef.current = []
    capturedBytesRef.current = 0
    if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current)
    clipUrlRef.current = null
    segmentElapsedMsRef.current = 0
    segmentActiveSinceRef.current = null
    setRecordingState('idle')
    setClip(null)
    setClipUrl(null)
    setElapsed(0)
    captureFailedRef.current = false
    captureFailureMessageRef.current = null
    setClipError('')
    setFlowError('')
  }, [])

  const hasUnsubmittedRecording = recordingState !== 'idle' || (clip !== null && !assessmentToken)
  useEffect(() => {
    if (!hasUnsubmittedRecording && !recordingStarting) return

    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!hasUnsubmittedRecording) return
      event.preventDefault()
      event.returnValue = ''
    }

    function onPopState(event: PopStateEvent) {
      if (recordingStartingRef.current) {
        recordingStartRef.current += 1
        recordingStartingRef.current = false
        setRecordingStarting(false)
      }
      if (!hasUnsubmittedRecording) return
      const destination = `${window.location.pathname}${window.location.search}${window.location.hash}`
      const sameAssessment = destination === basePath || destination.startsWith(`${basePath}/`)
      const leavesActiveRecording = recordingState !== 'idle' && destination !== `${basePath}/record`
      const leavesAssessmentWithRecording = !sameAssessment && hasUnsubmittedRecording
      if (!leavesActiveRecording && !leavesAssessmentWithRecording) return

      const message = 'Leaving now will discard your unsubmitted recording. Do you want to continue?'
      if (window.confirm(message)) {
        discardUnsubmittedRecording()
        return
      }

      const safeUrl = routeUrlRef.current
      window.history.pushState(event.state, '', safeUrl)
      navigate(safeUrl, { replace: true })
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('popstate', onPopState)
    }
  }, [basePath, discardUnsubmittedRecording, hasUnsubmittedRecording, navigate, recordingStarting, recordingState])

  function guardAssessmentLink(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) return
    const target = event.target
    if (!(target instanceof Element)) return
    const anchor = target.closest('a[href]')
    if (!(anchor instanceof HTMLAnchorElement) || (anchor.target && anchor.target !== '_self')) return

    const destination = new URL(anchor.href, window.location.origin)
    const routeChanges = destination.pathname !== location.pathname || destination.search !== location.search || destination.hash !== location.hash
    if (recordingStartingRef.current && routeChanges) cancelRecordingStart()
    if (!hasUnsubmittedRecording) return
    const sameAssessment = destination.origin === window.location.origin
      && (destination.pathname === basePath || destination.pathname.startsWith(`${basePath}/`))
    const leavesActiveRecording = recordingState !== 'idle' && destination.pathname !== `${basePath}/record`
    if (sameAssessment && !leavesActiveRecording) return

    if (!window.confirm('Leaving now will discard your unsubmitted recording. Do you want to continue?')) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    discardUnsubmittedRecording()
  }

  function navigateToView(nextView: FlowView, replace = false) {
    let target = `${basePath}/submit`
    if (nextView === 'overview') target = `${basePath}/overview`
    if (nextView === 'preview') target = `${basePath}/overview?preview=1`
    if (nextView === 'record') target = `${basePath}/record`
    if (target === routeUrl) {
      setView(nextView)
      return
    }
    navigate(target, { replace })
  }

  function backToOverview() {
    if (recordingStartingRef.current) {
      cancelRecordingStart()
    } else if (hasUnsubmittedRecording) {
      if (!window.confirm('Leaving now will discard your unsubmitted recording. Do you want to continue?')) return
      discardUnsubmittedRecording()
    }
    navigateToView('overview', true)
  }

  useEffect(() => () => {
    const recorder = recorderRef.current
    if (recorder) {
      recorder.ondataavailable = null
      recorder.onerror = null
      recorder.onstop = null
      if (recorder.state !== 'inactive') recorder.stop()
    }
    streamRef.current?.getTracks().forEach(track => track.stop())
    if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current)
  }, [])

  useEffect(() => () => {
    recordingStartRef.current += 1
    recordingStartingRef.current = false
  }, [])

  async function beginRecording() {
    if (recordingStartingRef.current || recordingState !== 'idle' || view !== 'record') return
    if (link) {
      const minimumDuration = link.required_readings * MIN_AUDIO_SECONDS_PER_READING
      if (link.limits.max_audio_seconds < minimumDuration) {
        setClipError(`This assessment link cannot accept the required ${minimumDuration}-second recording within its duration limit. Contact your English center.`)
        return
      }
    }
    const requestId = ++recordingStartRef.current
    recordingStartingRef.current = true
    setRecordingStarting(true)
    setFlowError('')
    setClipError('')
    setElapsed(0)
    segmentElapsedMsRef.current = 0
    segmentActiveSinceRef.current = null
    capturedBytesRef.current = 0
    captureFailedRef.current = false
    captureFailureMessageRef.current = null
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      recordingStartingRef.current = false
      setRecordingStarting(false)
      setFlowError('Audio recording is not available in this browser. Try a current version of Chrome, Edge, or Safari.')
      return
    }
    let grantedStream: MediaStream | null = null
    try {
      grantedStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const stream = grantedStream
      if (requestId !== recordingStartRef.current) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      streamRef.current = stream
      const availableTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
      const mimeType = availableTypes.find(type => MediaRecorder.isTypeSupported(type))
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = event => {
        if (event.data.size === 0 || captureFailedRef.current) return
        if (link && capturedBytesRef.current + event.data.size > link.limits.max_audio_bytes) {
          chunksRef.current = []
          capturedBytesRef.current = 0
          captureFailedRef.current = true
          captureFailureMessageRef.current = 'The recording reached the allowed upload size. Please record again with a shorter duration.'
          const activeSince = segmentActiveSinceRef.current
          if (activeSince !== null) {
            segmentElapsedMsRef.current += performance.now() - activeSince
            segmentActiveSinceRef.current = null
          }
          if (recorder.state !== 'inactive') recorder.stop()
          return
        }
        chunksRef.current.push(event.data)
        capturedBytesRef.current += event.data.size
      }
      recorder.onstop = () => {
        recorder.ondataavailable = null
        recorder.onerror = null
        recorder.onstop = null
        const activeSince = segmentActiveSinceRef.current
        if (activeSince !== null) {
          segmentElapsedMsRef.current += performance.now() - activeSince
          segmentActiveSinceRef.current = null
        }
        const segmentDurationMs = segmentElapsedMsRef.current
        const resultType = recorder.mimeType || chunksRef.current[0]?.type || 'audio/webm'
        const nextClip = new Blob(chunksRef.current, { type: resultType })
        chunksRef.current = []
        capturedBytesRef.current = 0
        setRecordingState('idle')
        recorderRef.current = null
        stream.getTracks().forEach(track => track.stop())
        streamRef.current = null
        setElapsed(Math.floor(segmentDurationMs / 1000))
        if (captureFailedRef.current) {
          captureFailedRef.current = false
          const failureMessage = captureFailureMessageRef.current
          captureFailureMessageRef.current = null
          setFlowError('')
          setClipError(failureMessage || 'The recording failed, so its partial audio was discarded. Please record again.')
          return
        }
        if (nextClip.size === 0) {
          setClipError('No audio was captured. Try recording again.')
          return
        }
        if (link && segmentDurationMs > link.limits.max_audio_seconds * 1000) {
          setClipError(`The recording exceeded the ${link.limits.max_audio_seconds}-second duration limit. Please record again.`)
          return
        }
        if (link && nextClip.size > link.limits.max_audio_bytes) {
          setClipError('The recording is larger than the allowed file size. Please record again with a shorter duration.')
          return
        }
        const minimumDuration = link ? link.required_readings * MIN_AUDIO_SECONDS_PER_READING : 0
        if (segmentDurationMs < minimumDuration * 1000) {
          setClipError(`Your recording must be at least ${minimumDuration} seconds long to include both readings. Please record again.`)
          return
        }

        if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current)
        const nextUrl = URL.createObjectURL(nextClip)
        clipUrlRef.current = nextUrl
        setClip(nextClip)
        setClipUrl(nextUrl)
        setClipError('')
        navigateToView('review')
      }
      recorder.onerror = () => {
        captureFailedRef.current = true
        captureFailureMessageRef.current = null
        if (recorder.state !== 'inactive') recorder.stop()
      }
      recorderRef.current = recorder
      recorder.start(1000)
      captureIdRef.current += 1
      setCaptureId(captureIdRef.current)
      segmentActiveSinceRef.current = performance.now()
      recordingStartingRef.current = false
      setRecordingStarting(false)
      setRecordingState('recording')
      navigateToView('record')
    } catch {
      grantedStream?.getTracks().forEach(track => track.stop())
      if (streamRef.current === grantedStream) streamRef.current = null
      const failedRecorder = recorderRef.current
      if (failedRecorder) {
        failedRecorder.ondataavailable = null
        failedRecorder.onerror = null
        failedRecorder.onstop = null
        if (failedRecorder.state !== 'inactive') failedRecorder.stop()
        recorderRef.current = null
      }
      if (requestId !== recordingStartRef.current) return
      recordingStartingRef.current = false
      setRecordingStarting(false)
      setFlowError('Microphone access is needed to record. Allow microphone access in your browser settings, then try again.')
    }
  }

  function pauseRecording() {
    if (recorderRef.current?.state === 'recording') {
      const activeSince = segmentActiveSinceRef.current
      if (activeSince !== null) {
        segmentElapsedMsRef.current += performance.now() - activeSince
        segmentActiveSinceRef.current = null
      }
      recorderRef.current.pause()
      setElapsed(Math.floor(segmentElapsedMsRef.current / 1000))
      setRecordingState('paused')
    }
  }

  function resumeRecording() {
    if (recorderRef.current?.state === 'paused') {
      recorderRef.current.resume()
      segmentActiveSinceRef.current = performance.now()
      setRecordingState('recording')
    }
  }

  function finishRecording() {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    setFlowError('')
    const activeSince = segmentActiveSinceRef.current
    if (activeSince !== null) {
      segmentElapsedMsRef.current += performance.now() - activeSince
      segmentActiveSinceRef.current = null
    }
    recorder.stop()
  }

  function clearRecording() {
    setClip(null)
    setClipError('')
    if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current)
    clipUrlRef.current = null
    setClipUrl(null)
  }

  function retryRecording() {
    recordingStartRef.current += 1
    recordingStartingRef.current = false
    setRecordingStarting(false)
    const recorder = recorderRef.current
    if (recorder) {
      recorder.ondataavailable = null
      recorder.onerror = null
      recorder.onstop = null
      if (recorder.state !== 'inactive') recorder.stop()
    }
    recorderRef.current = null
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    chunksRef.current = []
    capturedBytesRef.current = 0
    segmentElapsedMsRef.current = 0
    segmentActiveSinceRef.current = null
    captureFailedRef.current = false
    captureFailureMessageRef.current = null
    setRecordingState('idle')
    setElapsed(0)
    setClipError('')
    setFlowError('')
    setAssessmentToken('')
    setReportUrl('')
    setAssessmentStatus('')
    setReportSession(null)
    clearRecording()
    navigateToView('record')
  }

  function openSubmit() {
    if (!clip || !clipUrl || clipError) {
      setFlowError(clipError || 'Record and review both readings before submitting.')
      return
    }
    setModalError('')
    setModalOpen(true)
  }

  async function submitAssessment(name: string, email: string) {
    if (assessmentInFlightRef.current || !link || !clip || clipError) return
    if (clip.size === 0 || clip.size > link.limits.max_audio_bytes) {
      setModalError(clip.size === 0
        ? 'No audio was captured. Please record again.'
        : 'This recording is larger than the allowed file size. Please record again.')
      return
    }

    assessmentInFlightRef.current = true
    setBusy(true)
    setModalError('')
    const fingerprint = JSON.stringify([name, email, link.consent.version])
    let keysForRecording = submissionKeysRef.current.get(clip)
    if (!keysForRecording) {
      keysForRecording = new Map<string, string>()
      submissionKeysRef.current.set(clip, keysForRecording)
    }
    const idempotencyKey = keysForRecording.get(fingerprint) || crypto.randomUUID()
    keysForRecording.set(fingerprint, idempotencyKey)

    try {
      const created = await submitPublicAssessment(token, {
        learnerReference: name,
        email: email || undefined,
        consentVersion: link.consent.version,
        audio: clip,
      }, idempotencyKey)
      const reportSession: SavedReportSession = {
        assessmentId: created.assessment_id,
        assessmentToken: created.assessment_token,
        passageTitle: link.passage.title,
      }
      saveReportSession(reportSession)
      setReportSession(reportSession)
      setAssessmentToken(created.assessment_token)
      setReportUrl(created.report_url)
      setAssessmentStatus(created.status)
      setModalOpen(false)
    } catch (error) {
      setModalError(errorMessage(error))
    } finally {
      assessmentInFlightRef.current = false
      setBusy(false)
    }
  }

  function openReport() {
    const fallbackPath = `/r/${encodeURIComponent(assessmentToken)}`
    let path = fallbackPath
    try {
      const report = new URL(reportUrl, window.location.origin)
      path = `${report.pathname}${report.search}${report.hash}`
    } catch {
      // Fall back to the report route built from the returned assessment token.
    }
    const transferredAudioUrl = clipUrl
    if (transferredAudioUrl) clipUrlRef.current = null
    navigate(path, {
      state: {
        passageTitle: link?.passage.title,
        audioUrl: transferredAudioUrl,
        assessmentId: reportSession?.assessmentId,
        assessmentToken,
        status: assessmentStatus,
      },
    })
  }

  if (loading) return <div className="student-app"><LoadingScreen /></div>
  if (loadError || !link) {
    return <div className="student-app"><StudentHeader activeStep={1} /><MessageScreen title="This assessment link isn’t available" message={loadError || 'Check the link and try again, or contact your English center.'} action={<Link className="primary-button button-link" to="/">Back to home</Link>} /></div>
  }

  const activeStep: 1 | 2 | 3 = view === 'overview' || view === 'preview' ? 1 : view === 'record' ? 2 : 3
  const showReading = view === 'record' || view === 'review'
  const panelError = flowError || clipError

  return (
    <div className="student-app" data-capture-id={captureId} onClickCapture={guardAssessmentLink}>
      <StudentHeader activeStep={activeStep} showInfo />
      <main className={`assessment-main ${showReading ? 'reading-stage' : ''}`}>
        <div className="assessment-grid">
          <PassagePanel
            link={link}
            view={view}
            recordingState={recordingState}
            captureId={captureId}
            onPreview={() => navigateToView('preview')}
            onBack={() => navigateToView('overview', true)}
            onBackToOverview={backToOverview}
          />
          <StudioPanel
            view={view}
            recordingStarting={recordingStarting}
            recordingState={recordingState}
            elapsed={elapsed}
            error={panelError}
            busy={busy}
            clip={clip}
            clipUrl={clipUrl}
            onPrepare={() => navigateToView('record')}
            onBegin={() => { void beginRecording() }}
            onPause={pauseRecording}
            onResume={resumeRecording}
            onFinish={finishRecording}
            onRetryRecording={retryRecording}
            onSubmit={openSubmit}
          />
        </div>
      </main>
      {modalOpen ? <SubmissionModal link={link} busy={busy} error={modalError} onClose={() => setModalOpen(false)} onSubmit={(name, email) => void submitAssessment(name, email)} /> : null}
      {view === 'submitted' ? (
        <div className="modal-backdrop">
          <section className="success-modal" role="dialog" aria-modal="true" aria-labelledby="success-title">
            <button className="modal-close" onClick={openReport} aria-label="Close">×</button>
            <Mascot />
            <h2 id="success-title">Submitted!</h2>
            <button className="primary-button" onClick={openReport}>View my report <span aria-hidden="true">→</span></button>
          </section>
        </div>
      ) : null}
    </div>
  )
}

