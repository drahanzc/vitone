import { apiUrl, type components } from '../api'

const SESSION_KEY = 'vitone:center-session'
const REFRESH_BEFORE_EXPIRY_MS = 45_000

export type CenterSession = {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export type CenterProfile = components['schemas']['MeResponse']
export type PassageChoice = components['schemas']['PassageChoice']
export type AssessmentLink = components['schemas']['AssessmentLinkResponse']
export type AssessmentListItem = components['schemas']['AssessmentListItem']
export type AssessmentPage = components['schemas']['AssessmentPage']
export type CreateLinkRequest = components['schemas']['CreateLinkRequest']
export type AssessmentResultDetails = components['schemas']['AssessmentResultDetails']

export class CenterApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'CenterApiError'
    this.status = status
    this.code = code
  }
}

let refreshInFlight: Promise<CenterSession> | null = null

function readError(response: Response): Promise<CenterApiError> {
  return response.json().then((body: unknown) => {
    const error = body as { error?: { code?: string; message?: string } }
    return new CenterApiError(
      error.error?.message || 'The request could not be completed. Please try again.',
      response.status,
      error.error?.code,
    )
  }).catch(() => new CenterApiError('The request could not be completed. Please try again.', response.status))
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), init)
  if (!response.ok) throw await readError(response)
  if (response.status === 204) return undefined as T
  return await response.json() as T
}

export function readCenterSession(): CenterSession | null {
  try {
    const value = sessionStorage.getItem(SESSION_KEY)
    if (!value) return null
    const session = JSON.parse(value) as Partial<CenterSession>
    if (
      typeof session.accessToken !== 'string'
      || typeof session.refreshToken !== 'string'
      || typeof session.expiresAt !== 'number'
    ) return null
    return session as CenterSession
  } catch {
    return null
  }
}

export function writeCenterSession(session: CenterSession | null): void {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // The in-memory session remains available for this tab if storage is blocked.
  }
}

function sessionFromTokens(tokens: components['schemas']['AuthTokensResponse']): CenterSession {
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  }
}

export async function loginCenter(email: string, password: string): Promise<CenterSession> {
  const tokens = await jsonRequest<components['schemas']['AuthTokensResponse']>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password } satisfies components['schemas']['LoginRequest']),
  })
  const session = sessionFromTokens(tokens)
  writeCenterSession(session)
  return session
}

async function refreshCenterSession(session: CenterSession): Promise<CenterSession> {
  const stored = readCenterSession()
  if (stored && stored.refreshToken !== session.refreshToken) return stored
  if (refreshInFlight) return refreshInFlight

  const pending = jsonRequest<components['schemas']['AuthTokensResponse']>('/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  }).then(sessionFromTokens)
  refreshInFlight = pending
  try {
    const refreshed = await pending
    writeCenterSession(refreshed)
    return refreshed
  } finally {
    if (refreshInFlight === pending) refreshInFlight = null
  }
}

export async function getFreshCenterSession(
  session: CenterSession,
  onSessionChange: (session: CenterSession | null) => void,
): Promise<CenterSession> {
  const stored = readCenterSession()
  const current = stored ?? session
  if (current.expiresAt > Date.now() + REFRESH_BEFORE_EXPIRY_MS) return current
  try {
    const refreshed = await refreshCenterSession(current)
    onSessionChange(refreshed)
    return refreshed
  } catch (error) {
    writeCenterSession(null)
    onSessionChange(null)
    throw error
  }
}

async function centerFetch(
  path: string,
  session: CenterSession,
  onSessionChange: (session: CenterSession | null) => void,
  init?: RequestInit,
): Promise<Response> {
  let current = await getFreshCenterSession(session, onSessionChange)

  const send = (accessToken: string) => {
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${accessToken}`)
    if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    return fetch(apiUrl(path), { ...init, headers })
  }

  let response = await send(current.accessToken)
  if (response.status === 401) {
    try {
      current = await refreshCenterSession(current)
      onSessionChange(current)
      response = await send(current.accessToken)
    } catch (error) {
      writeCenterSession(null)
      onSessionChange(null)
      throw error
    }
  }
  if (response.status === 401) {
    writeCenterSession(null)
    onSessionChange(null)
  }
  if (!response.ok) throw await readError(response)
  return response
}

export async function centerRequest<T>(
  path: string,
  session: CenterSession,
  onSessionChange: (session: CenterSession | null) => void,
  init?: RequestInit,
): Promise<T> {
  const response = await centerFetch(path, session, onSessionChange, init)
  if (response.status === 204) return undefined as T
  return await response.json() as T
}

export async function getCenterReportPdf(
  assessmentId: string,
  session: CenterSession,
  onSessionChange: (session: CenterSession | null) => void,
): Promise<Blob> {
  const response = await centerFetch(`/assessments/${encodeURIComponent(assessmentId)}/report.pdf`, session, onSessionChange, {
    headers: { Accept: 'application/pdf' },
  })
  return response.blob()
}

export function getAssessmentResultDetails(
  assessmentId: string,
  session: CenterSession,
  onSessionChange: (session: CenterSession | null) => void,
  options: { readingIndex?: number; cursor?: string; signal?: AbortSignal } = {},
): Promise<AssessmentResultDetails> {
  const query = new URLSearchParams({ limit: '50' })
  if (options.readingIndex !== undefined) query.set('reading_index', String(options.readingIndex))
  if (options.cursor) query.set('cursor', options.cursor)
  return centerRequest(`/assessments/${encodeURIComponent(assessmentId)}/results?${query.toString()}`, session, onSessionChange, {
    headers: { Accept: 'application/json' },
    signal: options.signal,
  })
}

export async function revokeCenterSession(
  session: CenterSession,
  onSessionChange: (session: CenterSession | null) => void,
): Promise<void> {
  const current = await getFreshCenterSession(session, onSessionChange)
  await centerRequest<void>('/auth/logout', current, onSessionChange, {
    method: 'POST',
    body: JSON.stringify({ refresh_token: current.refreshToken } satisfies components['schemas']['LogoutRequest']),
  })
}

export function getCenterProfile(
  session: CenterSession,
  onSessionChange: (session: CenterSession | null) => void,
): Promise<CenterProfile> {
  return centerRequest('/me', session, onSessionChange)
}

export function getPassages(
  session: CenterSession,
  onSessionChange: (session: CenterSession | null) => void,
): Promise<PassageChoice[]> {
  return centerRequest<components['schemas']['PassageChoicePage']>('/passages', session, onSessionChange).then(page => page.items)
}

export async function getAssessmentLinks(
  session: CenterSession,
  onSessionChange: (session: CenterSession | null) => void,
): Promise<AssessmentLink[]> {
  const links: AssessmentLink[] = []
  const seenCursors = new Set<string>()
  let cursor: string | undefined
  do {
    const query = new URLSearchParams({ limit: '100' })
    if (cursor) query.set('cursor', cursor)
    const page = await centerRequest<components['schemas']['AssessmentLinkPage']>(`/assessment-links?${query.toString()}`, session, onSessionChange)
    links.push(...page.items)
    cursor = page.next_cursor || undefined
    if (cursor && seenCursors.has(cursor)) break
    if (cursor) seenCursors.add(cursor)
  } while (cursor)
  return links
}

export function getLinkAssessments(
  linkId: string,
  session: CenterSession,
  onSessionChange: (session: CenterSession | null) => void,
  cursor?: string,
  status?: 'COMPLETED',
): Promise<AssessmentPage> {
  const query = new URLSearchParams({ limit: '5' })
  if (cursor) query.set('cursor', cursor)
  if (status) query.set('status', status)
  return centerRequest(`/assessment-links/${encodeURIComponent(linkId)}/assessments?${query.toString()}`, session, onSessionChange)
}

export function rerunAssessment(
  assessmentId: string,
  session: CenterSession,
  onSessionChange: (session: CenterSession | null) => void,
): Promise<components['schemas']['Assessment']> {
  return centerRequest(`/assessments/${encodeURIComponent(assessmentId)}/rerun`, session, onSessionChange, {
    method: 'POST',
  })
}

export function getLinkedAssessment(
  assessmentId: string,
  session: CenterSession,
  onSessionChange: (session: CenterSession | null) => void,
): Promise<components['schemas']['LinkedAssessmentDetailResponse']> {
  return centerRequest(`/assessments/${encodeURIComponent(assessmentId)}`, session, onSessionChange, {
    cache: 'no-store',
  })
}

export function createAssessmentLink(
  input: CreateLinkRequest,
  idempotencyKey: string,
  session: CenterSession,
  onSessionChange: (session: CenterSession | null) => void,
): Promise<AssessmentLink> {
  return centerRequest('/assessment-links', session, onSessionChange, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  })
}
