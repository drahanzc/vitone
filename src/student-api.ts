import { apiUrl, type components } from './api'

export type PublicLink = components['schemas']['PublicLinkResponse']
export type AssessmentSubmissionResponse = components['schemas']['CreatedAssessmentResponse']
export type AssessmentStatus = components['schemas']['AssessmentStatusResponse']
export type StudentReport = components['schemas']['AssessmentReport']
export type ReportItem = components['schemas']['ReportItem']

export type SavedReportSession = {
  assessmentId: string
  assessmentToken: string
  passageTitle: string
}

export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(
    message: string,
    status: number,
    code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), init)

  if (!response.ok) {
    let body: { error?: { code?: string; message?: string } } | undefined
    try {
      body = await response.json() as { error?: { code?: string; message?: string } }
    } catch {
      // A non-JSON error still receives a safe, useful message below.
    }
    throw new ApiError(
      body?.error?.message || 'The request could not be completed. Please try again.',
      response.status,
      body?.error?.code,
    )
  }

  if (response.status === 204) return undefined as T
  return await response.json() as T
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

export function getPublicLink(token: string): Promise<PublicLink> {
  return request(`/public/links/${encodeURIComponent(token)}`)
}

export function submitPublicAssessment(
  linkToken: string,
  body: {
    learnerReference: string
    email?: string
    consentVersion: string
    audio: Blob
  },
  idempotencyKey: string,
): Promise<AssessmentSubmissionResponse> {
  const form = new FormData()
  form.append('learner_reference', body.learnerReference)
  if (body.email) form.append('email', body.email)
  form.append('consent', 'true')
  form.append('consent_version', body.consentVersion)
  form.append('audio', body.audio, audioFilename(body.audio))

  return request(`/public/links/${encodeURIComponent(linkToken)}/assessments`, {
    method: 'POST',
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
    body: form,
  })
}

function audioFilename(audio: Blob): string {
  const mediaType = audio.type.split(';', 1)[0]?.toLowerCase()
  const extension = mediaType === 'audio/mp4'
    ? 'mp4'
    : mediaType === 'audio/ogg'
      ? 'ogg'
      : 'webm'
  return `recording.${extension}`
}

export function getAssessmentStatus(assessmentId: string, token: string): Promise<AssessmentStatus> {
  return request(`/public/assessments/${encodeURIComponent(assessmentId)}/status`, {
    headers: bearer(token),
  })
}

export function getStudentReport(token: string): Promise<StudentReport> {
  return request(`/public/reports/${encodeURIComponent(token)}`)
}

export function studentReportPdfUrl(token: string): string {
  return apiUrl(`/public/reports/${encodeURIComponent(token)}/pdf`)
}

export function saveReportSession(session: SavedReportSession): void {
  try {
    sessionStorage.setItem(`vitone:report:${session.assessmentToken}`, JSON.stringify(session))
  } catch {
    // The assessment token and report details are still held in route state for this visit.
  }
}

export function readReportSession(token: string): SavedReportSession | null {
  try {
    const value = sessionStorage.getItem(`vitone:report:${token}`)
    if (!value) return null
    const saved = JSON.parse(value) as Partial<SavedReportSession>
    if (!saved.assessmentId || !saved.assessmentToken || !saved.passageTitle) return null
    return {
      assessmentId: saved.assessmentId,
      assessmentToken: saved.assessmentToken,
      passageTitle: saved.passageTitle,
    }
  } catch {
    return null
  }
}
