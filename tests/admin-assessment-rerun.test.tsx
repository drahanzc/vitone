import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { SubmissionRow } from '../src/admin/AdminAssessmentsPage'
import type { AssessmentListItem } from '../src/admin/admin-api'

function renderResult(status: string): string {
  const item: AssessmentListItem = {
    id: 'assessment/id', learner_reference: 'Fixture learner', status,
    created_at: '2026-11-07T00:00:00Z', completed_at: null, headline: [],
  }
  const html = renderToStaticMarkup(<MemoryRouter><table><tbody>
    <SubmissionRow item={item}
      session={{ accessToken: 'access', refreshToken: 'refresh', expiresAt: 0 }}
      updateSession={() => {}} onStatusChange={() => {}} />
  </tbody></table></MemoryRouter>)
  return html.split('<td>').at(-1)!.split('</td>')[0]
}

describe('admin assessment Result column', () => {
  test('offers saved-response reruns alongside completed report actions', () => {
    const result = renderResult('COMPLETED')
    expect(result).toContain('Rerun assessment</button>')
    expect(result).toContain('aria-label="Rerun assessment for Fixture learner"')
    expect(result).toContain('Download PDF report')
    expect(result).toContain('View result details')
    expect(result).not.toContain('Troubleshoot')
  })

  test('offers reruns alongside troubleshooting for failed assessments', () => {
    const result = renderResult('FAILED')
    expect(result).toContain('Rerun assessment</button>')
    expect(result).toContain('/admin/assessments/assessment%2Fid/monitor')
    expect(result).toContain('Troubleshoot')
    expect(result).not.toContain('Download PDF report')
  })

  test('does not offer reruns while an assessment is queued or processing', () => {
    for (const status of ['CREATED', 'UPLOADING', 'UPLOADED', 'PROCESSING', 'UNKNOWN']) {
      expect(renderResult(status)).toBe('—')
    }
  })
})
