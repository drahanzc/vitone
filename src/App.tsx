import { Route, Routes } from 'react-router'
import './App.css'
import './speech-recognition.css'
import {
  AdminAssessmentsPage,
  AdminAuthProvider,
  AdminDashboardPage,
  AdminLoginPage,
  AdminProtectedLayout,
} from './admin/AdminApp'
import { AssessmentRoute } from './screens/AssessmentFlow'
import { HomePage } from './screens/HomePage'
import { NotFoundPage } from './screens/NotFoundPage'
// Student report screen is intentionally disabled for privacy.
// import { ReportPage } from './screens/ReportPage'

export default function App() {
  return (
    <AdminAuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/a/:token" element={<AssessmentRoute />} />
        <Route path="/a/:token/:step" element={<AssessmentRoute />} />
        {/* Student reports are intentionally not supported for students due to privacy. */}
        {/* <Route path="/r/:token" element={<ReportPage />} /> */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminProtectedLayout />}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="assessments" element={<AdminAssessmentsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AdminAuthProvider>
  )
}
