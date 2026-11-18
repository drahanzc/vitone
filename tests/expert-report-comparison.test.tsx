import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ExpertReportComparison } from '../src/admin/ExpertReportComparison'

const session = { accessToken: 'token', refreshToken: 'refresh', expiresAt: Date.now() + 60_000 }

describe('expert report comparison panel', () => {
  test('explains the local CSV upload and read-only comparison workflow', () => {
    const html = renderToStaticMarkup(<ExpertReportComparison assessmentId="id" learnerReference="Amie" session={session} updateSession={() => {}} />)
    expect(html).toContain('Compare with expert review')
    expect(html).toContain('fixtures/calibration_reports/by_student/')
    expect(html).toContain('1 = correct')
    expect(html).toContain('not uploaded or saved')
    expect(html).toContain('type="file"')
  })
})
