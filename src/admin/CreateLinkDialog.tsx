import { useState, type SubmitEvent } from 'react'
import { createAssessmentLink, type AssessmentLink, type CreateLinkRequest, type PassageChoice } from './admin-api'
import { useCenterAuth } from './center-auth-context'
import { copyText } from './assessment-utils'
import { Icon } from './AdminPrimitives'

function defaultExpiryDate(): string {
  const date = new Date()
  date.setDate(date.getDate() + 30)
  return formatDateInput(date)
}

function todayDate(): string {
  return formatDateInput(new Date())
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function linkExpiry(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 23, 59, 59).toISOString()
}

export function CreateLinkDialog({
  passage,
  existingLinkCount,
  onClose,
  onCreated,
}: {
  passage: PassageChoice
  existingLinkCount: number
  onClose: () => void
  onCreated: (link: AssessmentLink) => void
}) {
  const { session, updateSession } = useCenterAuth()
  const [title, setTitle] = useState(`${passage.title} Assessment${existingLinkCount ? ` ${existingLinkCount + 1}` : ''}`)
  const [expiresAt, setExpiresAt] = useState(defaultExpiryDate)
  const [minimumExpiryDate] = useState(todayDate)
  const [maxSubmissions, setMaxSubmissions] = useState('40')
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const [created, setCreated] = useState<AssessmentLink | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function markEdited() {
    setIdempotencyKey(crypto.randomUUID())
    setCreated(null)
    setCopied(false)
  }

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!session) return

    const limit = maxSubmissions.trim() === '' ? null : Number(maxSubmissions)
    if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 5000)) {
      setError('Enter a submission limit between 1 and 5,000, or leave it blank for no limit.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const input: CreateLinkRequest = {
        title: title.trim(),
        passage_id: passage.passage_id,
        expires_at: expiresAt ? linkExpiry(expiresAt) : null,
        max_submissions: limit,
      }
      const link = await createAssessmentLink(input, idempotencyKey, session, updateSession)
      setCreated(link)
      onCreated(link)
      try {
        await copyText(link.share_url)
        setCopied(true)
      } catch {
        setCopied(false)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The assessment link could not be created.')
    } finally {
      setBusy(false)
    }
  }

  async function copyCreatedLink() {
    if (!created) return
    try {
      await copyText(created.share_url)
      setCopied(true)
      setError('')
    } catch (cause) {
      setCopied(false)
      setError(cause instanceof Error ? cause.message : 'Copy failed. Select the link and copy it manually.')
    }
  }

  return (
    <div className="admin-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <section className="admin-create-dialog" role="dialog" aria-modal="true" aria-labelledby="create-link-title">
        <button className="admin-dialog-close" type="button" onClick={onClose} aria-label="Close" disabled={busy}><Icon name="close" /></button>
        {!created ? (
          <>
            <span className="admin-eyebrow">ASSESSMENT LIBRARY</span>
            <h2 id="create-link-title">Create an assessment link</h2>
            <p className="admin-dialog-intro">Set up a student link for <strong>{passage.title}</strong>.</p>
            <form className="admin-create-form" onSubmit={submit}>
              <label htmlFor="assessment-title">Assessment name</label>
              <input id="assessment-title" value={title} onChange={event => { setTitle(event.target.value); markEdited() }} maxLength={120} required disabled={busy} />
              <div className="admin-form-two-columns">
                <div>
                  <label htmlFor="assessment-expiry">Link expires</label>
                  <input id="assessment-expiry" type="date" value={expiresAt} min={minimumExpiryDate} onChange={event => { setExpiresAt(event.target.value); markEdited() }} disabled={busy} />
                </div>
                <div>
                  <label htmlFor="assessment-limit">Submission limit</label>
                  <input id="assessment-limit" type="number" min={1} max={5000} value={maxSubmissions} onChange={event => { setMaxSubmissions(event.target.value); markEdited() }} placeholder="No limit" disabled={busy} />
                </div>
              </div>
              <div className="admin-form-note"><span><Icon name="clock" /></span><p>This assessment uses <strong>{passage.word_count} words</strong>. The required number of readings is set by your assessment configuration.</p></div>
              {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
              <div className="admin-dialog-actions">
                <button className="admin-outline-button" type="button" onClick={onClose} disabled={busy}>Cancel</button>
                <button className="admin-primary-button" type="submit" disabled={busy || !title.trim()}>{busy ? 'Creating…' : 'Create and copy link'} <Icon name="link" /></button>
              </div>
            </form>
          </>
        ) : (
          <>
            <span className="admin-created-check"><Icon name="check" /></span>
            <span className="admin-eyebrow">LINK READY</span>
            <h2 id="create-link-title">Your assessment link is ready</h2>
            <p className="admin-dialog-intro">{created.title} · {created.required_readings} required {created.required_readings === 1 ? 'reading' : 'readings'}</p>
            <label className="admin-share-url-label" htmlFor="created-share-url">Share this link with your students</label>
            <input className="admin-share-url-input" id="created-share-url" readOnly value={created.share_url} onFocus={event => event.currentTarget.select()} />
            <p className={`admin-copy-feedback ${copied ? 'is-visible' : ''}`} role="status">{copied ? 'Copied to clipboard.' : 'Copy the link, or select it above.'}</p>
            {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
            <div className="admin-dialog-actions">
              <button className="admin-outline-button" type="button" onClick={onClose}>Done</button>
              <button className="admin-primary-button" type="button" onClick={() => void copyCreatedLink()}><Icon name="link" /> Copy Link</button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
