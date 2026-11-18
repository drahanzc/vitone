import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AssessmentResultDetailsPanel } from '../src/admin/AssessmentResultDetails'

test('report findings panel includes the assessment reference and investigator guidance', () => {
  const html = renderToStaticMarkup(<AssessmentResultDetailsPanel assessmentId="assessment/id" learnerReference="Learner"
    session={{ accessToken: 'token', refreshToken: 'refresh', expiresAt: Date.now() + 60_000 }}
    updateSession={() => {}} />)
  expect(html).toContain('Report findings · Learner')
  expect(html).toContain('Review confirmed findings, uncertain evidence, saved bands, and detector reasons')
  expect(html).toContain('Loading result details…')
})
