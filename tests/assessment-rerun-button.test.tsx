import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AssessmentRerunButton, RerunConfirmation } from '../src/admin/AssessmentRerunButton'
import type { AssessmentListItem } from '../src/admin/admin-api'
import { initialRerunState, rerunStateReducer } from '../src/admin/rerun-state'

function render(status: string): string {
  const item: AssessmentListItem = {
    id: 'submission-id', learner_reference: 'Learner <one>', status,
    created_at: '2026-11-07T00:00:00Z', completed_at: null, headline: [],
  }
  return renderToStaticMarkup(<AssessmentRerunButton
    item={item}
    session={{ accessToken: 'access', refreshToken: 'refresh', expiresAt: 0 }}
    updateSession={() => {}}
    onQueued={() => {}}
  />)
}

describe('assessment rerun button', () => {
  test('offers reruns for completed and failed submissions', () => {
    for (const status of ['COMPLETED', 'FAILED']) {
      const html = render(status)
      expect(html).toContain('Rerun assessment</button>')
      expect(html).toContain('aria-label="Rerun assessment for Learner &lt;one&gt;"')
      expect(html).not.toContain('Confirm rerun')
    }
  })

  test('clears confirmation after queueing so a completed rerun starts fresh', () => {
    const confirming = rerunStateReducer(initialRerunState, { type: 'confirm' })
    const pending = rerunStateReducer(confirming, { type: 'start' })
    expect(pending).toEqual({ confirming: true, busy: true, error: '', rebuildWordAlignment: false })
    const queued = rerunStateReducer(pending, { type: 'queued' })
    expect(queued).toEqual(initialRerunState)
    expect(rerunStateReducer(queued, { type: 'confirm' }).confirming).toBe(true)
  })

  test('keeps confirmation and displays errors if queueing fails', () => {
    const pending = rerunStateReducer(rerunStateReducer(initialRerunState, { type: 'confirm' }), { type: 'start' })
    const failed = rerunStateReducer(pending, { type: 'failed', message: 'Try again' })
    expect(failed).toEqual({ confirming: true, busy: false, error: 'Try again', rebuildWordAlignment: false })
    expect(rerunStateReducer(failed, { type: 'cancel' })).toEqual(initialRerunState)
  })

  test('keeps rerun confirmation limited to rescoring saved results', () => {
    const html = renderToStaticMarkup(<RerunConfirmation busy={false} rebuildWordAlignment={false} onRebuildChange={() => {}} onConfirm={() => {}} onCancel={() => {}} />)
    expect(html).not.toContain('type="checkbox"')
    expect(html).toContain('Recalculate scoring using the saved Azure results')
    expect(html).toContain('without calling Azure again')
  })

  test('preserves the rebuild choice on errors, locks it while pending, and resets it on cancel or success', () => {
    const confirmed = rerunStateReducer(initialRerunState, { type: 'confirm' })
    const selected = rerunStateReducer(confirmed, { type: 'set-rebuild', value: true })
    const pending = rerunStateReducer(selected, { type: 'start' })
    expect(rerunStateReducer(pending, { type: 'set-rebuild', value: false })).toEqual(pending)
    expect(rerunStateReducer(pending, { type: 'cancel' })).toEqual(pending)
    const failed = rerunStateReducer(pending, { type: 'failed', message: 'Try again' })
    expect(failed.rebuildWordAlignment).toBe(true)
    expect(rerunStateReducer(failed, { type: 'cancel' })).toEqual(initialRerunState)
    expect(rerunStateReducer(pending, { type: 'queued' })).toEqual(initialRerunState)
  })

  test('does not offer reruns for queued, running, or unknown statuses', () => {
    for (const status of ['CREATED', 'UPLOADING', 'UPLOADED', 'PROCESSING', 'UNKNOWN']) {
      expect(render(status)).toBe('')
    }
  })
})
