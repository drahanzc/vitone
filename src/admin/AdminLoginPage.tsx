import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useCenterAuth } from './center-auth-context'
import { Icon } from './AdminPrimitives'
import { HomeIllustration } from '../components/HomeIllustration'

export function AdminLoginPage() {
  const { session, signIn } = useCenterAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (session) navigate('/admin', { replace: true })
  }, [session, navigate])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await signIn(email.trim(), password)
      const returnTo = (location.state as { from?: string } | null)?.from
      navigate(returnTo?.startsWith('/admin') ? returnTo : '/admin', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="admin-login-page">
      <div className="admin-login-art" aria-hidden="true"><HomeIllustration /></div>
      <section className="admin-login-panel" aria-labelledby="admin-login-title">
        <Link className="admin-student-link" to="/">Student page <Icon name="arrow" /></Link>
        <form className="admin-login-card" onSubmit={submit}>
          <div className="admin-login-heading">
            <span className="admin-login-welcome">Welcome Back 👋</span>
            <h1 id="admin-login-title">Sign in to your Center</h1>
            <p>Use the email and password provided for your center account.</p>
          </div>
          <div className="admin-login-fields">
            <div className="admin-login-field">
              <label htmlFor="center-email">Email address</label>
              <input id="center-email" type="email" autoComplete="username" placeholder="Example@email.com" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} />
            </div>
            <div className="admin-login-field">
              <label htmlFor="center-password">Password</label>
              <input id="center-password" type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={event => setPassword(event.target.value)} required />
            </div>
            {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
            <button className="admin-primary-button admin-login-submit" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}
