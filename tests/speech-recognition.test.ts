import { describe, expect, test } from 'bun:test'
import { alignSpeechResult, matchRecognizedWords } from '../src/speech-recognition'

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
})
