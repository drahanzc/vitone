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
  test('contains only PDF, View PDF, Share Report, and Monitor actions for completed assessments', () => {
    const result = renderResult('COMPLETED')
    expect(result.match(/class="admin-report-download"/g)).toHaveLength(4)
    expect(result).toContain('>PDF</span>')
    expect(result).toContain('>View PDF</span>')
    expect(result).toContain('>Share Report</span>')
    expect(result).toContain('>Monitor</span>')
    expect(result).not.toContain('Rerun assessment')
    expect(result).not.toContain('Details</span>')
  })

  test('keeps the same four actions for failed and pending assessments while disabling unavailable PDFs', () => {
    for (const status of ['FAILED', 'CREATED', 'UPLOADING', 'UPLOADED', 'PROCESSING', 'UNKNOWN']) {
      const result = renderResult(status)
      expect(result.match(/class="admin-report-download"/g)).toHaveLength(4)
      expect(result).toContain('>Share Report</span>')
      expect(result).toContain('>Monitor</span>')
      expect(result).toContain('href="/admin/monitor/assessment%2Fid"')
      expect(result).not.toContain('Rerun assessment')
      expect(result.match(/disabled=""/g)).toHaveLength(2)
    }
  })
})
