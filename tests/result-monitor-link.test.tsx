import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { AssessmentResultDetailsDialog } from '../src/admin/AssessmentResultDetailsDialog'

test('result details links to the current assessment monitor', () => {
  const html = renderToStaticMarkup(<MemoryRouter>
    <AssessmentResultDetailsDialog assessmentId="assessment/id" learnerReference="Learner"
      session={{ accessToken: 'token', refreshToken: 'refresh', expiresAt: Date.now() + 60_000 }}
      updateSession={() => {}} onClose={() => {}} />
  </MemoryRouter>)
  expect(html).toContain('href="/admin/assessments/assessment%2Fid/monitor"')
  expect(html).toContain('Monitor / Troubleshoot</a>')
})
