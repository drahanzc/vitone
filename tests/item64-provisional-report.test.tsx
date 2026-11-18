import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ResultEvidenceSummary, ResultFindingsTable } from '../src/admin/AssessmentResultDetailsDialog'
import type { AssessmentResultDetails } from '../src/admin/admin-api'
import { ReportItemCard, ReportStrengthItem } from '../src/screens/ReportPage'
import type { ReportItem } from '../src/student-api'

const provisionalNote = 'Provisional sentence-stress result. This detector has not been validated against expert judgments.'

function reportItem(assessment_basis?: ReportItem['assessment_basis']): ReportItem {
  return { item_id: 64, status: 'SCORED', band: 'Good', ...(assessment_basis ? { assessment_basis } : {}) }
}

function errorDetail(assessment_basis?: AssessmentResultDetails['errors'][number]['assessment_basis']): AssessmentResultDetails['errors'][number] {
  return {
    reading_index: 1,
    item_id: 64,
    item_label: 'Sentence stress',
    target_occurrence_id: 'sentence:1:word:2',
    example: 'important',
    location: 'Reference sentence 1, word 2',
    expected: 'Stress on syllable 2',
    observed: 'Stress on syllable 1',
    reason: 'The observed stress differs from the expected stress.',
    scored_in_report: true,
    ...(assessment_basis ? { assessment_basis } : {}),
  }
}

describe('provisional sentence-stress labels', () => {
  test('learner cards and strengths show the provisional note only for the exact basis', () => {
    const provisionalCard = renderToStaticMarkup(<ReportItemCard item={reportItem('PROVISIONAL_SENTENCE_STRESS')} />)
    const provisionalStrength = renderToStaticMarkup(<ReportStrengthItem item={reportItem('PROVISIONAL_SENTENCE_STRESS')} />)
    expect(provisionalCard).toContain('Good')
    expect(provisionalCard).toContain(provisionalNote)
    expect(provisionalStrength).toContain('Item 64 · Good')
    expect(provisionalStrength).toContain(provisionalNote)

    const historical = renderToStaticMarkup(<ReportItemCard item={reportItem()} />)
    const otherBasis = renderToStaticMarkup(<ReportStrengthItem item={reportItem('LOWER_CONFIDENCE_LINKING_BREAK_PROXY')} />)
    expect(historical).not.toContain('Provisional')
    expect(otherBasis).not.toContain('Provisional')
  })

  test('below-Perfect admin summaries mark provisional basis rows without changing bands', () => {
    const html = renderToStaticMarkup(<ResultEvidenceSummary items={[
      { item_id: 64, item_label: 'Sentence stress', band: 'Good', assessment_basis: 'PROVISIONAL_SENTENCE_STRESS' },
      { item_id: 55, item_label: 'Glottal stops', band: 'Unclear' },
    ]} summaries={[]} />)

    expect(html).toContain('64. Sentence stress')
    expect(html).toContain('Good')
    expect(html).toContain('Provisional sentence-stress result')
    expect(html).toContain('55. Glottal stops')
    expect(html).not.toContain('55. Glottal stops</strong><small>Provisional')
  })

  test('provisional summary errors are not explained as confirmed pronunciation errors', () => {
    const item: AssessmentResultDetails['non_perfect_items'][number] = {
      item_id: 64,
      item_label: 'Sentence stress',
      band: 'Needs Improvement',
      assessment_basis: 'PROVISIONAL_SENTENCE_STRESS',
    }
    const summary: AssessmentResultDetails['item_summaries'][number] = {
      reading_index: 1,
      item_id: 64,
      item_label: 'Sentence stress',
      band: 'Needs Improvement',
      details_available: true,
      expected_examples: 4,
      correct_examples: 2,
      error_examples: 2,
      uncertain_examples: 0,
      uncertainty_affects_band: false,
    }
    const html = renderToStaticMarkup(<ResultEvidenceSummary items={[item]} summaries={[summary]} />)

    expect(html).toContain('Stored error examples were recorded in the selected readings.')
    expect(html).toContain('This provisional detector has not been validated against expert judgments.')
    expect(html).not.toContain('Confirmed pronunciation errors were detected in the selected readings.')

    const noErrorsHtml = renderToStaticMarkup(<ResultEvidenceSummary items={[item]} summaries={[{
      ...summary,
      correct_examples: 4,
      error_examples: 0,
    }]} />)
    expect(noErrorsHtml).toContain('No stored error examples in selected readings.')
    expect(noErrorsHtml).not.toContain('No confirmed error examples in selected readings.')
  })

  test('provisional errors are not called confirmed and uncertain outcomes retain uncertainty labels', () => {
    const provisionalError = renderToStaticMarkup(<ResultFindingsTable errors={[errorDetail('PROVISIONAL_SENTENCE_STRESS')]} uncertainties={[]} />)
    expect(provisionalError).toContain('Provisional error')
    expect(provisionalError).toContain('Provisional sentence-stress detector; not validated against expert judgments.')
    expect(provisionalError).not.toContain('Confirmed error')

    const uncertain = { ...errorDetail('PROVISIONAL_SENTENCE_STRESS'), outcome: 'AMBIGUOUS' as const }
    const uncertainHtml = renderToStaticMarkup(<ResultFindingsTable errors={[]} uncertainties={[uncertain]} />)
    expect(uncertainHtml).toContain('Uncertain · not confirmed')
    expect(uncertainHtml).toContain('Provisional sentence-stress detector; not validated against expert judgments.')
    expect(uncertainHtml).not.toContain('Provisional error')
  })

  test('historical admin findings without basis keep the existing confirmed-error label', () => {
    const html = renderToStaticMarkup(<ResultFindingsTable errors={[errorDetail()]} uncertainties={[]} />)
    expect(html).toContain('Confirmed error')
    expect(html).not.toContain('Provisional')
  })
})
