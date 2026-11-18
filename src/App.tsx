import { Navigate, Outlet, Route, Routes, useParams } from 'react-router'
import './App.css'
import './speech-recognition.css'
import {
  AdminAssessmentsPage,
  AdminAuthProvider,
  AdminDashboardPage,
  AdminLoginPage,
  AdminProtectedLayout,
} from './admin/AdminApp'
import { AdminAssessmentMonitorPage } from './admin/AdminAssessmentMonitorPage'
import { AdminMonitorPage } from './admin/AdminMonitorPage'
import { AssessmentRoute } from './screens/AssessmentFlow'
import { HomePage } from './screens/HomePage'
import { NotFoundPage } from './screens/NotFoundPage'
import { SharedReportPage } from './screens/SharedReportPage'
// Student report screen is intentionally disabled for privacy.
// import { ReportPage } from './screens/ReportPage'

function LegacyAssessmentMonitorRedirect() {
  const { id } = useParams()
  return <Navigate to={id ? `/admin/monitor/${encodeURIComponent(id)}` : '/admin/monitor'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/a/:token" element={<AssessmentRoute />} />
      <Route path="/a/:token/:step" element={<AssessmentRoute />} />
      <Route path="/shared-reports/:token" element={<SharedReportPage />} />
      {/* Student reports are intentionally not supported for students due to privacy. */}
      {/* <Route path="/r/:token" element={<ReportPage />} /> */}
      <Route element={<AdminAuthProvider><Outlet /></AdminAuthProvider>}>
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminProtectedLayout />}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="assessments" element={<AdminAssessmentsPage />} />
          <Route path="monitor" element={<AdminMonitorPage />} />
          <Route path="monitor/:id" element={<AdminAssessmentMonitorPage />} />
          <Route path="assessments/:id/monitor" element={<LegacyAssessmentMonitorRedirect />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
