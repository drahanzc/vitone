import { useCallback, useState } from 'react'
import type { AssessmentLink } from './admin-api'

export function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function statusName(status: string): string {
  const knownLabels: Record<string, string> = {
    ACTIVE: 'Active',
    DISABLED: 'Disabled',
    CREATED: 'Created',
    UPLOADING: 'Uploading',
    UPLOADED: 'Submitted',
    PROCESSING: 'Processing',
    COMPLETED: 'Completed',
    FAILED: 'Failed',
  }
  return knownLabels[status] || status.replaceAll('_', ' ').toLowerCase().replace(/^./, char => char.toUpperCase())
}

export function failureReason(code: string | null | undefined): string {
  if (!code) return 'The failure reason was not recorded.'
  if (code === 'AUDIO_NO_SPEECH') return 'No speech was detected in the recording.'
  return 'Analysis could not be completed.'
}

export type SubmissionFilter = 'all' | 'processing' | 'completed'

export function matchesSubmissionFilter(status: string, filter: SubmissionFilter): boolean {
  if (filter === 'completed') return status === 'COMPLETED'
  if (filter === 'processing') return ['CREATED', 'UPLOADING', 'UPLOADED', 'PROCESSING'].includes(status)
  return true
}

export function statusStyle(status: string): string {
  if (status === 'COMPLETED' || status === 'ACTIVE') return 'is-good'
  if (status === 'FAILED' || status === 'DISABLED') return 'is-bad'
  return 'is-pending'
}

export function isShareableLink(link: AssessmentLink, now: number): boolean {
  return link.status === 'ACTIVE'
    && (!link.expires_at || Date.parse(link.expires_at) > now)
    && (link.max_submissions == null || link.submission_count < link.max_submissions)
}

export async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const input = document.createElement('textarea')
  input.value = value
  input.setAttribute('readonly', '')
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.appendChild(input)
  input.select()
  const copied = document.execCommand('copy')
  input.remove()
  if (!copied) throw new Error('Copy is unavailable in this browser. Select and copy the link manually.')
}

export function useCopyAssessmentLink(setError: (message: string) => void) {
  const [copiedLinkId, setCopiedLinkId] = useState('')

  const copyLink = useCallback(async (link: AssessmentLink) => {
    try {
      await copyText(link.share_url)
      setCopiedLinkId(link.id)
      window.setTimeout(() => {
        setCopiedLinkId(current => current === link.id ? '' : current)
      }, 1800)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The link could not be copied.')
    }
  }, [setError])

  return { copiedLinkId, copyLink }
}
