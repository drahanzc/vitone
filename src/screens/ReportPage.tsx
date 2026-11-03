import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import {
  ApiError,
  getAssessmentStatus,
  getStudentReport,
  readReportSession,
  studentReportPdfUrl,
  type ReportItem,
  type SavedReportSession,
  type StudentReport,
} from '../student-api'
import { PASSAGE_ART, type ReportTab, errorMessage } from '../app/types'
import { Mascot, MessageScreen, StudentHeader } from '../components/StudentChrome'

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

export function ReportPage() {
  const { token = '' } = useParams()
  const location = useLocation()
  const navState = location.state as {
    passageTitle?: string
    audioUrl?: string
    assessmentId?: string
    assessmentToken?: string
    status?: string
  } | null
  const audioUrl = navState?.audioUrl
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
  const pendingAudioRevokesRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    if (!audioUrl?.startsWith('blob:')) return
    const pendingTimer = pendingAudioRevokesRef.current.get(audioUrl)
    if (pendingTimer !== undefined) {
      window.clearTimeout(pendingTimer)
      pendingAudioRevokesRef.current.delete(audioUrl)
    }
    return () => {
      const timer = window.setTimeout(() => {
        URL.revokeObjectURL(audioUrl)
        pendingAudioRevokesRef.current.delete(audioUrl)
      }, 0)
      pendingAudioRevokesRef.current.set(audioUrl, timer)
    }
  }, [audioUrl])

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

