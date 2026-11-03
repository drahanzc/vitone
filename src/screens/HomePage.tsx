import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { PASSAGE_ART } from '../app/types'
import { Brand } from '../components/StudentChrome'

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
    <div className="student-app">
      <header className="student-header home-header"><Brand /><div className="home-header-links"><Link to="/admin/login" className="center-login-link">Center sign in <span aria-hidden="true">→</span></Link><span className="header-context">Student assessment</span></div></header>
      <main className="home-main">
        <section className="home-card">
          <div className="home-copy">
            <span className="eyebrow">Pronunciation assessment</span>
            <h1>Practice your reading. <span className="home-heading-nowrap">Understand your progress.</span></h1>
            <p>Open the assessment link shared by your English center to begin. You do not need to create an account.</p>
            <form className="link-entry" onSubmit={openAssessment}>
              <label htmlFor="assessment-link">Assessment link</label>
              <div className="link-entry-row">
                <input id="assessment-link" value={value} onChange={event => setValue(event.target.value)} placeholder="Paste your assessment link or token" required />
                <button className="primary-button" type="submit">Open assessment <span aria-hidden="true">→</span></button>
              </div>
            </form>
          </div>
          <div className="home-art" aria-hidden="true"><img src={PASSAGE_ART} alt="" /></div>
        </section>
      </main>
    </div>
  )
}
