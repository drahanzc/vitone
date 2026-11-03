import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'

const WORD_PATTERN = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu
const MAX_SEARCH_AHEAD = 18
const MAX_SHORT_PHRASE_SEARCH_AHEAD = 8
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
  /** Index of the latest passage word confirmed by a final recognition result. */
  activeWordIndex: number | null
  /** A temporary highlight from interim speech that does not advance the cursor. */
  provisionalWordIndex: number | null
  activeSentenceIndex: number | null
  status: SpeechRecognitionStatus
  message: string | null
  interimTranscript: string
}

interface SpeechRecognitionPassageOptions {
  text: string
  active: boolean
  readingNumber: number
  captureId: string | number
  lang?: string
}

interface RecognitionUiState {
  sessionKey: object
  activeWordIndex: number | null
  provisionalWordIndex: number | null
  status: SpeechRecognitionStatus
  message: string | null
  interimTranscript: string
}

type RecognitionUiChanges = Partial<Omit<RecognitionUiState, 'sessionKey'>>
type RecognitionUiUpdate = RecognitionUiChanges | ((state: RecognitionUiState) => RecognitionUiChanges)

function initialRecognitionUiState(sessionKey: object): RecognitionUiState {
  return {
    sessionKey,
    activeWordIndex: null,
    provisionalWordIndex: null,
    status: 'idle',
    message: null,
    interimTranscript: '',
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
 * transcript alignment. A lone word can match only at the current cursor.
 * Longer transcripts need adjacent matching words, or a three-word alignment
 * with strong coverage, before they can move the cursor ahead.
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
    return expectedWords[cursor] === recognizedWords[0] ? cursor : null
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
  readingNumber,
  captureId,
  lang = 'en-US',
}: SpeechRecognitionPassageOptions): SpeechRecognitionPassage {
  const { sentences, expectedWords } = useMemo(() => buildPassageSentences(text), [text])
  const sessionKey = useMemo(() => ({ captureId, readingNumber, text }), [captureId, readingNumber, text])
  const [recognitionUi, setRecognitionUi] = useState<RecognitionUiState>(() => initialRecognitionUiState(sessionKey))
  const nextExpectedIndexRef = useRef(0)
  const currentUi = recognitionUi.sessionKey === sessionKey
    ? recognitionUi
    : initialRecognitionUiState(sessionKey)
  const Recognition = getSpeechRecognitionConstructor()

  useEffect(() => {
    nextExpectedIndexRef.current = 0
  }, [sessionKey])

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
      updateRecognitionUiState(setRecognitionUi, sessionKey, {
        status: 'listening',
        message: null,
      })
    }

    recognition.onresult = event => {
      if (disposed) return
      let latestInterim = ''
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
        const alignment = alignSpeechResult(expectedWords, transcript, nextExpectedIndexRef.current, true)
        const matchedIndex = alignment.wordIndex
        if (matchedIndex === null) continue
        nextExpectedIndexRef.current = alignment.nextExpectedIndex
        updateRecognitionUiState(setRecognitionUi, sessionKey, current => ({
          activeWordIndex: current.activeWordIndex === null ? matchedIndex : Math.max(current.activeWordIndex, matchedIndex),
        }))
      }
      const provisional = latestInterim
        ? alignSpeechResult(expectedWords, latestInterim, nextExpectedIndexRef.current, false)
        : null
      updateRecognitionUiState(setRecognitionUi, sessionKey, {
        interimTranscript: latestInterim,
        provisionalWordIndex: provisional?.wordIndex ?? null,
      })
    }

    recognition.onerror = event => {
      if (disposed) return
      const errorMessage = recognitionErrorMessage(event.error)
      if (!errorMessage) return
      shouldRestart = false
      updateRecognitionUiState(setRecognitionUi, sessionKey, {
        status: 'error',
        message: errorMessage,
        provisionalWordIndex: null,
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
  }, [active, expectedWords, lang, Recognition, sessionKey])

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
  const provisionalWordIndex = active ? currentUi.provisionalWordIndex : null
  const activeWordIndex = currentUi.activeWordIndex
  const interimTranscript = active ? currentUi.interimTranscript : ''
  const highlightedWordIndex = provisionalWordIndex ?? activeWordIndex
  const activeSentenceIndex = highlightedWordIndex === null
    ? null
    : sentences.findIndex(sentence => sentence.parts.some(part => part.wordIndex === highlightedWordIndex))

  return { sentences, activeWordIndex, provisionalWordIndex, activeSentenceIndex, status, message, interimTranscript }
}
