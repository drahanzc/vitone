import { useState, type FormEvent } from 'react'
import type { PublicLink } from '../../student-api'
import { Mascot } from '../StudentChrome'

export function SubmissionModal({
  link,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  link: PublicLink
  busy: boolean
  error: string
  onClose: () => void
  onSubmit: (name: string, email: string) => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [validation, setValidation] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim()) {
      setValidation('Enter your name to continue.')
      return
    }
    if (!consent) {
      setValidation('Please read and accept the consent statement.')
      return
    }
    setValidation('')
    onSubmit(name.trim(), email.trim())
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <section className="submission-modal" role="dialog" aria-modal="true" aria-labelledby="submission-modal-title">
        <button className="modal-close" onClick={onClose} disabled={busy} aria-label="Close">×</button>
        <Mascot />
        <h2 id="submission-modal-title">Stop recording and submit your assessment?</h2>
        <form onSubmit={submit}>
          <label className="visually-hidden" htmlFor="student-name">Your name</label>
          <input id="student-name" value={name} onChange={event => setName(event.target.value)} placeholder="Enter Your Name *" autoComplete="name" maxLength={80} required disabled={busy} />
          <label className="visually-hidden" htmlFor="student-email">Email (optional)</label>
          <input id="student-email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="Email (optional)" autoComplete="email" disabled={busy} />
          <div className="consent-box">
            <p>{link.consent.text}</p>
            <label className="consent-check"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={busy} /><span>I agree to the consent statement above.</span></label>
          </div>
          {validation ? <p className="inline-error" role="alert">{validation}</p> : null}
          {error ? <p className="inline-error" role="alert">{error}</p> : null}
          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Review recording</button>
            <button className="primary-button" type="submit" disabled={busy || !consent}>{busy ? 'Submitting…' : 'Submit'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}
