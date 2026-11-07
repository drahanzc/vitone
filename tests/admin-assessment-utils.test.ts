import { describe, expect, test } from 'bun:test'
import { failureReason, matchesSubmissionFilter } from '../src/admin/assessment-utils'

describe('submission filters after a rerun', () => {
  test('moves queued submissions out of completed and into processing', () => {
    expect(matchesSubmissionFilter('COMPLETED', 'completed')).toBe(true)
    expect(matchesSubmissionFilter('UPLOADED', 'completed')).toBe(false)
    expect(matchesSubmissionFilter('UPLOADED', 'processing')).toBe(true)
    expect(matchesSubmissionFilter('PROCESSING', 'processing')).toBe(true)
    expect(matchesSubmissionFilter('COMPLETED', 'processing')).toBe(false)
    expect(matchesSubmissionFilter('FAILED', 'processing')).toBe(false)
    expect(matchesSubmissionFilter('FAILED', 'all')).toBe(true)
  })
})

describe('assessment failure messages', () => {
  test('explains a recording with no detected speech', () => {
    expect(failureReason('AUDIO_NO_SPEECH')).toBe('No speech was detected in the recording.')
  })

  test('does not expose unknown internal codes and handles missing reasons', () => {
    expect(failureReason('INTERNAL_DETAIL')).toBe('Analysis could not be completed.')
    expect(failureReason(null)).toBe('The failure reason was not recorded.')
  })
})
