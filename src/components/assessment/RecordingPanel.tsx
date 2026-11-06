import { useRef, useState } from 'react'
import { type FlowView, formatTime, type RecordingState } from '../../app/types'
import { Mascot } from '../StudentChrome'

function MicOrb({ recording = false }: { recording?: boolean }) {
  return (
    <div className={`mic-orb ${recording ? 'mic-orb-recording' : ''}`} aria-hidden="true">
      {recording
        ? <div className="listening-dots"><i /><i /><i /><i /><i /></div>
        : <img src="/assets/student-assessment-microphone.svg" alt="" />}
    </div>
  )
}

function AdviceCards() {
  return (
    <div className="advice-cards">
      <div className="advice-card"><span className="advice-icon"><img src="/assets/student-assessment-quiet.svg" alt="" /></span><span>Quiet place with<br />minimal noise</span></div>
      <div className="advice-card"><span className="advice-icon"><img src="/assets/headphones.svg" alt="" /></span><span>Speak clearly at a<br />natural pace</span></div>
      <div className="advice-card"><span className="advice-icon"><img src="/assets/play.svg" alt="" /></span><span>Pause and resume<br />whenever you need</span></div>
    </div>
  )
}

function Waveform({ progress = 0 }: { progress?: number }) {
  return (
    <div className="waveform" aria-hidden="true">
      {Array.from({ length: 68 }, (_, index) => {
        const height = 3 + ((index * 17 + index * index * 3) % 34)
        return <span className={index / 68 < progress ? 'wave-played' : ''} style={{ height }} key={index} />
      })}
    </div>
  )
}

function RecordingPlayback({ clipUrl, durationSeconds }: { clipUrl: string; durationSeconds: number }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [playTime, setPlayTime] = useState(0)
  const progress = durationSeconds ? Math.min(playTime / durationSeconds, 1) : 0

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
    <section aria-label="Complete recording playback">
      <audio
        ref={audioRef}
        src={clipUrl}
        onTimeUpdate={event => setPlayTime(event.currentTarget.currentTime)}
        onEnded={() => setPlaying(false)}
      />
      <div className="audio-review-row">
        <button className="audio-play-button" type="button" aria-label={playing ? 'Pause recording' : 'Play recording'} onClick={() => void toggleAudio()}>
          <img src={playing ? '/assets/pause.svg' : '/assets/play.svg'} alt="" />
        </button>
        <Waveform progress={progress} />
        <span className="audio-duration">{formatTime(playTime)} / {formatTime(durationSeconds)}</span>
      </div>
    </section>
  )
}

export function StudioPanel({
  view,
  recordingStarting,
  recordingState,
  elapsed,
  error,
  busy,
  clip,
  clipUrl,
  uploadedName,
  uploadBusy,
  onReplaceUpload,
  onUpload,
  onPrepare,
  onBegin,
  onPause,
  onResume,
  onFinish,
  onRetryRecording,
  onSubmit,
}: {
  view: FlowView
  recordingStarting: boolean
  recordingState: RecordingState
  elapsed: number
  error: string
  busy: boolean
  clip: Blob | null
  clipUrl: string | null
  uploadedName: string
  uploadBusy: boolean
  onReplaceUpload: () => void
  onUpload: () => void
  onPrepare: () => void
  onBegin: () => void
  onPause: () => void
  onResume: () => void
  onFinish: () => void
  onRetryRecording: () => void
  onSubmit: () => void
}) {
  return (
    <aside className={`studio-panel ${view === 'review' ? 'studio-panel-review' : ''} ${view === 'record' ? 'studio-panel-capture' : ''}`} aria-live="polite">
      {view === 'submitted' ? (
        <div className="studio-content submitted-content">
          <Mascot />
          <h2>Submitted!</h2>
          <p>Your reading has been sent for assessment.</p>
        </div>
      ) : view === 'review' ? (
        <div className="studio-content review-content">
          <div className="review-heading"><h2>{uploadedName ? 'Review your file' : 'Review your recording'}</h2>
            <p>{uploadedName || 'Listen to the complete recording before submitting.'}</p></div>
          <div className="review-player-actions">
            {clipUrl ? <RecordingPlayback clipUrl={clipUrl} durationSeconds={elapsed} /> : null}
            <div className="review-actions">
              <button className="secondary-button" type="button" onClick={uploadedName ? onReplaceUpload : onRetryRecording} disabled={busy || uploadBusy || !clip}>
                {uploadBusy ? 'Checking file…' : uploadedName ? 'Replace file' : 'Record again'} <img src="/assets/replay-muted.svg" alt="" />
              </button>
              <button className="primary-button" type="button" onClick={onSubmit} disabled={busy || uploadBusy || !clip || !clipUrl}>
                {busy ? 'Submitting…' : <><span className="submit-label-full">Submit Recording</span><span className="submit-label-mobile">Submit</span></>} <img src="/assets/520-4772.svg" alt="" />
              </button>
            </div>
          </div>
          {error ? <p className="inline-error" role="alert">{error}</p> : null}
          <div className="privacy-note"><img src="/assets/lock.svg" alt="" /><span>Your recording will be securely submitted for assessment. You will not be able to edit it after submitting.</span></div>
        </div>
      ) : (
        <div className={`studio-content ${recordingState === 'idle' && view !== 'record' ? 'studio-content-ready' : 'studio-content-capture'}`}>
          {recordingState === 'idle' && view !== 'record' ? (
            <>
              <div className="mic-orb-slot"><MicOrb /></div>
              <div className="studio-ready-copy">
                <h2>Ready to Record?</h2>
                <p className="studio-instructions">
                  <span className="studio-instructions-full">Please read aloud clearly. Read the passage twice in one recording. After the first reading, stay recording and remain silent for 3–5 seconds while the passage moves to Reading 2. Then read it again. You may pause and resume if you need a break.</span>
                  <span className="studio-instructions-mobile">Please read aloud clearly.<br />You will be asked to read the passage twice.</span>
                </p>
                {view !== 'overview' ? <button className="primary-button start-button" type="button" onClick={onPrepare}>Start <img src="/assets/play.svg" alt="" /></button> : null}
              </div>
              {view === 'overview' ? <div className="overview-voice-actions">
                <button className="overview-upload" type="button" onClick={onUpload} disabled={uploadBusy}>
                  <span className="overview-upload-icon"><img src="/assets/794-4134.svg" alt="" /></span>
                  <span className="overview-upload-copy"><strong>{uploadBusy ? 'Checking file…' : 'Upload recording'}</strong><span>Supported format: MP3, WAV, MP4, MOV</span></span>
                </button>
                <button className="overview-record" type="button" onClick={onPrepare}>
                  <span className="overview-record-icon"><img src="/assets/794-4144.svg" alt="" /></span><span>Start Recording</span>
                </button>
              </div> : null}
              {error ? <p className="inline-error" role="alert">{error}</p> : null}
              <AdviceCards />
            </>
          ) : (
            <>
              <div className="mic-orb-slot"><MicOrb recording={recordingState === 'recording'} /></div>
              {recordingState === 'recording'
                ? <span className="recording-pill" role="status"><img src="/assets/student-recording/status.svg" alt="" />Recording...</span>
                : recordingState === 'paused'
                  ? <span className="paused-pill" role="status">Paused</span>
                  : <span className="recording-ready-pill" role="status">{recordingStarting ? 'Starting…' : 'Ready'}</span>}
              <div className="recording-time">{formatTime(recordingState === 'idle' ? 0 : elapsed)}</div>
              <div className="recording-control-group">
                <div className="recording-actions">
                  <button className="round-action round-restart" type="button" onClick={onRetryRecording} aria-label="Restart the recording" disabled={recordingState === 'idle'}><img src="/assets/student-recording/restart.svg" alt="" /></button>
                  {recordingState === 'idle'
                    ? <button className="round-action round-pause" type="button" onClick={onBegin} aria-label="Start" disabled={recordingStarting}><img src="/assets/play.svg" alt="" /></button>
                    : recordingState === 'recording'
                      ? <button className="round-action round-pause" type="button" onClick={onPause} aria-label="Pause recording"><img src="/assets/student-recording/pause.svg" alt="" /></button>
                      : <button className="round-action round-pause" type="button" onClick={onResume} aria-label="Resume recording"><img src="/assets/play.svg" alt="" /></button>}
                  <button className="round-action round-finish" type="button" onClick={onFinish} aria-label="Finish" disabled={recordingState === 'idle'}><img src="/assets/student-recording/finish.svg" alt="" /></button>
                </div>
                <div className="recording-labels"><span>Start over</span><span>{recordingState === 'idle' ? recordingStarting ? 'Starting…' : 'Start' : recordingState === 'recording' ? 'Pause' : 'Resume'}</span><span>Finish</span></div>
              </div>
              {error ? <p className="inline-error" role="alert">{error}</p> : null}
            </>
          )}
        </div>
      )}
    </aside>
  )
}
