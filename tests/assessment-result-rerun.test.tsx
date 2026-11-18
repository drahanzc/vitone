import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { SubmissionRow } from '../src/admin/AdminAssessmentsPage'

function renderRow(status: string): string {
  return renderToStaticMarkup(<MemoryRouter><table><tbody><SubmissionRow
    item={{ id: 'student/id', learner_reference: 'Learner', status, created_at: '2026-11-07T00:00:00Z', completed_at: null, headline: [] }}
    session={{ accessToken: 'access', refreshToken: 'refresh', expiresAt: Date.now() + 60_000 }}
    updateSession={() => {}}
    onStatusChange={() => {}}
  /></tbody></table></MemoryRouter>)
}

describe('submission result column', () => {
  test('renders four fixed actions and moves rerun out of the table', () => {
    const html = renderRow('COMPLETED')
    const resultCell = html.slice(html.lastIndexOf('<td>'))
    expect(resultCell.match(/class="admin-report-download"/g)).toHaveLength(4)
    expect(resultCell).toContain('>PDF</span>')
    expect(resultCell).toContain('>View PDF</span>')
    expect(resultCell).toContain('>Share Report</span>')
    expect(resultCell).toContain('>Monitor</span>')
    expect(resultCell).not.toContain('Rerun assessment')
  })

  test('keeps PDF actions disabled until a report is available', () => {
    const html = renderRow('PROCESSING')
    const resultCell = html.slice(html.lastIndexOf('<td>'))
    expect(resultCell.match(/disabled=""/g)).toHaveLength(2)
    expect(resultCell).toContain('href="/admin/monitor/student%2Fid"')
  })
})
