import { afterEach, describe, expect, test } from 'bun:test'
import { ApiError, getPublicSharedReport, getPublicSharedReportPdf } from '../src/student-api'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

describe('public shared report API', () => {
  test('loads the saved report without credentials or cache and supports cancellation', async () => {
    const controller = new AbortController()
    globalThis.fetch = (async (input, init) => {
      expect(String(input)).toContain('/public/shared-reports/opaque%2Ftoken')
      expect(init?.method).toBe('GET')
      expect(init?.credentials).toBe('omit')
      expect(init?.referrerPolicy).toBe('no-referrer')
      expect(init?.cache).toBe('no-store')
      expect(init?.signal).toBe(controller.signal)
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBeNull()
      expect(headers.get('Accept')).toBe('application/json')
      return Response.json({
        learner_reference: 'Learner',
        passage_title: 'A passage',
        generated_at: '2026-11-16T00:00:00Z',
        shared_at: '2026-11-17T00:00:00Z',
        required_readings: 1,
        areas: [],
        items: [],
        examples: {},
        item_labels: {},
      })
    }) as typeof fetch
    const report = await getPublicSharedReport('opaque/token', controller.signal)
    expect(report.learner_reference).toBe('Learner')
    expect(report.item_labels).toEqual({})
  })

  test('downloads a shared PDF anonymously and reports revoked links as 404', async () => {
    globalThis.fetch = (async (input, init) => {
      expect(String(input)).toContain('/public/shared-reports/opaque-token/pdf')
      expect(init?.credentials).toBe('omit')
      expect(init?.referrerPolicy).toBe('no-referrer')
      expect(init?.cache).toBe('no-store')
      expect(new Headers(init?.headers).get('Authorization')).toBeNull()
      expect(new Headers(init?.headers).get('Accept')).toBe('application/pdf')
      return new Response('%PDF-1.7', { headers: { 'Content-Type': 'application/pdf' } })
    }) as typeof fetch
    const pdf = await getPublicSharedReportPdf('opaque-token')
    expect(pdf.type).toBe('application/pdf')
    expect(await pdf.text()).toBe('%PDF-1.7')

    globalThis.fetch = (async () => Response.json({ error: { code: 'NOT_FOUND', message: 'Shared report not found.' } }, { status: 404 })) as typeof fetch
    await expect(getPublicSharedReportPdf('revoked-token')).rejects.toMatchObject({ status: 404 } satisfies Partial<ApiError>)
  })
})
