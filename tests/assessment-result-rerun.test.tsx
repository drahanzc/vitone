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

describe('submission result column rerun', () => {
  test('completed results include rerun alongside report actions in the last cell', () => {
    const html = renderRow('COMPLETED')
    const resultCell = html.slice(html.lastIndexOf('<td>'))
    expect(resultCell).toContain('PDF')
    expect(resultCell).toContain('Details')
    expect(resultCell).toContain('aria-label="Rerun assessment for Learner"')
  })

  test('failed results include both troubleshooting and scoring-only rerun', () => {
    const html = renderRow('FAILED')
    const resultCell = html.slice(html.lastIndexOf('<td>'))
    expect(resultCell).toContain('/admin/assessments/student%2Fid/monitor')
    expect(resultCell).toContain('Rerun assessment</button>')
  })

  test('draft and in-progress results do not offer rerun', () => {
    for (const status of ['CREATED', 'UPLOADING', 'UPLOADED', 'PROCESSING']) {
      expect(renderRow(status)).not.toContain('Rerun assessment')
    }
  })
})
