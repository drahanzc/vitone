import { afterEach, describe, expect, test } from 'bun:test'
import { CenterApiError, getAssessmentResultDetails, getCenterReportPdf, getLinkAssessments, getLinkedAssessment, rerunAssessment, type CenterSession } from '../src/admin/admin-api'

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

  test('queues rescoring using an authenticated POST with an encoded submission ID', async () => {
    globalThis.fetch = (async (input, init) => {
      expect(String(input)).toContain('/assessments/student%2Fid/rerun')
      expect(init?.method).toBe('POST')
      expect(init?.body).toBeUndefined()
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer access')
      return Response.json({ id: 'student/id', status: 'UPLOADED', completed_at: null }, { status: 202 })
    }) as typeof fetch
    const queued = await rerunAssessment('student/id', session, () => {})
    expect(queued.status).toBe('UPLOADED')
    expect(queued.completed_at).toBeNull()
  })

  test('surfaces rerun conflicts without automatically submitting another rerun', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      return Response.json({ error: { code: 'CONFLICT', message: 'Assessment is already processing.' } }, { status: 409 })
    }) as typeof fetch
    try {
      await rerunAssessment('id', session, () => {})
      throw new Error('Expected a conflict')
    } catch (error) {
      expect(error).toBeInstanceOf(CenterApiError)
      expect((error as CenterApiError).status).toBe(409)
      expect((error as Error).message).toBe('Assessment is already processing.')
    }
    expect(calls).toBe(1)
  })

  test('refreshes an expired authorization before queuing a rerun', async () => {
    const paths: string[] = []
    globalThis.fetch = (async (input, init) => {
      paths.push(String(input))
      if (String(input).endsWith('/auth/refresh')) {
        return Response.json({ access_token: 'rerun-access', refresh_token: 'rerun-refresh', expires_in: 3600 })
      }
      expect(init?.method).toBe('POST')
      const token = new Headers(init?.headers).get('Authorization')
      if (token === 'Bearer access') return new Response(null, { status: 401 })
      expect(token).toBe('Bearer rerun-access')
      return Response.json({ id: 'id', status: 'UPLOADED' }, { status: 202 })
    }) as typeof fetch
    let refreshed: CenterSession | null = null
    expect((await rerunAssessment('id', session, value => { refreshed = value })).status).toBe('UPLOADED')
    expect(refreshed?.accessToken).toBe('rerun-access')
    expect(paths).toHaveLength(3)
  })

  test('loads the student email from the authenticated detail endpoint', async () => {
    globalThis.fetch = (async (input, init) => {
      expect(String(input)).toContain('/assessments/student%2Fid')
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer access')
      expect(init?.cache).toBe('no-store')
      return Response.json({ id: 'student/id', learner_email: 'student@example.test' })
    }) as typeof fetch
    const detail = await getLinkedAssessment('student/id', session, () => {})
    expect(detail.learner_email).toBe('student@example.test')
  })

  test('loads per-reading errors with authorization, encoded paging, and cancellation', async () => {
    const controller = new AbortController()
    globalThis.fetch = (async (input, init) => {
      const url = new URL(String(input), 'http://localhost')
      expect(url.pathname).toContain('/assessments/student%2Fid/results')
      expect(url.searchParams.get('reading_index')).toBe('2')
      expect(url.searchParams.get('limit')).toBe('50')
      expect(url.searchParams.get('cursor')).toBe('opaque+/cursor')
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer access')
      expect(init?.signal).toBe(controller.signal)
      return Response.json({ assessment_id: 'student/id', readings: [{ reading_index: 2, details_available: true }], errors: [], next_cursor: null })
    }) as typeof fetch
    const details = await getAssessmentResultDetails('student/id', session, () => {}, { readingIndex: 2, cursor: 'opaque+/cursor', signal: controller.signal })
    expect(details.readings[0]?.reading_index).toBe(2)
    expect(details.errors).toEqual([])
  })

  test('the all-readings request omits the reading filter and surfaces unavailable results', async () => {
    globalThis.fetch = (async (input) => {
      expect(String(input)).not.toContain('reading_index')
      return Response.json({ error: { code: 'REPORT_NOT_READY', message: 'Report is not ready.' } }, { status: 409 })
    }) as typeof fetch
    await expect(getAssessmentResultDetails('id', session, () => {})).rejects.toBeInstanceOf(CenterApiError)
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
