import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { BRAND_MARK } from '../app/types'

export function Brand() {
  return (
    <Link className="brand" to="/" aria-label="Vitone student home">
      <span className="brand-mark" aria-hidden="true">
        <img src={BRAND_MARK} alt="" />
      </span>
      <span>Vitone</span>
    </Link>
  )
}

export function StudentHeader({ activeStep, showInfo = false }: {
  activeStep: 1 | 2 | 3
  showInfo?: boolean
}) {
  return (
    <header className={`student-header ${showInfo ? 'student-header-assessment' : ''}`}>
      <Brand />
      <nav className="stepper" aria-label="Assessment progress">
        {(['Overview', 'Record', 'Submit'] as const).map((label, index) => {
          const step = (index + 1) as 1 | 2 | 3
          return (
            <div className={`stepper-step ${activeStep === step ? 'is-active' : ''} ${activeStep > step ? 'is-complete' : ''}`} key={label}>
              <span className="step-number">{String(step).padStart(2, '0')}</span>
              <span>{label}</span>
            </div>
          )
        })}
      </nav>
      {/* {showInfo ? <span className="header-note" title="Read the passage twice in one recording before submitting."><img src="/assets/student-assessment-info.svg" alt="Assessment information" /></span> : null} */}
    </header>
  )
}

export function LoadingScreen({ label = 'Opening your assessment…' }: { label?: string }) {
  return (
    <main className="loading-screen" aria-live="polite">
      <span className="loading-ring" aria-hidden="true" />
      <p>{label}</p>
    </main>
  )
}

export function MessageScreen({ title, message, action }: {
  title: string
  message: string
  action?: ReactNode
}) {
  return (
    <main className="message-screen">
      <section className="message-card">
        <span className="eyebrow">Vitone student</span>
        <h1>{title}</h1>
        <p>{message}</p>
        {action}
      </section>
    </main>
  )
}

export function Mascot() {
  return (
    <div className="mascot" aria-hidden="true">
      <span className="mascot-glow" />
      <span className="mascot-core"><img className="mascot-gloss" src="/assets/mascot-gloss.svg" alt="" /><img className="mascot-eye mascot-eye-left" src="/assets/mascot-eye.svg" alt="" /><img className="mascot-eye mascot-eye-right" src="/assets/mascot-eye-alt.svg" alt="" /></span>
    </div>
  )
}
