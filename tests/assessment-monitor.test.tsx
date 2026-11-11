import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AssessmentMonitor } from '../src/admin/AssessmentMonitor'
import type { getLinkedAssessment } from '../src/admin/admin-api'

const session = { accessToken: 'token', refreshToken: 'refresh', expiresAt: Date.now() + 60_000 }

describe('assessment monitor', () => {
  test('replaces the rerun action with a monitor for failed assessments', () => {
    const html = renderToStaticMarkup(<AssessmentMonitor item={{ id: 'id', learner_reference: 'Learner', status: 'FAILED', created_at: '', completed_at: null, headline: [] }} detail={null} session={session} updateSession={() => {}} onQueued={() => {}} />)
    expect(html).toContain('Monitor assessment')
    expect(html).not.toContain('Rerun assessment')
    expect(html).toContain('aria-expanded="false"')
  })

  test('shows numbered failed steps and a checkpoint resume action', () => {
    const detail: Awaited<ReturnType<typeof getLinkedAssessment>> = {
      id: 'id', learner_reference: 'Learner', learner_email: null,
      status: 'FAILED', failure_code: null, failure_message: 'Analysis could not be completed.',
      created_at: '2026-11-11T08:22:22Z', submitted_at: null, completed_at: null,
      readings: [], summary: null,
      checkpoints: [{ step: 4, label: 'Extract pYIN pitch', reading_index: 1, status: 'FAILED', executions: 2,
        error_summary: 'Python executable was not found <private>', retryable: false,
        started_at: '2026-11-11T08:22:22Z', completed_at: '2026-11-11T08:22:23Z' }],
    }
    const html = renderToStaticMarkup(<AssessmentMonitor expanded item={{ ...detail, headline: [] }} detail={detail} session={session} updateSession={() => {}} onQueued={() => {}} />)
    expect(html).toContain('[step-4]: Extract pYIN pitch')
    expect(html).toContain('Reading 1')
    expect(html).toContain('Executions: 2')
    expect(html).toContain('Python executable was not found &lt;private&gt;')
    expect(html).toContain('Repair the recording or worker configuration')
    expect(html).toContain('Retry assessment')
    expect(html).not.toContain('Rerun assessment')
  })

  test('historical completed assessments do not offer checkpoint retries', () => {
    const html = renderToStaticMarkup(<AssessmentMonitor expanded item={{ id: 'id', learner_reference: 'Learner', status: 'COMPLETED', created_at: '', completed_at: null, headline: [] }} detail={null} session={session} updateSession={() => {}} onQueued={() => {}} />)
    expect(html).toContain('No step checkpoints have been recorded')
    expect(html).not.toContain('Retry assessment</button>')
  })
})
