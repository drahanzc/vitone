import type { AssessmentResultDetails } from './admin-api'

export const resultDetailKey = (row: AssessmentResultDetails['errors'][number]) => `${row.reading_index}:${row.item_id}:${row.target_occurrence_id}`

/** Older servers used zero-based free-form positions without a context field. */
export function resultFindingLocation(row: AssessmentResultDetails['errors'][number]): string {
  if (!row.location) return 'Position not recorded'
  return row.context === undefined ? `Legacy position (index base unspecified): ${row.location}` : row.location
}

/** A cursor page never changes coverage counts. Never combine different snapshots. */
export function mergeResultDetailsPage(current: AssessmentResultDetails | null, page: AssessmentResultDetails): AssessmentResultDetails {
  if (!current || current.assessment_id !== page.assessment_id || current.report_generated_at !== page.report_generated_at) return page
  const incoming = new Set([...page.errors, ...(page.uncertainties ?? [])].map(resultDetailKey))
  return {
    ...page,
    errors: [...current.errors.filter(row => !incoming.has(resultDetailKey(row))), ...page.errors],
    uncertainties: [...(current.uncertainties ?? []).filter(row => !incoming.has(resultDetailKey(row))), ...(page.uncertainties ?? [])],
  }
}
