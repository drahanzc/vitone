const metricIconAssets = {
  submissions: '/assets/admin-metric-icons/submissions.svg',
  processing: '/assets/admin-metric-icons/processing.svg',
  completed: '/assets/admin-metric-icons/completed.svg',
} as const

export function MetricCard({ label, value, icon }: { label: string; value: string; icon: keyof typeof metricIconAssets }) {
  return (
    <article className="admin-metric-card">
      <div className="admin-metric-label">
        <span>{label}</span>
        <span className="admin-metric-icon" aria-hidden="true"><img src={metricIconAssets[icon]} alt="" /></span>
      </div>
      <strong>{value}</strong>
    </article>
  )
}
