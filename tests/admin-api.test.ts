import { afterEach, describe, expect, test } from 'bun:test'
import { CenterApiError, getCenterReportPdf, getLinkAssessments, getLinkedAssessment, type CenterSession } from '../src/admin/admin-api'

const session: CenterSession = { accessToken: 'access', refreshToken: 'refresh', expiresAt: Date.now() + 3600_000 }
const originalFetch = globalThis.fetch

afterEach(() => { globalThis.fetch = originalFetch })

describe('center assessment API', () => {
  test('requests a completed page with its cursor and bearer token', async () => {
    globalThis.fetch = (async (input, init) => {
      expect(String(input)).toContain('/assessment-links/link/assessments?limit=5&cursor=next&status=COMPLETED')
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer access')
      return Response.json({ items: [], next_cursor: null })
    }) as typeof fetch
    expect(await getLinkAssessments('link', session, () => {}, 'next', 'COMPLETED')).toEqual({ items: [], next_cursor: null })
  })

  test('loads the student email from the authenticated detail endpoint', async () => {
    globalThis.fetch = (async (input, init) => {
      expect(String(input)).toContain('/assessments/student%2Fid')
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer access')
      return Response.json({ id: 'student/id', learner_email: 'student@example.test' })
    }) as typeof fetch
    const detail = await getLinkedAssessment('student/id', session, () => {})
    expect(detail.learner_email).toBe('student@example.test')
  })

  test('downloads PDF bytes with authorization', async () => {
    globalThis.fetch = (async (input, init) => {
      expect(String(input)).toContain('/assessments/student%2Fid/report.pdf')
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe('Bearer access')
      expect(headers.get('Accept')).toBe('application/pdf')
      return new Response('%PDF-1.7', { headers: { 'Content-Type': 'application/pdf' } })
    }) as typeof fetch
    const pdf = await getCenterReportPdf('student/id', session, () => {})
    expect(pdf.type).toBe('application/pdf')
    expect(await pdf.text()).toBe('%PDF-1.7')
  })

  test('refreshes an unauthorized session before retrying a PDF download', async () => {
    let calls = 0
    globalThis.fetch = (async (input, init) => {
      calls++
      if (String(input).endsWith('/auth/refresh')) {
        return Response.json({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 })
      }
      const token = new Headers(init?.headers).get('Authorization')
      if (token === 'Bearer access') return new Response(null, { status: 401 })
      expect(token).toBe('Bearer new-access')
      return new Response('%PDF-1.7', { headers: { 'Content-Type': 'application/pdf' } })
    }) as typeof fetch
    let refreshed: CenterSession | null = null
    const pdf = await getCenterReportPdf('id', session, next => { refreshed = next })
    expect(await pdf.text()).toBe('%PDF-1.7')
    expect(refreshed?.accessToken).toBe('new-access')
    expect(calls).toBe(3)
  })

  test('surfaces PDF endpoint errors', async () => {
    globalThis.fetch = (async () => Response.json({ error: { message: 'Report is not ready.' } }, { status: 409 })) as typeof fetch
    await expect(getCenterReportPdf('id', session, () => {})).rejects.toBeInstanceOf(CenterApiError)
  })
})
