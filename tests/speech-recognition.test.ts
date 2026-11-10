import { describe, expect, test } from 'bun:test'
import {
  alignSpeechResult,
  alignContinuousTwoReadingResult,
  computeHighlightedSentenceIndex,
  matchRecognizedWords,
  shouldAcceptForwardHighlight,
  selectForwardSentence,
  type PassageSentence,
} from '../src/speech-recognition'

const SENTENCES: PassageSentence[] = [
  {
    text: 'Read this.',
    parts: [
      { text: 'Read', wordIndex: 0, normalizedWord: 'read' },
      { text: ' this.', wordIndex: 1, normalizedWord: 'this' },
    ],
  },
  {
    text: 'Then continue.',
    parts: [
      { text: 'Then', wordIndex: 2, normalizedWord: 'then' },
      { text: ' continue.', wordIndex: 3, normalizedWord: 'continue' },
    ],
  },
  {
    text: 'Now begin.',
    parts: [
      { text: 'Now', wordIndex: 4, normalizedWord: 'now' },
      { text: ' begin.', wordIndex: 5, normalizedWord: 'begin' },
    ],
  },
]

describe('speech sentence highlighting', () => {
  test('pre-zooms the third sentence when the second sentence ends, before it is spoken', () => {
    const completedSentence = alignContinuousTwoReadingResult(
      ['read', 'this', 'then', 'continue', 'now', 'begin'],
      'Then continue.',
      2,
      true,
    )

    expect(completedSentence.nextExpectedIndex).toBe(4)
    expect(computeHighlightedSentenceIndex({
      sentences: SENTENCES,
      cursor: completedSentence.nextExpectedIndex,
      readingNumber: 1,
      expectedWordsLength: 6,
    })).toBe(2)
  })

  test('a unique interim word recovers short cursor lag into the third sentence', () => {
    const expectedWords = ['read', 'this', 'then', 'continue', 'now', 'begin']
    const interim = alignContinuousTwoReadingResult(expectedWords, 'Now', 3, false)

    expect(interim).toEqual({ wordIndex: 4, nextExpectedIndex: 3, provisional: true })
    expect(computeHighlightedSentenceIndex({
      sentences: SENTENCES,
      cursor: interim.wordIndex! + 1,
      readingNumber: 1,
      expectedWordsLength: expectedWords.length,
    })).toBe(2)
  })

  test('a shorter final result does not undo an interim advance to the third sentence', () => {
    const words = ['read', 'this', 'then', 'continue', 'now', 'begin']
    const interim = alignContinuousTwoReadingResult(words, 'then continue now', 2, false)
    const final = alignContinuousTwoReadingResult(words, 'then', 2, true)
    expect(interim.wordIndex).toBe(4)
    expect(final.wordIndex).toBe(2)

    const provisionalSentence = computeHighlightedSentenceIndex({
      sentences: SENTENCES, cursor: interim.wordIndex! + 1, readingNumber: 1, expectedWordsLength: words.length,
    })
    const finalSentence = computeHighlightedSentenceIndex({
      sentences: SENTENCES, cursor: final.nextExpectedIndex, readingNumber: 1, expectedWordsLength: words.length,
    })
    const accepted = shouldAcceptForwardHighlight(
      { readingNumber: 1, wordIndex: interim.wordIndex! },
      { readingNumber: 1, wordIndex: final.wordIndex! },
    )
    expect(provisionalSentence).toBe(2)
    expect(finalSentence).toBe(1)
    expect(selectForwardSentence(provisionalSentence, finalSentence, accepted)).toBe(2)
  })

  test('sentence progression starts at the top of Reading 2 and stays at its end', () => {
    expect(computeHighlightedSentenceIndex({
      sentences: SENTENCES,
      cursor: 6,
      readingNumber: 2,
      expectedWordsLength: 6,
    })).toBe(0)

    expect(computeHighlightedSentenceIndex({
      sentences: SENTENCES,
      cursor: 12,
      readingNumber: 2,
      expectedWordsLength: 6,
    })).toBe(2)
  })
})

describe('speech passage matching', () => {
  test('matches repeated expected words in order without moving backwards', () => {
    const expectedWords = ['we', 'can', 'can', 'go']
    const first = alignSpeechResult(expectedWords, 'We can.', 0, true)
    const repeated = alignSpeechResult(expectedWords, 'can', first.nextExpectedIndex, true)

    expect(first.wordIndex).toBe(1)
    expect(first.nextExpectedIndex).toBe(2)
    expect(repeated.wordIndex).toBe(2)
    expect(repeated.nextExpectedIndex).toBe(3)
    expect(matchRecognizedWords(expectedWords, 'can', 3)).toBeNull()
  })

  test('does not jump on unrelated words or scattered common-word matches', () => {
    const expectedWords = ['we', 'can', 'read', 'the', 'story', 'today']

    expect(matchRecognizedWords(expectedWords, 'rocket satellite', 0)).toBeNull()
    expect(matchRecognizedWords(expectedWords, 'read story', 0)).toBeNull()
    expect(matchRecognizedWords(['go', 'the', 'story', 'the', 'end'], 'the', 0)).toBeNull()
  })

  test('catches up when a strong phrase is ahead of the recognition cursor', () => {
    const expectedWords = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']

    expect(matchRecognizedWords(expectedWords, 'nine ten', 0)).toBe(9)
  })

  test('shows an interim match provisionally without advancing the committed cursor', () => {
    const expectedWords = ['read', 'the', 'passage']
    const interim = alignSpeechResult(expectedWords, 'READ', 0, false)
    const final = alignSpeechResult(expectedWords, 'read', interim.nextExpectedIndex, true)

    expect(interim).toEqual({ wordIndex: 0, nextExpectedIndex: 0, provisional: true })
    expect(final).toEqual({ wordIndex: 0, nextExpectedIndex: 1, provisional: false })
  })

  test('resynchronizes to Reading 2 after a pause near the end of Reading 1', () => {
    const expectedWords = ['read', 'the', 'passage', 'today', 'with', 'care', 'and', 'clear', 'speech', 'every', 'time', 'again']
    const firstReadingCursor = 9
    const secondReading = alignContinuousTwoReadingResult(expectedWords, 'read the', firstReadingCursor, true)

    expect(secondReading.wordIndex).toBe(1)
    expect(secondReading.nextExpectedIndex).toBe(expectedWords.length + 2)
  })

  test('does not let stale highlighting move back within a reading', () => {
    expect(shouldAcceptForwardHighlight(
      { readingNumber: 1, wordIndex: 12 },
      { readingNumber: 1, wordIndex: 8 },
    )).toBe(false)
    expect(shouldAcceptForwardHighlight(
      { readingNumber: 1, wordIndex: 12 },
      { readingNumber: 1, wordIndex: 13 },
    )).toBe(true)
    expect(shouldAcceptForwardHighlight(
      { readingNumber: 1, wordIndex: 12 },
      { readingNumber: 2, wordIndex: 0 },
    )).toBe(true)
  })

  test('aligns a second reading after a pause without resetting on unrelated speech', () => {
    const expectedWords = ['read', 'the', 'passage', 'today']
    const firstReading = alignContinuousTwoReadingResult(expectedWords, 'Read the passage today.', 0, true)

    expect(firstReading).toEqual({ wordIndex: 3, nextExpectedIndex: 4, provisional: false })

    // A pause has no recognition result, so the forward cursor stays at 4.
    const unrelated = alignContinuousTwoReadingResult(expectedWords, 'rocket satellite', firstReading.nextExpectedIndex, true)
    expect(unrelated).toEqual({ wordIndex: null, nextExpectedIndex: 4, provisional: false })

    const secondReadingInterim = alignContinuousTwoReadingResult(expectedWords, 'Read the', unrelated.nextExpectedIndex, false)
    expect(secondReadingInterim).toEqual({ wordIndex: 1, nextExpectedIndex: 4, provisional: true })

    const secondReadingStart = alignContinuousTwoReadingResult(expectedWords, 'Read the', secondReadingInterim.nextExpectedIndex, true)
    expect(secondReadingStart).toEqual({ wordIndex: 1, nextExpectedIndex: 6, provisional: false })

    // Recognition from the first reading cannot rewind the second-reading cursor.
    const outOfOrder = alignContinuousTwoReadingResult(expectedWords, 'Read', secondReadingStart.nextExpectedIndex, true)
    expect(outOfOrder).toEqual({ wordIndex: null, nextExpectedIndex: 6, provisional: false })

    const secondReadingEnd = alignContinuousTwoReadingResult(expectedWords, 'passage today', outOfOrder.nextExpectedIndex, true)
    expect(secondReadingEnd).toEqual({ wordIndex: 3, nextExpectedIndex: 8, provisional: false })
  })
})
