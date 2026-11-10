import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'

const WORD_PATTERN = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu
const MAX_SEARCH_AHEAD = 24
const MAX_SHORT_PHRASE_SEARCH_AHEAD = 24
const MAX_SECOND_READING_RECOVERY_DISTANCE = 48
const MIN_SECOND_READING_RECOVERY_PROGRESS = 0.75
const MAX_EXPECTED_GAP = 3

export interface PassageTextPart {
  text: string
  wordIndex: number | null
  normalizedWord: string | null
}

export interface PassageSentence {
  text: string
  parts: PassageTextPart[]
}

export type SpeechRecognitionStatus = 'idle' | 'listening' | 'unsupported' | 'error'

export interface SpeechRecognitionPassage {
  sentences: PassageSentence[]
  /** Which copy of the passage is currently being read. */
  readingNumber: 1 | 2
  /** Sentence index the follow indicator should highlight. */
  highlightedSentenceIndex: number | null
  status: SpeechRecognitionStatus
  message: string | null
  interimTranscript: string
}

export interface SpeechRecognitionPassageOptions {
  text: string
  active: boolean
  /** Kept for call-site compatibility; a capture can contain both readings. */
  readingNumber: number
  captureId: string | number
  lang?: string
}

interface RecognitionUiState {
  sessionKey: object
  readingNumber: 1 | 2
  status: SpeechRecognitionStatus
  message: string | null
  interimTranscript: string
  highlightedSentenceIndex: number | null
}

type RecognitionUiChanges = Partial<Omit<RecognitionUiState, 'sessionKey'>>
type RecognitionUiUpdate = RecognitionUiChanges | ((state: RecognitionUiState) => RecognitionUiChanges)

function initialRecognitionUiState(sessionKey: object): RecognitionUiState {
  return {
    sessionKey,
    readingNumber: 1,
    status: 'idle',
    message: null,
    interimTranscript: '',
    highlightedSentenceIndex: null,
  }
}

function updateRecognitionUiState(
  setState: Dispatch<SetStateAction<RecognitionUiState>>,
  sessionKey: object,
  update: RecognitionUiUpdate,
): void {
  setState(current => {
    const currentSession = current.sessionKey === sessionKey ? current : initialRecognitionUiState(sessionKey)
    const changes = typeof update === 'function' ? update(currentSession) : update
    return { ...currentSession, ...changes }
  })
}

interface SpeechRecognitionAlternativeLike {
  transcript: string
  confidence: number
}

interface SpeechRecognitionResultLike extends ArrayLike<SpeechRecognitionAlternativeLike> {
  isFinal: boolean
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string
}

interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onstart: ((event: Event) => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: ((event: Event) => void) | null
  start(): void
  abort(): void
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike
}

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined
  const speechWindow = window as SpeechRecognitionWindow
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
}

function normalizeWord(word: string): string {
  return word
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’]/g, "'")
    .toLocaleLowerCase('en-US')
}

function getWords(text: string): string[] {
  return Array.from(text.matchAll(WORD_PATTERN), match => normalizeWord(match[0]))
}

function passageSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map(sentence => sentence.trim()).filter(Boolean)
}

function buildPassageSentences(text: string): { sentences: PassageSentence[]; expectedWords: string[] } {
  const expectedWords: string[] = []
  const sentences = passageSentences(text).map(sentence => {
    const parts: PassageTextPart[] = []
    let offset = 0
    for (const match of sentence.matchAll(WORD_PATTERN)) {
      const index = match.index ?? offset
      if (index > offset) {
        parts.push({ text: sentence.slice(offset, index), wordIndex: null, normalizedWord: null })
      }
      const normalizedWord = normalizeWord(match[0])
      const wordIndex = expectedWords.length
      expectedWords.push(normalizedWord)
      parts.push({ text: match[0], wordIndex, normalizedWord })
      offset = index + match[0].length
    }
    if (offset < sentence.length) {
      parts.push({ text: sentence.slice(offset), wordIndex: null, normalizedWord: null })
    }
    return { text: sentence, parts }
  })
  return { sentences, expectedWords }
}

/**
 * Finds the last expected passage word supported by a short, forward-only
 * transcript alignment. A lone word can recover a small cursor lag only when
 * it has a unique match in the recovery window. Longer transcripts need
 * adjacent matching words, or a three-word alignment with strong coverage,
 * before they can move the cursor farther ahead.
 */
export function matchRecognizedWords(
  expectedWords: readonly string[],
  transcript: string,
  nextExpectedIndex: number,
): number | null {
  const recognizedWords = getWords(transcript)
  if (recognizedWords.length === 0 || expectedWords.length === 0) return null

  const cursor = Math.max(0, Math.min(nextExpectedIndex, expectedWords.length))
  if (cursor >= expectedWords.length) return null

  if (recognizedWords.length === 1) {
    const searchEnd = Math.min(expectedWords.length, cursor + MAX_EXPECTED_GAP + 1)
    let matchIndex = -1
    for (let index = cursor; index < searchEnd; index += 1) {
      if (expectedWords[index] !== recognizedWords[0]) continue
      if (matchIndex >= 0) return null
      matchIndex = index
    }
    return matchIndex >= 0 ? matchIndex : null
  }

  let best: { lastIndex: number; score: number; firstIndex: number } | null = null
  const startEnd = Math.min(expectedWords.length, cursor + MAX_SEARCH_AHEAD + 1)

  for (let start = cursor; start < startEnd; start += 1) {
    let expectedIndex = start
    let matches = 0
    let skippedExpected = 0
    let skippedRecognized = 0
    let firstIndex = -1
    let lastIndex = -1
    let hasAdjacentPair = false

    for (const recognizedWord of recognizedWords) {
      const searchEnd = Math.min(expectedWords.length, expectedIndex + MAX_EXPECTED_GAP + 1)
      let matchIndex = -1
      for (let index = expectedIndex; index < searchEnd; index += 1) {
        if (expectedWords[index] === recognizedWord) {
          matchIndex = index
          break
        }
      }

      if (matchIndex < 0) {
        skippedRecognized += 1
        continue
      }

      skippedExpected += matchIndex - expectedIndex
      if (firstIndex < 0) firstIndex = matchIndex
      if (lastIndex >= 0 && matchIndex === lastIndex + 1) hasAdjacentPair = true
      lastIndex = matchIndex
      matches += 1
      expectedIndex = matchIndex + 1
    }

    if (matches === 0) continue
    const coverage = matches / recognizedWords.length
    if (matches === 1 && firstIndex > cursor) continue
    if (matches >= 2 && coverage < 0.5) continue
    if (matches >= 2 && !hasAdjacentPair && (matches < 3 || coverage < 0.75)) continue
    if (matches < 3 && firstIndex > cursor + MAX_SHORT_PHRASE_SEARCH_AHEAD) continue
    if (skippedExpected > Math.max(2, Math.floor(matches * 0.75))) continue

    const score = matches * 4 - skippedRecognized * 1.5 - skippedExpected * 0.6 - (firstIndex - cursor) * 0.12
    if (!best || score > best.score || (score === best.score && firstIndex < best.firstIndex)) {
      best = { lastIndex, score, firstIndex }
    }
  }

  return best?.lastIndex ?? null
}

export interface SpeechAlignment {
  wordIndex: number | null
  nextExpectedIndex: number
  provisional: boolean
}

type HighlightPosition = {
  readingNumber: 1 | 2
  wordIndex: number
}

/** Prevents stale recognition results from moving the visible highlight backward. */
export function shouldAcceptForwardHighlight(previous: HighlightPosition | null, candidate: HighlightPosition): boolean {
  return previous === null
    || previous.readingNumber !== candidate.readingNumber
    || candidate.wordIndex >= previous.wordIndex
}

/** Keep a provisional sentence visible when a later final result falls behind it. */
export function selectForwardSentence(
  previousSentence: number | null,
  candidateSentence: number | null,
  acceptedHighlight: boolean,
): number | null {
  return acceptedHighlight ? candidateSentence : previousSentence
}

/** Aligns a result while keeping interim recognition from committing progress. */
export function alignSpeechResult(
  expectedWords: readonly string[],
  transcript: string,
  nextExpectedIndex: number,
  isFinal: boolean,
): SpeechAlignment {
  const matchedWordIndex = matchRecognizedWords(expectedWords, transcript, nextExpectedIndex)
  return {
    wordIndex: matchedWordIndex,
    nextExpectedIndex: isFinal && matchedWordIndex !== null
      ? Math.max(nextExpectedIndex, matchedWordIndex + 1)
      : nextExpectedIndex,
    provisional: !isFinal && matchedWordIndex !== null,
  }
}

/**
 * Aligns a transcript across two consecutive readings of the same passage.
 * The cursor remains forward-only across both readings, while the returned
 * word index maps to the single passage displayed by the UI.
 */
export function alignContinuousTwoReadingResult(
  expectedWords: readonly string[],
  transcript: string,
  nextExpectedIndex: number,
  isFinal: boolean,
): SpeechAlignment {
  if (expectedWords.length === 0) return alignSpeechResult(expectedWords, transcript, nextExpectedIndex, isFinal)

  const twoReadingWords = [...expectedWords, ...expectedWords]

  // If recognition fell behind near the end of Reading 1, a pause can make
  // the first final result of Reading 2 look unrelated to the old cursor. A
  // clear passage-prefix match is safe to use as a boundary resynchronization.
  if (isFinal
    && nextExpectedIndex < expectedWords.length
    && nextExpectedIndex >= expectedWords.length - MAX_SECOND_READING_RECOVERY_DISTANCE
    && nextExpectedIndex >= expectedWords.length * MIN_SECOND_READING_RECOVERY_PROGRESS) {
    const recognizedWords = getWords(transcript)
    const startsAtPassageBeginning = recognizedWords.length >= 2
      && recognizedWords[0] === expectedWords[0]
      && recognizedWords[1] === expectedWords[1]
    if (startsAtPassageBeginning) {
      const secondReadingAlignment = alignSpeechResult(twoReadingWords, transcript, expectedWords.length, true)
      if (secondReadingAlignment.wordIndex !== null) {
        return {
          ...secondReadingAlignment,
          wordIndex: secondReadingAlignment.wordIndex % expectedWords.length,
        }
      }
    }
  }

  const alignment = alignSpeechResult(twoReadingWords, transcript, nextExpectedIndex, isFinal)
  return {
    ...alignment,
    wordIndex: alignment.wordIndex === null ? null : alignment.wordIndex % expectedWords.length,
  }
}

function recognitionErrorMessage(error: string): string {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Live passage highlighting could not get microphone permission. Your recording can continue.'
    case 'audio-capture':
      return 'Live passage highlighting could not access the microphone. Your recording can continue.'
    case 'network':
      return 'Live passage highlighting lost its connection. You can continue reading and recording.'
    case 'language-not-supported':
      return 'Live passage highlighting is not available for this language in your browser.'
    case 'no-speech':
    case 'aborted':
      return ''
    default:
      return 'Live passage highlighting stopped. You can continue reading and recording.'
  }
}

/**
 * Runs browser speech recognition while a recording is active and aligns only
 * final results to the next expected passage words. Recognition is optional:
 * unsupported browsers and permission/service errors leave the recording flow
 * available and return a small status message for the caller to display.
 */
export function useSpeechRecognitionPassage({
  text,
  active,
  captureId,
  lang = 'en-US',
}: SpeechRecognitionPassageOptions): SpeechRecognitionPassage {
  const { sentences, expectedWords } = useMemo(() => buildPassageSentences(text), [text])
  const sessionKey = useMemo(() => ({ captureId, text }), [captureId, text])
  const [recognitionUi, setRecognitionUi] = useState<RecognitionUiState>(() => initialRecognitionUiState(sessionKey))
  const nextExpectedIndexRef = useRef(0)
  const lastHighlightRef = useRef<HighlightPosition | null>(null)
  const currentUi = recognitionUi.sessionKey === sessionKey
    ? recognitionUi
    : initialRecognitionUiState(sessionKey)
  const Recognition = getSpeechRecognitionConstructor()

  useEffect(() => {
    nextExpectedIndexRef.current = 0
    lastHighlightRef.current = null
  }, [sessionKey])

  useEffect(() => {
    updateRecognitionUiState(setRecognitionUi, sessionKey, current => ({
      highlightedSentenceIndex: active || current.highlightedSentenceIndex !== null
        ? computeHighlightedSentenceIndex({
          sentences,
          cursor: nextExpectedIndexRef.current,
          readingNumber: current.readingNumber,
          expectedWordsLength: expectedWords.length,
        })
        : null,
    }))
  }, [active, expectedWords.length, sentences, sessionKey])

  useEffect(() => {
    if (!active || !Recognition || expectedWords.length === 0) return

    let disposed = false
    let shouldRestart = true
    let restartTimer: number | undefined
    let processedResultIndexes = new Set<number>()
    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.lang = lang

    recognition.onstart = () => {
      if (disposed) return
      processedResultIndexes = new Set<number>()
      updateRecognitionUiState(setRecognitionUi, sessionKey, current => ({
        status: 'listening',
        message: null,
        // Pre-zoom to the sentence at the current cursor before the user reads it.
        highlightedSentenceIndex: current.highlightedSentenceIndex ?? computeHighlightedSentenceIndex({
          sentences,
          cursor: nextExpectedIndexRef.current,
          readingNumber: current.readingNumber,
          expectedWordsLength: expectedWords.length,
        }),
      }))
    }

    recognition.onresult = event => {
      if (disposed) return
      let latestInterim = ''
      let enteredSecondReading = false
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const transcript = result?.[0]?.transcript?.trim() ?? ''
        if (!result || !transcript) continue
        if (!result.isFinal) {
          latestInterim = transcript
          continue
        }
        if (processedResultIndexes.has(index)) continue
        processedResultIndexes.add(index)
        const previousExpectedIndex = nextExpectedIndexRef.current
        const alignment = alignContinuousTwoReadingResult(expectedWords, transcript, previousExpectedIndex, true)
        const matchedIndex = alignment.wordIndex
        if (matchedIndex === null) continue
        nextExpectedIndexRef.current = alignment.nextExpectedIndex
        const nextReadingNumber = alignment.nextExpectedIndex >= expectedWords.length ? 2 : 1
        const crossedFirstReading = previousExpectedIndex < expectedWords.length
          && alignment.nextExpectedIndex >= expectedWords.length
        if (crossedFirstReading) {
          enteredSecondReading = true
          // Always begin the second copy at its first word. A recognition result
          // can contain the end of Reading 1 and the start of Reading 2.
          lastHighlightRef.current = { readingNumber: 2, wordIndex: 0 }
          updateRecognitionUiState(setRecognitionUi, sessionKey, {
            readingNumber: 2,
            highlightedSentenceIndex: 0,
          })
          continue
        }
        if (enteredSecondReading) continue
        const acceptedFinalHighlight = shouldAcceptForwardHighlight(
          lastHighlightRef.current,
          { readingNumber: nextReadingNumber, wordIndex: matchedIndex },
        )
        if (acceptedFinalHighlight) {
          lastHighlightRef.current = { readingNumber: nextReadingNumber, wordIndex: matchedIndex }
        }
        const cursor = nextExpectedIndexRef.current
        updateRecognitionUiState(setRecognitionUi, sessionKey, current => ({
          readingNumber: nextReadingNumber,
          highlightedSentenceIndex: selectForwardSentence(
            current.highlightedSentenceIndex,
            computeHighlightedSentenceIndex({
              sentences,
              cursor,
              readingNumber: nextReadingNumber,
              expectedWordsLength: expectedWords.length,
            }),
            acceptedFinalHighlight,
          ),
        }))
      }
      if (enteredSecondReading) {
        updateRecognitionUiState(setRecognitionUi, sessionKey, {
          interimTranscript: latestInterim,
        })
        return
      }
      const provisional = latestInterim
        ? alignContinuousTwoReadingResult(expectedWords, latestInterim, nextExpectedIndexRef.current, false)
        : null
      const provisionalReadingNumber = nextExpectedIndexRef.current >= expectedWords.length ? 2 : 1
      const provisionalWordIndex = provisional?.wordIndex ?? null
      const acceptedProvisionalHighlight = provisionalWordIndex !== null
        && shouldAcceptForwardHighlight(lastHighlightRef.current, {
          readingNumber: provisionalReadingNumber,
          wordIndex: provisionalWordIndex,
        })
      if (acceptedProvisionalHighlight && provisionalWordIndex !== null) {
        lastHighlightRef.current = {
          readingNumber: provisionalReadingNumber,
          wordIndex: provisionalWordIndex,
        }
      }
      updateRecognitionUiState(setRecognitionUi, sessionKey, current => ({
        interimTranscript: latestInterim,
        highlightedSentenceIndex: acceptedProvisionalHighlight && provisionalWordIndex !== null
          ? computeHighlightedSentenceIndex({
            sentences,
            cursor: (provisionalReadingNumber - 1) * expectedWords.length + provisionalWordIndex + 1,
            readingNumber: provisionalReadingNumber,
            expectedWordsLength: expectedWords.length,
          })
          : current.highlightedSentenceIndex,
      }))
    }

    recognition.onerror = event => {
      if (disposed) return
      const errorMessage = recognitionErrorMessage(event.error)
      if (!errorMessage) return
      shouldRestart = false
      updateRecognitionUiState(setRecognitionUi, sessionKey, {
        status: 'error',
        message: errorMessage,
        interimTranscript: '',
      })
    }

    recognition.onend = () => {
      if (disposed || !shouldRestart) return
      restartTimer = window.setTimeout(() => {
        if (disposed || !shouldRestart) return
        try {
          recognition.start()
        } catch {
          shouldRestart = false
          updateRecognitionUiState(setRecognitionUi, sessionKey, {
            status: 'error',
            message: 'Live passage highlighting stopped. You can continue reading and recording.',
          })
        }
      }, 250)
    }

    try {
      recognition.start()
    } catch {
      shouldRestart = false
      window.setTimeout(() => {
        if (disposed) return
        updateRecognitionUiState(setRecognitionUi, sessionKey, {
          status: 'error',
          message: 'Live passage highlighting could not start. You can continue reading and recording.',
        })
      }, 0)
    }

    return () => {
      disposed = true
      shouldRestart = false
      if (restartTimer !== undefined) window.clearTimeout(restartTimer)
      recognition.onstart = null
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      try {
        recognition.abort()
      } catch {
        // The browser may already have stopped this recognition session.
      }
    }
  }, [active, expectedWords, lang, Recognition, sentences, sessionKey])

  const status: SpeechRecognitionStatus = !active
    ? 'idle'
    : !Recognition
      ? 'unsupported'
      : currentUi.status
  const message = !active
    ? null
    : !Recognition
      ? 'Live passage highlighting is not available in this browser. You can still read and record the passage.'
      : currentUi.message
  const interimTranscript = active ? currentUi.interimTranscript : ''

  return {
    sentences,
    readingNumber: currentUi.readingNumber,
    highlightedSentenceIndex: currentUi.highlightedSentenceIndex,
    status,
    message,
    interimTranscript,
  }
}

/**
 * Word index range [start, end] covered by each sentence within one reading.
 * Sentences with no recognized words report [0, -1].
 */
function sentenceWordRanges(sentences: PassageSentence[]): Array<[number, number]> {
  return sentences.map(sentence => {
    const indices = sentence.parts.map(part => part.wordIndex).filter((index): index is number => index !== null)
    return indices.length === 0 ? [0, -1] : [Math.min(...indices), Math.max(...indices)]
  })
}

/**
 * Computes the sentence that should be highlighted for the follow indicator.
 *
 * The cursor (next expected word) drives a Spotify-style pre-zoom: as soon as
 * recognition advances past the last word of the current sentence, the next
 * sentence is highlighted immediately, before the user has spoken a word of it.
 */
export function computeHighlightedSentenceIndex({
  sentences,
  cursor,
  readingNumber,
  expectedWordsLength,
}: {
  sentences: PassageSentence[]
  cursor: number
  readingNumber: 1 | 2
  expectedWordsLength: number
}): number | null {
  if (sentences.length === 0 || expectedWordsLength === 0) return null
  const ranges = sentenceWordRanges(sentences)
  const cursorInReading = cursor - (readingNumber - 1) * expectedWordsLength

  // The cursor identifies the next sentence to read. This advances the
  // highlight as soon as the last word of the current sentence is recognized.
  for (let index = 0; index < ranges.length; index += 1) {
    const [start, end] = ranges[index]
    if (start <= cursorInReading && cursorInReading <= end) return index
  }
  // Cursor is past the end of the passage; keep the last sentence lit.
  return ranges.length - 1
}
