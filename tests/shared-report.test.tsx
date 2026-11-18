import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ReportShareSummary } from '../src/admin/ReportSharing'
import { SharedReportPdfViewer, SharedReportUnavailable } from '../src/screens/SharedReportPage'

describe('shared report presentation', () => {
  test('shows the fetched PDF inline in the shared tab with the browser viewer', () => {
    const html = renderToStaticMarkup(<SharedReportPdfViewer url="blob:shared-report" />)
    expect(html).toContain('<iframe')
    expect(html).toContain('src="blob:shared-report"')
    expect(html).toContain('title="Shared pronunciation report"')
    expect(html).toContain('class="shared-report-pdf"')
    expect(html).not.toContain('target=')
    expect(html).not.toContain('Download PDF')
  })

  test('explains what a current or not-yet-created share link exposes', () => {
    const current = renderToStaticMarkup(<ReportShareSummary share={{
      share_url: 'https://example.test/shared-reports/token',
      created_at: '2026-11-17T00:00:00Z',
      report_generated_at: '2026-11-16T00:00:00Z',
    }} learnerReference="Morgan Lee" canCreate />)
    expect(current).toContain('Morgan Lee’s name and results')
    expect(current).toContain('Link created')
    expect(current).toContain('Report generated')
    expect(current).toContain('updates after each successful assessment rerun')

    const empty = renderToStaticMarkup(<ReportShareSummary share={null} learnerReference="Morgan Lee" canCreate={false} />)
    expect(empty).toContain('Create a read-only link')
    expect(empty).toContain('A completed report is required')
  })

  test('shows friendly revoked-link and temporary PDF errors', () => {
    const html = renderToStaticMarkup(<SharedReportUnavailable kind="invalid" message="This shared report link may have been revoked or may be incorrect." />)
    expect(html).toContain('This report link is unavailable')
    expect(html).toContain('Ask the person who shared it to check that the link is current.')

    const unavailable = renderToStaticMarkup(<SharedReportUnavailable kind="temporary" message="The report PDF is temporarily unavailable. Please try again later." onRetry={() => {}} />)
    expect(unavailable).toContain('temporarily unavailable')
    expect(unavailable).toContain('Try again')
  })
})
