import { useCallback, useEffect, useRef, useState } from 'react'
import { useSpeechRecognitionPassage } from '../../speech-recognition'
import { PASSAGE_ART, SCROLL_THUMB_HEIGHT, type FlowView, type RecordingState } from '../../app/types'
import type { PublicLink } from '../../student-api'

function partProgressWordIndices(parts: readonly { wordIndex: number | null }[]): (number | null)[] {
  const indices = new Array<number | null>(parts.length).fill(null)
  let nextWordIndex: number | null = null
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const wordIndex = parts[index].wordIndex
    if (wordIndex !== null) nextWordIndex = wordIndex
    indices[index] = nextWordIndex
  }

  let previousWordIndex: number | null = null
  for (let index = 0; index < parts.length; index += 1) {
    const wordIndex = parts[index].wordIndex
    if (wordIndex !== null) previousWordIndex = wordIndex
    else if (indices[index] === null) indices[index] = previousWordIndex
  }

  return indices
}

export function PassagePanel({ link, view, recordingState, captureId, onPreview, onBack, onBackToOverview }: {
  link: PublicLink
  view: FlowView
  recordingState: RecordingState
  captureId: number
  onPreview: () => void
  onBack: () => void
  onBackToOverview: () => void
}) {
  const readingCardRef = useRef<HTMLElement | null>(null)
  const passageListRef = useRef<HTMLDivElement | null>(null)
  const readingCopyRefs = useRef<Array<HTMLElement | null>>([])
  const activeSentenceRef = useRef<HTMLDivElement | null>(null)
  const [scrollThumbOffset, setScrollThumbOffset] = useState(0)
  const [scrollThumbTop, setScrollThumbTop] = useState(0)
  const [showScrollThumb, setShowScrollThumb] = useState(false)
  const context = link.passage.context?.trim()
  const { readingNumber, sentences, activeWordIndex, provisionalWordIndex, activeSentenceIndex, status, message } = useSpeechRecognitionPassage({
    text: link.passage.text,
    active: view === 'record' && recordingState === 'recording',
    readingNumber: 1,
    captureId,
  })

  const updateScrollThumb = useCallback(() => {
    const list = passageListRef.current
    const card = readingCardRef.current
    if (!list || !card) return
    const maxScroll = list.scrollHeight - list.clientHeight
    const thumbTravel = Math.max(0, list.clientHeight - SCROLL_THUMB_HEIGHT)
    const trackTop = list.getBoundingClientRect().top - card.getBoundingClientRect().top - card.clientTop
    setShowScrollThumb(maxScroll > 0)
    setScrollThumbTop(trackTop)
    setScrollThumbOffset(maxScroll > 0 ? list.scrollTop / maxScroll * thumbTravel : 0)
  }, [])

  function handlePassageScroll() {
    updateScrollThumb()
  }

  useEffect(() => {
    passageListRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [captureId, view])

  useEffect(() => {
    if (view !== 'record' || readingNumber !== 2) return
    const list = passageListRef.current
    const secondReading = readingCopyRefs.current[1]
    if (!list || !secondReading) return
    list.scrollTo({ top: secondReading.offsetTop, behavior: 'smooth' })
    window.requestAnimationFrame(updateScrollThumb)
  }, [readingNumber, updateScrollThumb, view])

  useEffect(() => {
    const list = passageListRef.current
    const sentence = activeSentenceRef.current
    if (view !== 'record' || activeSentenceIndex === null || !list || !sentence) return
    const listBounds = list.getBoundingClientRect()
    const sentenceBounds = sentence.getBoundingClientRect()
    if (sentenceBounds.top < listBounds.top || sentenceBounds.bottom > listBounds.bottom) {
      list.scrollTo({ top: list.scrollTop + sentenceBounds.top - listBounds.top - 24, behavior: 'smooth' })
    }
  }, [activeSentenceIndex, view])

  useEffect(() => {
    if (view !== 'record' && view !== 'review') return
    const frameId = window.requestAnimationFrame(updateScrollThumb)
    window.addEventListener('resize', updateScrollThumb)
    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', updateScrollThumb)
    }
  }, [updateScrollThumb, view])

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
          <button className="back-link" type="button" onClick={onBack}>
            <span aria-hidden="true" className='mr-1'>←</span>Back</button>
          <span className="context-pill">Preview Passage</span>
        </div>
        <div className="preview-copy">
          <h1 id="preview-title">{link.passage.title}</h1>
          <p>{link.passage.text}</p>
        </div>
      </section>
    )
  }

  const readings = [1, 2] as const

  return (
    <section className="reading-card" ref={readingCardRef} aria-labelledby="reading-passage-title">
      <div className="reading-card-top">
        {view === 'record' ? <button className="back-link reading-back-link" type="button" onClick={onBackToOverview}><span aria-hidden="true" className="mr-1">←</span>Back</button> : null}
        <h1 className="context-pill reading-card-title" id="reading-passage-title">Reading Passage</h1>
      </div>
      <div
        className="sentence-list"
        ref={passageListRef}
        role="region"
        aria-label="Passage text for two readings"
        tabIndex={0}
        onScroll={handlePassageScroll}
      >
        {readings.map(reading => {
          const isCurrentReading = readingNumber === reading
          return (
            <section
              className="reading-copy"
              aria-label={`Reading ${reading} of 2`}
              key={reading}
              ref={element => { readingCopyRefs.current[reading - 1] = element }}
            >
              <span className="eyebrow">{reading === 1 ? 'Reading 1 of 2' : 'Reading 2 of 2 — read it again'}</span>
              {sentences.map((sentence, index) => {
                const isActiveSentence = isCurrentReading && activeSentenceIndex === index
                const partWordIndices = partProgressWordIndices(sentence.parts)
                const progressWordIndex = isCurrentReading ? provisionalWordIndex ?? activeWordIndex : null
                return (
                  <div
                    className={`sentence-row ${!isCurrentReading ? 'speech-sentence-dim' : activeSentenceIndex === null ? '' : isActiveSentence ? 'speech-sentence-active' : 'speech-sentence-dim'}`}
                    key={index}
                    ref={isActiveSentence ? activeSentenceRef : undefined}
                  >
                    <span className={`sentence-number ${isActiveSentence ? 'active' : ''}`}>{String(index + 1).padStart(2, '0')}</span>
                    <p>{sentence.parts.map((part, partIndex) => {
                      const partWordIndex = partWordIndices[partIndex]
                      const hasBeenRead = isActiveSentence
                        && progressWordIndex !== null
                        && partWordIndex !== null
                        && partWordIndex <= progressWordIndex
                      return <span key={partIndex} className={`speech-part${isActiveSentence ? hasBeenRead ? ' speech-part-read' : ' speech-part-upcoming' : ''}`}>{part.text}</span>
                    })}</p>
                  </div>
                )
              })}
              {isCurrentReading && status !== 'idle' ? <p className={`speech-recognition-status is-${status}`} role="status" aria-live="polite">
                {message ?? (status === 'listening' ? 'Following your reading.' : null)}
              </p> : null}
            </section>
          )
        })}
      </div>
      {showScrollThumb ? <span className="reading-scrollbar-thumb" aria-hidden="true" style={{ top: `${scrollThumbTop}px`, transform: `translateY(${scrollThumbOffset}px)` }} /> : null}
    </section>
  )
}
