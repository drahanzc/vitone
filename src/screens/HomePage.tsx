import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Brand } from '../components/StudentChrome'
import { HomeIllustration } from '../components/HomeIllustration'

function assessmentTokenFromInput(value: string): string | undefined {
  const segments = value.trim().split('/').filter(Boolean)
  const assessmentIndex = segments.lastIndexOf('a')
  const token = assessmentIndex >= 0 ? segments[assessmentIndex + 1] : segments.at(-1)
  return token || undefined
}

export function HomePage() {
  const [value, setValue] = useState('')
  const navigate = useNavigate()

  function openAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const token = assessmentTokenFromInput(value)
    if (token) navigate(`/a/${encodeURIComponent(token)}`)
  }

  return (
    <div className="student-app home-page">
      <header className="student-header home-header"><Brand /><div className="home-header-links"><Link to="/admin/login" className="center-login-link">Center sign in <span aria-hidden="true">→</span></Link></div></header>
      <main className="home-main">
        <section className="home-card">
          <div className="home-copy">
            <span className="eyebrow">Pronunciation assessment</span>
            <h1>Measure your pronunciation.<br />Master your speech.</h1>
            <p>Open the assessment link shared by your English center to begin.<br />You do not need to create an account.</p>
          </div>
          <HomeIllustration />
          <form className="link-entry" onSubmit={openAssessment}>
            <label htmlFor="assessment-link">Assessment link</label>
            <div className="link-entry-row">
              <input id="assessment-link" value={value} onChange={event => setValue(event.target.value)} placeholder="Paste your assessment link or token" required />
              <button className="primary-button" type="submit">Open assessment</button>
            </div>
          </form>
        </section>
      </main>
    </div>
  )
}
