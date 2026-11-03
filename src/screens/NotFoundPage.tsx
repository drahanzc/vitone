import { Link } from 'react-router'
import { MessageScreen, StudentHeader } from '../components/StudentChrome'

export function NotFoundPage() {
  return <div className="student-app"><StudentHeader activeStep={1} /><MessageScreen title="That page isn’t available" message="Open the assessment link shared by your English center to continue." action={<Link className="primary-button button-link" to="/">Back to home</Link>} /></div>
}
