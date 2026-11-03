import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router'
import './App.css'
import {
  AdminAssessmentsPage,
  AdminAuthProvider,
  AdminDashboardPage,
  AdminLoginPage,
  AdminProtectedLayout,
} from './admin/AdminApp'
import {
  ApiError,
  getPublicLink,
  getStudentReport,
  getAssessmentStatus,
  readReportSession,
  saveReportSession,
  studentReportPdfUrl,
  submitPublicAssessment,
  type PublicLink,
  type ReportItem,
  type SavedReportSession,
  type StudentReport,
} from './student-api'

type FlowView = 'overview' | 'preview' | 'record' | 'review' | 'submitted'
type RecordingState = 'idle' | 'recording' | 'paused'
type ReportTab = 'overview' | 'sounds' | 'intonation' | 'stress'

const TOTAL_READINGS = 2
const BRAND_MARK = '/assets/vitone-mark.png'
const PASSAGE_ART = '/assets/new-apartment.png'

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${minutes}:${remainder}`
}

function assessmentTokenFromInput(value: string): string | undefined {
  const segments = value.trim().split('/').filter(Boolean)
  const assessmentIndex = segments.lastIndexOf('a')
  const token = assessmentIndex >= 0 ? segments[assessmentIndex + 1] : segments.at(-1)
  return token || undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function Brand() {
  return (
    <Link className="brand" to="/" aria-label="Vitone student home">
      <span className="brand-mark" aria-hidden="true">
        <img src={BRAND_MARK} alt="" />
      </span>
      <span>Vitone</span>
    </Link>
  )
}

function StudentHeader({ activeStep }: {
  activeStep: 1 | 2 | 3
}) {
  return (
    <header className="student-header">
      <Brand />
      <nav className="stepper" aria-label="Assessment progress">
        {(['Overview', 'Record', 'Submit'] as const).map((label, index) => {
          const step = (index + 1) as 1 | 2 | 3
          return (
            <div className={`stepper-step ${activeStep === step ? 'is-active' : ''} ${activeStep > step ? 'is-complete' : ''}`} key={label}>
              <span className="step-number">{String(step).padStart(2, '0')}</span>
              <span>{label}</span>
            </div>
          )
        })}
      </nav>
    </header>
  )
}

function LoadingScreen({ label = 'Opening your assessment…' }: { label?: string }) {
  return (
    <main className="loading-screen" aria-live="polite">
      <span className="loading-ring" aria-hidden="true" />
      <p>{label}</p>
    </main>
  )
}

function MessageScreen({ title, message, action }: {
  title: string
  message: string
  action?: React.ReactNode
}) {
  return (
    <main className="message-screen">
      <section className="message-card">
        <span className="eyebrow">Vitone student</span>
        <h1>{title}</h1>
        <p>{message}</p>
        {action}
      </section>
    </main>
  )
}

function HomePage() {
  const [value, setValue] = useState('')
  const navigate = useNavigate()

  function openAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const token = assessmentTokenFromInput(value)
    if (token) navigate(`/a/${encodeURIComponent(token)}`)
  }

  return (
    <div className="student-app">
      <header className="student-header home-header"><Brand /><div className="home-header-links"><Link to="/admin/login" className="center-login-link">Center sign in <span aria-hidden="true">→</span></Link><span className="header-context">Student assessment</span></div></header>
      <main className="home-main">
        <section className="home-card">
          <div className="home-copy">
            <span className="eyebrow">Pronunciation assessment</span>
            <h1>Practice your reading. Understand your progress.</h1>
            <p>Open the assessment link shared by your English center to begin. You do not need to create an account.</p>
            <form className="link-entry" onSubmit={openAssessment}>
              <label htmlFor="assessment-link">Assessment link</label>
              <div className="link-entry-row">
                <input id="assessment-link" value={value} onChange={event => setValue(event.target.value)} placeholder="Paste your assessment link or token" required />
                <button className="primary-button" type="submit">Open assessment <span aria-hidden="true">→</span></button>
              </div>
            </form>
          </div>
          <div className="home-art" aria-hidden="true"><img src={PASSAGE_ART} alt="" /></div>
        </section>
      </main>
    </div>
  )
}

function passageSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map(sentence => sentence.trim()).filter(Boolean)
}

function PassagePanel({ link, view, readingNumber, secondReadingComplete, onPreview, onBack, onAdvanceToSecond, onCompleteSecond }: {
  link: PublicLink
  view: FlowView
  readingNumber: number
  secondReadingComplete: boolean
  onPreview: () => void
  onBack: () => void
  onAdvanceToSecond: () => void
  onCompleteSecond: () => void
}) {
  const passageListRef = useRef<HTMLDivElement | null>(null)
  const firstReadingRef = useRef<HTMLElement | null>(null)
  const secondReadingRef = useRef<HTMLElement | null>(null)
  const scrollIntentRef = useRef(false)
  const touchStartYRef = useRef<number | null>(null)
  const context = link.passage.context?.trim()

  function advanceToSecondReading() {
    scrollIntentRef.current = false
    if (readingNumber === 2) return
    onAdvanceToSecond()
    window.requestAnimationFrame(() => {
      if (!passageListRef.current || !secondReadingRef.current) return
      const listTop = passageListRef.current.getBoundingClientRect().top
      const readingTop = secondReadingRef.current.getBoundingClientRect().top
      passageListRef.current.scrollTo({
        top: passageListRef.current.scrollTop + readingTop - listTop,
        behavior: 'smooth',
      })
    })
  }

  function handlePassageScroll() {
    const list = passageListRef.current
    const firstReading = firstReadingRef.current
    if (!scrollIntentRef.current || readingNumber !== 1 || !list || !firstReading) return
    scrollIntentRef.current = false
    const listTop = list.getBoundingClientRect().top
    const firstReadingBottom = firstReading.getBoundingClientRect().bottom
    if (firstReadingBottom <= listTop + 12) advanceToSecondReading()
  }

  useEffect(() => {
    if (readingNumber === 1) passageListRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [readingNumber])

  if (view === 'overview') {
    return (
      <section className="passage-card" aria-labelledby="passage-title">
        <img className="passage-art" src={PASSAGE_ART} alt="Illustration of a bright new apartment" />
        <div className="passage-summary">
          <div className="passage-summary-copy">
            <h1 id="passage-title">{link.passage.title}</h1>
            <span className="context-pill context-pill-reading">Reading Context</span>
            {context ? <p className="passage-context-copy">{context}</p> : null}
          </div>
          <button className="text-button" onClick={onPreview}>Preview the passage <span aria-hidden="true">→</span></button>
        </div>
      </section>
    )
  }

  if (view === 'preview') {
    return (
      <section className="preview-card" aria-labelledby="preview-title">
        <div className="preview-card-top">
          <button className="back-link" type="button" onClick={onBack}><span aria-hidden="true">←</span>Back</button>
          <span className="context-pill">Preview Passage</span>
        </div>
        <div className="preview-copy">
          <h1 id="preview-title">{link.passage.title}</h1>
          <p>{link.passage.text}</p>
        </div>
      </section>
    )
  }

  return (
    <section className="reading-card" aria-label="Reading passage">
      <div className="reading-card-top">
        <span className="context-pill">Reading Passage</span>
      </div>
      <div
        className="sentence-list"
        ref={passageListRef}
        tabIndex={0}
        onScroll={handlePassageScroll}
        onWheel={event => { if (event.deltaY > 0) scrollIntentRef.current = true }}
        onTouchStart={event => { touchStartYRef.current = event.touches[0]?.clientY ?? null }}
        onTouchMove={event => {
          const currentY = event.touches[0]?.clientY
          if (currentY !== undefined && touchStartYRef.current !== null && currentY < touchStartYRef.current) scrollIntentRef.current = true
        }}
        onKeyDown={event => { if (['ArrowDown', 'PageDown', 'End', ' '].includes(event.key)) scrollIntentRef.current = true }}
      >
        {Array.from({ length: TOTAL_READINGS }, (_, index) => index + 1).map(copy => (
          <section className="reading-copy" key={copy} ref={copy === 1 ? firstReadingRef : secondReadingRef}>
            <h2 className="visually-hidden">Reading {copy}</h2>
            {passageSentences(link.passage.text).map((sentence, index) => (
              <div className={`sentence-row ${copy === readingNumber && index === 0 ? 'sentence-current' : ''}`} key={`${copy}-${index}-${sentence.slice(0, 24)}`}>
                <span className="sentence-number">{String(index + 1).padStart(2, '0')}</span>
                <p>{sentence}</p>
              </div>
            ))}
            {copy === 1 ? (
              <button className="progression-button" type="button" onClick={advanceToSecondReading}>
                I’ve finished the first reading <span aria-hidden="true">↓</span>
              </button>
            ) : (
              <div className="reading-completion">
                {secondReadingComplete ? <span role="status">Both readings complete. You can finish your recording.</span> : null}
                <button className="progression-button" type="button" onClick={onCompleteSecond} disabled={secondReadingComplete}>
                  {secondReadingComplete ? 'Second reading complete' : 'I’ve finished the second reading'}
                  {!secondReadingComplete ? <span aria-hidden="true">✓</span> : null}
                </button>
              </div>
            )}
          </section>
        ))}
      </div>
    </section>
  )
}

function MicOrb({ recording = false }: { recording?: boolean }) {
  return (
    <div className={`mic-orb ${recording ? 'mic-orb-recording' : ''}`} aria-hidden="true">
      {recording
        ? <div className="listening-dots"><i /><i /><i /><i /><i /></div>
        : <img src="/assets/4003-3526.svg" alt="" />}
    </div>
  )
}

function AdviceCards() {
  return (
    <div className="advice-cards">
      <div className="advice-card"><span className="advice-icon"><img src="/assets/quiet.svg" alt="" /></span><span>Quiet place with<br />minimal noise</span></div>
      <div className="advice-card"><span className="advice-icon"><img src="/assets/headphones.svg" alt="" /></span><span>Speak clearly at a<br />natural pace</span></div>
      <div className="advice-card"><span className="advice-icon"><img src="/assets/play.svg" alt="" /></span><span>Pause and resume<br />whenever you need</span></div>
    </div>
  )
}

function Waveform({ progress = 0 }: { progress?: number }) {
  return (
    <div className="waveform" aria-hidden="true">
      {Array.from({ length: 42 }, (_, index) => {
        const height = 8 + ((index * 17 + index * index * 3) % 26)
        return <span className={index / 42 <= progress ? 'wave-played' : ''} style={{ height }} key={index} />
      })}
    </div>
  )
}

function StudioPanel({
  view,
  recordingState,
  elapsed,
  duration,
  error,
  busy,
  audioUrl,
  secondReadingComplete,
  onBegin,
  onPause,
  onResume,
  onFinish,
  onRestart,
  onSubmit,
}: {
  view: FlowView
  recordingState: RecordingState
  elapsed: number
  duration: number
  error: string
  busy: boolean
  audioUrl: string | null
  secondReadingComplete: boolean
  onBegin: () => void
  onPause: () => void
  onResume: () => void
  onFinish: () => void
  onRestart: () => void
  onSubmit: () => void
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [playTime, setPlayTime] = useState(0)
  const progress = duration ? Math.min(playTime / duration, 1) : 0

  async function toggleAudio() {
    if (!audioRef.current) return
    if (audioRef.current.paused) {
      try {
        await audioRef.current.play()
        setPlaying(true)
      } catch {
        setPlaying(false)
      }
    } else {
      audioRef.current.pause()
      setPlaying(false)
    }
  }

  return (
    <aside className={`studio-panel ${view === 'review' ? 'studio-panel-review' : ''} ${view === 'record' && recordingState !== 'idle' ? 'studio-panel-capture' : ''}`} aria-live="polite">
      {view === 'submitted' ? (
        <div className="studio-content submitted-content">
          <Mascot />
          <h2>Submitted!</h2>
          <p>Your reading has been sent for assessment.</p>
        </div>
      ) : view === 'review' ? (
        <div className="studio-content review-content">
          <h2>Review your Recording</h2>
          <p>Listen to your recording before submitting.</p>
          {audioUrl ? <audio ref={audioRef} src={audioUrl} onTimeUpdate={event => setPlayTime(event.currentTarget.currentTime)} onEnded={() => setPlaying(false)} /> : null}
          <div className="audio-review-row">
            <button className="audio-play-button" aria-label={playing ? 'Pause recording' : 'Play recording'} onClick={toggleAudio}>
              <img src={playing ? '/assets/pause.svg' : '/assets/play.svg'} alt="" />
            </button>
            <Waveform progress={progress} />
            <span className="audio-duration">{formatTime(playTime)} / {formatTime(duration)}</span>
          </div>
          <div className="review-actions">
            <button className="secondary-button" onClick={onRestart} disabled={busy}>Record again <img src="/assets/replay-muted.svg" alt="" /></button>
            <button className="primary-button" onClick={onSubmit} disabled={busy}>
              {busy ? 'Submitting…' : 'Submit recording'} <span aria-hidden="true">➤</span>
            </button>
          </div>
          {error ? <p className="inline-error" role="alert">{error}</p> : null}
          <div className="privacy-note"><img src="/assets/lock.svg" alt="" />Your recording will be securely submitted for assessment.</div>
        </div>
      ) : (
        <div className={`studio-content ${recordingState === 'idle' ? 'studio-content-ready' : 'studio-content-capture'}`}>
          {recordingState === 'idle' ? (
            <>
              <MicOrb />
              <div className="studio-ready-copy">
                <h2>Ready to Record?</h2>
                <p className="studio-instructions">Please read aloud clearly.<br />You will be asked to read the passage twice.</p>
                <button className="primary-button start-button" onClick={onBegin}>Start <span aria-hidden="true">▶</span></button>
              </div>
              {error ? <p className="inline-error" role="alert">{error}</p> : null}
              <AdviceCards />
            </>
          ) : (
            <>
              {recordingState === 'recording' ? <span className="recording-pill"><i />Recording…</span> : <span className="paused-pill">Paused</span>}
              <MicOrb recording={recordingState === 'recording'} />
              <div className="recording-time">{formatTime(elapsed)}</div>
              <div className="recording-control-group">
                <div className="recording-actions">
                  <button className="round-action round-restart" onClick={onRestart} aria-label="Start over"><img src="/assets/replay.svg" alt="" /></button>
                  {recordingState === 'recording'
                    ? <button className="round-action round-pause" onClick={onPause} aria-label="Pause recording"><img src="/assets/pause.svg" alt="" /></button>
                    : <button className="round-action round-pause" onClick={onResume} aria-label="Resume recording"><img src="/assets/play.svg" alt="" /></button>}
                  <button className="round-action round-finish" onClick={onFinish} aria-label="Finish recording" disabled={!secondReadingComplete}><img src="/assets/stop.svg" alt="" /></button>
                </div>
                <div className="recording-labels"><span>Start over</span><span>{recordingState === 'recording' ? 'Pause' : 'Resume'}</span><span>Finish</span></div>
                {!secondReadingComplete ? <p className="inline-note">Finish both readings in the passage panel to enable Finish.</p> : null}
              </div>
              {error ? <p className="inline-error" role="alert">{error}</p> : null}
            </>
          )}
        </div>
      )}
    </aside>
  )
}

function Mascot() {
  return (
    <div className="mascot" aria-hidden="true">
      <span className="mascot-glow" />
      <span className="mascot-core"><img className="mascot-gloss" src="/assets/mascot-gloss.svg" alt="" /><img className="mascot-eye mascot-eye-left" src="/assets/mascot-eye.svg" alt="" /><img className="mascot-eye mascot-eye-right" src="/assets/mascot-eye-alt.svg" alt="" /></span>
    </div>
  )
}

function SubmissionModal({
  link,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  link: PublicLink
  busy: boolean
  error: string
  onClose: () => void
  onSubmit: (name: string, email: string) => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [validation, setValidation] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim()) {
      setValidation('Enter your name to continue.')
      return
    }
    if (!consent) {
      setValidation('Please read and accept the consent statement.')
      return
    }
    setValidation('')
    onSubmit(name.trim(), email.trim())
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <section className="submission-modal" role="dialog" aria-modal="true" aria-labelledby="submission-modal-title">
        <button className="modal-close" onClick={onClose} disabled={busy} aria-label="Close">×</button>
        <Mascot />
        <h2 id="submission-modal-title">Submit your two readings?</h2>
        <p className="modal-intro">Both readings and any pauses are together in one recording. Add your details and confirm consent to send it securely.</p>
        <form onSubmit={submit}>
          <label className="visually-hidden" htmlFor="student-name">Your name</label>
          <input id="student-name" value={name} onChange={event => setName(event.target.value)} placeholder="Enter Your Name *" autoComplete="name" maxLength={80} required disabled={busy} />
          <label className="visually-hidden" htmlFor="student-email">Email (optional)</label>
          <input id="student-email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="Email (optional)" autoComplete="email" disabled={busy} />
          <div className="consent-box">
            <p>{link.consent.text}</p>
            <label className="consent-check"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={busy} /><span>I agree to the consent statement above.</span></label>
          </div>
          {validation ? <p className="inline-error" role="alert">{validation}</p> : null}
          {error ? <p className="inline-error" role="alert">{error}</p> : null}
          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Review recording</button>
            <button className="primary-button" type="submit" disabled={busy || !consent}>{busy ? 'Submitting…' : 'Submit'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}

function AssessmentRoute() {
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
  const [readingNumber, setReadingNumber] = useState(1)
  const [secondReadingComplete, setSecondReadingComplete] = useState(false)
  const [allowEmptyRecordRoute, setAllowEmptyRecordRoute] = useState(false)
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
  const recordingStartRef = useRef(0)
  const recordingStartingRef = useRef(false)
  const assessmentInFlightRef = useRef(false)
  const secondReadingCompleteRef = useRef(false)
  const submissionKeysRef = useRef<WeakMap<Blob, Map<string, string>>>(new WeakMap())

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
    const timer = window.setInterval(() => {
      setElapsed(current => {
        const next = current + 1
        if (link && next >= link.limits.max_audio_seconds) {
          const recorder = recorderRef.current
          if (recorder && recorder.state !== 'inactive') recorder.stop()
          setClipError(`Recording stopped at the ${link.limits.max_audio_seconds}-second limit.`)
        }
        return next
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [recordingState, link])

  useEffect(() => {
    if (loading || !link) return

    const previewRequested = step === 'overview' && new URLSearchParams(location.search).get('preview') === '1'
    if (step === undefined || step === 'overview') {
      setView(previewRequested ? 'preview' : 'overview')
      return
    }

    if (step === 'record') {
      if (recordingState === 'idle' && !clip && !allowEmptyRecordRoute) {
        setFlowError('Your recording is not available in this session. Start again to continue.')
        setView('overview')
        navigate(`${basePath}/overview`, { replace: true })
        return
      }
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
  }, [allowEmptyRecordRoute, assessmentToken, basePath, clip, link, loading, location.search, navigate, recordingState, step])

  const discardUnsubmittedRecording = useCallback(() => {
    recordingStartRef.current += 1
    recordingStartingRef.current = false
    setRecordingStarting(false)
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null
      recorder.onstop = null
      recorder.stop()
    }
    recorderRef.current = null
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    chunksRef.current = []
    secondReadingCompleteRef.current = false
    setRecordingState('idle')
    setClip(null)
    setClipUrl(null)
    setElapsed(0)
    setSecondReadingComplete(false)
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
    if (recordingStartingRef.current) {
      recordingStartRef.current += 1
      recordingStartingRef.current = false
      setRecordingStarting(false)
    }
    if (!hasUnsubmittedRecording || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) return
    const target = event.target
    if (!(target instanceof Element)) return
    const anchor = target.closest('a[href]')
    if (!(anchor instanceof HTMLAnchorElement) || (anchor.target && anchor.target !== '_self')) return

    const destination = new URL(anchor.href, window.location.origin)
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

  useEffect(() => () => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null
      recorder.onstop = null
      recorder.stop()
    }
    streamRef.current?.getTracks().forEach(track => track.stop())
    if (clipUrl) URL.revokeObjectURL(clipUrl)
  }, [clipUrl])

  useEffect(() => () => {
    recordingStartRef.current += 1
    recordingStartingRef.current = false
  }, [])

  async function beginRecording() {
    if (clip && !window.confirm('Starting a new recording will replace your current recording. Continue?')) return
    const requestId = ++recordingStartRef.current
    recordingStartingRef.current = true
    setRecordingStarting(true)
    setFlowError('')
    setClipError('')
    setElapsed(0)
    setClip(null)
    setClipUrl(null)
    setAssessmentToken('')
    setReportUrl('')
    setAssessmentStatus('')
    setReportSession(null)
    setAllowEmptyRecordRoute(false)
    setReadingNumber(1)
    setSecondReadingComplete(false)
    secondReadingCompleteRef.current = false
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
      recordingStartingRef.current = false
      setRecordingStarting(false)
      streamRef.current = stream
      const availableTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
      const mimeType = availableTypes.find(type => MediaRecorder.isTypeSupported(type))
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const resultType = recorder.mimeType || chunksRef.current[0]?.type || 'audio/webm'
        const nextClip = new Blob(chunksRef.current, { type: resultType })
        setClip(nextClip)
        setClipUrl(URL.createObjectURL(nextClip))
        setRecordingState('idle')
        recorderRef.current = null
        stream.getTracks().forEach(track => track.stop())
        streamRef.current = null
        navigateToView('review')
        if (!secondReadingCompleteRef.current) {
          setClipError(current => current || 'The recording ended before you marked both readings complete. Please record both readings again.')
        } else if (nextClip.size === 0) {
          setClipError('No audio was captured. Please record both readings again.')
        } else if (nextClip.size > (link?.limits.max_audio_bytes ?? Number.MAX_SAFE_INTEGER)) {
          setClipError('This recording is larger than the allowed file size. Please record again in a quiet place.')
        }
      }
      recorder.onerror = () => {
        setFlowError('The browser could not record audio. Please try again.')
        if (recorder.state !== 'inactive') recorder.stop()
      }
      recorderRef.current = recorder
      recorder.start(1000)
      setRecordingState('recording')
      setAllowEmptyRecordRoute(false)
      navigateToView('record')
    } catch {
      grantedStream?.getTracks().forEach(track => track.stop())
      if (streamRef.current === grantedStream) streamRef.current = null
      if (requestId !== recordingStartRef.current) return
      recordingStartingRef.current = false
      setRecordingStarting(false)
      setFlowError('Microphone access is needed to record. Allow microphone access in your browser settings, then try again.')
    }
  }

  function pauseRecording() {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.pause()
      setRecordingState('paused')
    }
  }

  function resumeRecording() {
    if (recorderRef.current?.state === 'paused') {
      recorderRef.current.resume()
      setRecordingState('recording')
    }
  }

  function finishRecording() {
    if (!secondReadingComplete) {
      setFlowError('Mark the second reading complete in the passage panel before finishing.')
      return
    }
    setFlowError('')
    setClipError('')
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
  }

  function restartRecording() {
    recordingStartRef.current += 1
    recordingStartingRef.current = false
    setRecordingStarting(false)
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null
      recorder.onstop = null
      recorder.stop()
    }
    recorderRef.current = null
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    setRecordingState('idle')
    setClip(null)
    setClipUrl(null)
    setElapsed(0)
    setReadingNumber(1)
    setSecondReadingComplete(false)
    secondReadingCompleteRef.current = false
    setClipError('')
    setFlowError('')
    setAssessmentToken('')
    setReportUrl('')
    setAssessmentStatus('')
    setReportSession(null)
    setAllowEmptyRecordRoute(true)
    navigateToView('record')
  }

  function openSubmit() {
    if (!clip || clipError) {
      setFlowError(clipError || 'Finish both readings in one recording before submitting.')
      return
    }
    if (!secondReadingCompleteRef.current) {
      setFlowError('Complete both readings in the passage panel before submitting.')
      return
    }
    setModalError('')
    setModalOpen(true)
  }

  async function submitAssessment(name: string, email: string) {
    if (assessmentInFlightRef.current || !link || !clip || clipError || !secondReadingCompleteRef.current) return
    if (clip.size === 0 || clip.size > link.limits.max_audio_bytes) {
      setModalError(clip.size === 0
        ? 'No audio was captured. Please record both readings again.'
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
    navigate(path, {
      state: {
        passageTitle: link?.passage.title,
        audioUrl: clipUrl,
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
  const duration = elapsed
  const panelError = flowError || clipError

  return (
    <div className="student-app" onClickCapture={guardAssessmentLink}>
      <StudentHeader activeStep={activeStep} />
      <main className={`assessment-main ${showReading ? 'reading-stage' : ''}`}>
        <div className="assessment-grid">
          <PassagePanel
            link={link}
            view={view}
            readingNumber={readingNumber}
            secondReadingComplete={secondReadingComplete}
            onPreview={() => navigateToView('preview')}
            onBack={() => navigateToView('overview', true)}
            onAdvanceToSecond={() => setReadingNumber(2)}
            onCompleteSecond={() => { secondReadingCompleteRef.current = true; setSecondReadingComplete(true) }}
          />
          <StudioPanel
            view={view}
            recordingState={recordingState}
            elapsed={elapsed}
            duration={duration}
            error={panelError}
            busy={busy}
            audioUrl={clipUrl}
            secondReadingComplete={secondReadingComplete}
            onBegin={() => { void beginRecording() }}
            onPause={pauseRecording}
            onResume={resumeRecording}
            onFinish={finishRecording}
            onRestart={restartRecording}
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
            <p>Your reading is being analyzed. You can return to your report using this link.</p>
            <button className="primary-button" onClick={openReport}>View my report <span aria-hidden="true">→</span></button>
          </section>
        </div>
      ) : null}
    </div>
  )
}

function reportCategory(item: ReportItem): 'sounds' | 'intonation' | 'stress' {
  if (item.item_id >= 56 && item.item_id <= 63) return 'intonation'
  if ((item.item_id >= 49 && item.item_id <= 52) || item.item_id === 64) return 'stress'
  return 'sounds'
}

function bandLabel(item: ReportItem): string {
  if (item.status !== 'SCORED') return 'Not assessed'
  return item.band || 'Scored'
}

function bandClass(item: ReportItem): string {
  if (item.status !== 'SCORED') return 'unclear'
  switch (item.band) {
    case 'Perfect': return 'perfect'
    case 'Good': return 'good'
    case 'Needs Improvement': return 'needs-work'
    default: return 'unclear'
  }
}

function humanize(value: string): string {
  const words = value.replace(/[_-]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'No additional detail provided'
}

const unscoredReasonText: Record<string, string> = {
  UNSUPPORTED: 'This item is not supported by the current assessment detectors.',
  AMBIGUOUS: 'The available evidence did not support a clear result.',
  UNASSESSABLE: 'There was not enough reliable evidence to assess this item.',
  INCOMPLETE: 'Some required reading evidence is missing.',
  NO_TARGETS: 'This passage did not include a target for this item.',
  TARGET_RECONCILIATION: 'The target could not be matched reliably to the passage.',
}

function ReportItemCard({ item }: { item: ReportItem }) {
  return (
    <article className="report-item-card">
      <div className="report-item-heading">
        <div><span className="item-kicker">Assessment item</span><h3>Item {item.item_id}</h3></div>
        <span className={`result-tag ${bandClass(item)}`}>{bandLabel(item)}</span>
      </div>
      {item.status === 'UNSCORED' ? (
        <div className="item-detail">
          <p>{unscoredReasonText[item.unscored_reason || ''] || 'This item could not be assessed.'}</p>
          {item.blocking_targets?.map((blocker, index) => (
            <p className="blocker-note" key={`${blocker.target_occurrence_id}-${index}`}>
              Reading {blocker.reading_number}: {humanize(blocker.outcome)} — {humanize(blocker.reason)}.
            </p>
          ))}
        </div>
      ) : (
        <p className="item-detail">This item was assessed in your reading.</p>
      )}
    </article>
  )
}

function ReportPage() {
  const { token = '' } = useParams()
  const location = useLocation()
  const navState = location.state as {
    passageTitle?: string
    audioUrl?: string
    assessmentId?: string
    assessmentToken?: string
    status?: string
  } | null
  const savedSession = useMemo(() => readReportSession(token), [token])
  const session = useMemo<SavedReportSession | null>(() => {
    if (navState?.assessmentId && navState.assessmentToken && navState.passageTitle) {
      return {
        assessmentId: navState.assessmentId,
        assessmentToken: navState.assessmentToken,
        passageTitle: navState.passageTitle,
      }
    }
    return savedSession
  }, [navState, savedSession])
  const [report, setReport] = useState<StudentReport | null>(null)
  const [status, setStatus] = useState(navState?.status || 'ANALYZING')
  const [message, setMessage] = useState('')
  const [tab, setTab] = useState<ReportTab>('overview')
  const [audioPlaying, setAudioPlaying] = useState(false)
  const reportAudioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    let stopped = false
    let timer = 0
    async function poll() {
      if (session) {
        try {
          const current = await getAssessmentStatus(session.assessmentId, session.assessmentToken)
          if (stopped) return
          setStatus(current.status)
          if (current.status === 'FAILED') {
            setMessage(current.failure_message || 'The analysis could not be completed. Please contact your English center.')
            return
          }
        } catch {
          // The report endpoint below remains the source of truth for a public report link.
        }
      }

      try {
        const value = await getStudentReport(token)
        if (stopped) return
        setReport(value)
        setStatus('COMPLETED')
        setMessage('')
      } catch (error) {
        if (stopped) return
        if (error instanceof ApiError && (error.status === 409 || error.code === 'REPORT_NOT_READY')) {
          setStatus(previous => previous === 'FAILED' ? previous : 'ANALYZING')
          timer = window.setTimeout(() => void poll(), 3000)
        } else {
          setMessage(errorMessage(error))
        }
      }
    }
    void poll()
    return () => { stopped = true; window.clearTimeout(timer) }
  }, [token, session])

  async function toggleReportAudio() {
    if (!reportAudioRef.current) return
    if (reportAudioRef.current.paused) {
      try {
        await reportAudioRef.current.play()
        setAudioPlaying(true)
      } catch {
        setAudioPlaying(false)
      }
    } else {
      reportAudioRef.current.pause()
      setAudioPlaying(false)
    }
  }

  if (!report && status !== 'FAILED' && !message) {
    return (
      <div className="student-app">
        <StudentHeader activeStep={3} />
        <main className="report-waiting">
          <section className="waiting-card"><Mascot /><span className="eyebrow">Assessment submitted</span><h1>We’re reviewing your reading.</h1><p>Your report will appear here when the analysis is complete. This page checks for updates automatically.</p><span className="status-pill"><i />{status === 'ANALYZING' ? 'Analysis in progress' : status}</span></section>
        </main>
      </div>
    )
  }

  if (!report) {
    return <div className="student-app"><StudentHeader activeStep={3} /><MessageScreen title={status === 'FAILED' ? 'Your report is not ready' : 'We couldn’t open this report'} message={message || 'Please try again later or contact your English center.'} action={<Link className="text-button" to="/">Back to home →</Link>} /></div>
  }

  const items = [...report.content.items].sort((a, b) => a.item_id - b.item_id)
  const grouped = {
    sounds: items.filter(item => reportCategory(item) === 'sounds'),
    intonation: items.filter(item => reportCategory(item) === 'intonation'),
    stress: items.filter(item => reportCategory(item) === 'stress'),
  }
  const needsAttention = items.filter(item => item.status === 'UNSCORED' || item.band === 'Needs Improvement' || item.band === 'Unclear')
  const strengths = items.filter(item => item.status === 'SCORED' && (item.band === 'Perfect' || item.band === 'Good'))
  const currentItems = tab === 'sounds' ? grouped.sounds : tab === 'intonation' ? grouped.intonation : tab === 'stress' ? grouped.stress : items
  const passageTitle = navState?.passageTitle || session?.passageTitle || `Passage ${report.content.passage_id}`
  const audioUrl = navState?.audioUrl

  return (
    <div className="student-app report-app">
      <StudentHeader activeStep={3} />
      <main className="report-main">
        <div className="report-shell">
          <section className="report-heading">
            <img className="report-art" src={PASSAGE_ART} alt="" />
            <div className="report-heading-copy">
              <Link className="back-link" to="/">← Back</Link>
              <span className="eyebrow">Your pronunciation report</span>
              <h1>{passageTitle}</h1>
              <p>Completed {new Date(report.generated_at).toLocaleDateString()}</p>
            </div>
            <div className="report-export">
              <span className="complete-mark">✓ Analysis completed</span>
              <a className="primary-button button-link" href={studentReportPdfUrl(token)} target="_blank" rel="noreferrer">PDF Export</a>
            </div>
          </section>

          <div className="report-toolbar">
            <nav className="report-tabs" aria-label="Report sections">
              {([
                ['overview', 'Overview'],
                ['sounds', 'Sounds & endings'],
                ['intonation', 'Intonation'],
                ['stress', 'Stress & rhythm'],
              ] as const).map(([key, label]) => <button className={tab === key ? 'active' : ''} key={key} onClick={() => setTab(key)}>{label}</button>)}
            </nav>
            <div className="report-audio">
              {audioUrl ? <audio ref={reportAudioRef} src={audioUrl} onEnded={() => setAudioPlaying(false)} /> : null}
              <button className="audio-play-button" onClick={toggleReportAudio} disabled={!audioUrl} aria-label={audioPlaying ? 'Pause your recording' : 'Play your recording'}><img src={audioPlaying ? '/assets/pause.svg' : '/assets/play.svg'} alt="" /></button>
              <div><strong>Listen to your reading</strong><span>{audioUrl ? 'Review your recording alongside the results.' : 'Your recording was submitted securely.'}</span></div>
              <span className="recording-source"><img src="/assets/speaker.svg" alt="" />Your recording</span>
            </div>
          </div>

          {tab === 'overview' ? (
            <>
              <section className="focus-card">
                <span className="focus-overline"><span aria-hidden="true">✦</span> YOUR PRACTICE FOCUS</span>
                <h2>{needsAttention.length ? 'Review the items that need more evidence or practice.' : 'Keep building on the skills in this reading.'}</h2>
                <p>{needsAttention.length
                  ? `${needsAttention.length} of ${items.length} items are marked Needs Improvement, Unclear, or Not assessed. The item details below show the result and any available reason.`
                  : `All ${items.length} reported items received a scored result. Review the sections below to see each assessment band.`}</p>
              </section>
              <div className="profile-grid">
                <section className="profile-section">
                  <h2>Your skill profile</h2>
                  <div className="profile-card">
                    {[
                      ['Intonation', grouped.intonation],
                      ['Sounds & endings', grouped.sounds],
                      ['Stress & rhythm', grouped.stress],
                    ].map(([label, values]) => {
                      const sectionItems = values as ReportItem[]
                      const attention = sectionItems.filter(item => item.status === 'UNSCORED' || item.band === 'Needs Improvement' || item.band === 'Unclear').length
                      return (
                        <button className="profile-row" key={label as string} onClick={() => setTab(label === 'Intonation' ? 'intonation' : label === 'Stress & rhythm' ? 'stress' : 'sounds')}>
                          <span><strong>{label as string}</strong><small>{sectionItems.length ? `${sectionItems.length} assessment items` : 'No items in this report'}</small></span>
                          <span className={`result-tag ${attention ? 'needs-work' : sectionItems.length ? 'good' : 'unclear'}`}>{sectionItems.length ? attention ? `${attention} to review` : 'On track' : 'No data'}</span>
                        </button>
                      )
                    })}
                  </div>
                </section>
                <section className="profile-section">
                  <h2>What you did well</h2>
                  <div className="strength-card">
                    {strengths.length ? strengths.slice(0, 4).map(item => (
                      <div className="strength-row" key={item.item_id}><span className="strength-check">✓</span><span><strong>Item {item.item_id} · {item.band}</strong><small>This item received a scored result.</small></span></div>
                    )) : <p className="empty-note">No items were marked Perfect or Good in this report.</p>}
                  </div>
                </section>
              </div>
            </>
          ) : (
            <section className="detail-section">
              <div className="detail-intro">
                <h2>{tab === 'sounds' ? 'Sounds & endings' : tab === 'intonation' ? 'Intonation' : 'Stress & rhythm'}</h2>
                <p>Each result is shown with its assessment band. Items without enough evidence include the reason they could not be scored.</p>
              </div>
              {currentItems.length ? <div className="report-item-grid">{currentItems.map(item => <ReportItemCard item={item} key={item.item_id} />)}</div> : <div className="empty-report"><h3>No items in this section</h3><p>This report does not include any items for this section.</p></div>}
            </section>
          )}

          {tab === 'overview' ? (
            <section className="detail-section overview-items">
              <div className="detail-intro"><h2>Assessment details</h2><p>View the band for every item included in this report.</p></div>
              <div className="report-item-grid">{items.map(item => <ReportItemCard item={item} key={item.item_id} />)}</div>
            </section>
          ) : null}
          <p className="report-footnote">This report shows the results available for this assessment. An unscored item means the system did not have enough supported evidence to assign a band.</p>
        </div>
      </main>
    </div>
  )
}

function NotFoundPage() {
  return <div className="student-app"><StudentHeader activeStep={1} /><MessageScreen title="That page isn’t available" message="Open the assessment link shared by your English center to continue." action={<Link className="primary-button button-link" to="/">Back to home</Link>} /></div>
}

export default function App() {
  return (
    <AdminAuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/a/:token" element={<AssessmentRoute />} />
        <Route path="/a/:token/:step" element={<AssessmentRoute />} />
        <Route path="/r/:token" element={<ReportPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminProtectedLayout />}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="assessments" element={<AdminAssessmentsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AdminAuthProvider>
  )
}
