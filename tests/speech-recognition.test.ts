import { describe, expect, test } from 'bun:test'
import { alignSpeechResult, alignContinuousTwoReadingResult, matchRecognizedWords } from '../src/speech-recognition'

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
  })

  test('shows an interim match provisionally without advancing the committed cursor', () => {
    const expectedWords = ['read', 'the', 'passage']
    const interim = alignSpeechResult(expectedWords, 'READ', 0, false)
    const final = alignSpeechResult(expectedWords, 'read', interim.nextExpectedIndex, true)

    expect(interim).toEqual({ wordIndex: 0, nextExpectedIndex: 0, provisional: true })
    expect(final).toEqual({ wordIndex: 0, nextExpectedIndex: 1, provisional: false })
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
