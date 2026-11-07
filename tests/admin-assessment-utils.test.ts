import { describe, expect, test } from 'bun:test'
import { failureReason } from '../src/admin/assessment-utils'

describe('assessment failure messages', () => {
  test('explains a recording with no detected speech', () => {
    expect(failureReason('AUDIO_NO_SPEECH')).toBe('No speech was detected in the recording.')
  })

  test('does not expose unknown internal codes and handles missing reasons', () => {
    expect(failureReason('INTERNAL_DETAIL')).toBe('Analysis could not be completed.')
    expect(failureReason(null)).toBe('The failure reason was not recorded.')
  })
})
