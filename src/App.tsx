import { Link, Route, Routes } from 'react-router'
import './App.css'

function HomePage() {
  return (
    <section className="welcome-card" aria-labelledby="welcome-title">
      <div className="welcome-copy">
        <span className="eyebrow">Pronunciation assessment</span>
        <h1 id="welcome-title">A clearer picture of every reading.</h1>
        <p>
          The APE interface workspace is ready. Learner and center experiences
          can grow here, backed by the existing assessment API.
        </p>
        <a className="text-link" href="https://github.com/lumenwork/ape">
          Explore the backend <span aria-hidden="true">↗</span>
        </a>
      </div>
      <div className="welcome-mark" aria-hidden="true">
        <span className="mark-line mark-line-short" />
        <span className="mark-line" />
        <span className="mark-line mark-line-tall" />
        <span className="mark-line mark-line-short" />
        <span className="mark-line mark-line-mid" />
      </div>
    </section>
  )
}

function NotFoundPage() {
  return (
    <section className="not-found" aria-labelledby="not-found-title">
      <span className="eyebrow">Page not found</span>
      <h1 id="not-found-title">That route is not set up yet.</h1>
      <Link className="text-link" to="/">
        Back to overview <span aria-hidden="true">→</span>
      </Link>
    </section>
  )
}

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/" aria-label="APE home">
          <span className="brand-mark" aria-hidden="true">a</span>
          <span>ape</span>
        </Link>
        <span className="topbar-label">Assessment workspace</span>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <footer className="footer">
        <span>Automated English Pronunciation Evaluator</span>
        <span>UI workspace</span>
      </footer>
    </div>
  )
}
