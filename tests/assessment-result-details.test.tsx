import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ResultEvidenceSummary, ResultFindingsTable } from '../src/admin/AssessmentResultDetailsDialog'
import { mergeResultDetailsPage } from '../src/admin/result-details-utils'
import type { AssessmentResultDetails } from '../src/admin/admin-api'

type Summary = AssessmentResultDetails['item_summaries'][number]
function summary(reading: number, correct: number, uncertain: number): Summary {
  return { reading_index: reading, item_id: 49, item_label: 'Stress in multisyllable words', band: 'Good',
    details_available: true, expected_examples: 8, correct_examples: correct, error_examples: 0,
    uncertain_examples: uncertain, uncertainty_affects_band: uncertain > 0 }
}
function detail(reading: number, id = 'example:julia:1'): AssessmentResultDetails['errors'][number] {
  return { reading_index: reading, item_id: 49, item_label: 'Stress in multisyllable words', target_occurrence_id: id,
    example: 'Julia', location: 'Reference sentence 1, word 4 (passage word 4)',
    context: 'When my cousin Julia moved to the city last month, she called me on Sunday evening.', expected: 'Syllable 1', observed: null,
    reason_code: 'phrase_final_prominence_confounded', reason: 'Phrase-final pitch may reflect intonation, not misplaced stress.', scored_in_report: true }
}
function page(): AssessmentResultDetails {
  return { assessment_id: 'student-id', report_generated_at: '2026-11-08T00:00:00Z',
    non_perfect_items: [{ item_id: 49, item_label: 'Stress in multisyllable words', band: 'Good' }],
    readings: [{ reading_index: 1, details_available: true }, { reading_index: 2, details_available: true }],
    errors: [], uncertainties: [{ ...detail(1), outcome: 'AMBIGUOUS' }],
    item_summaries: [summary(1, 6, 2), summary(2, 7, 1)], next_cursor: null }
}

describe('result evidence explanations', () => {
  test('explains Good without inventing pronunciation errors or changing the band', () => {
    const html = renderToStaticMarkup(<ResultEvidenceSummary summaries={page().item_summaries} />)
    expect(html).toContain('Good')
    expect(html).toContain('13 / 16')
    expect(html).toContain('No confirmed pronunciation errors, but some examples could not be confirmed')
    expect(html).toContain('not confirmed pronunciation errors')
    expect(html).toContain('Saved band (all readings)')
  })

  test('a reading filter changes counts, not the saved all-readings band', () => {
    const html = renderToStaticMarkup(<ResultEvidenceSummary summaries={page().item_summaries} readingIndex={2} />)
    expect(html).toContain('7 / 8')
    expect(html).not.toContain('13 / 16')
    expect(html).toContain('Good')
    expect(html).toContain('saved bands are unchanged')
  })

  test('missing historical evidence does not imply zero errors or incorrect examples', () => {
    const rows = page().item_summaries
    rows[1] = { ...rows[1]!, details_available: false, correct_examples: 0, uncertain_examples: 8 }
    const html = renderToStaticMarkup(<ResultEvidenceSummary summaries={rows} />)
    expect(html).toContain('Coverage unavailable')
    expect(html).toContain('counts cannot explain the saved band reliably')
    expect(html).not.toContain('6 / 16')
    expect(html).not.toContain('No confirmed pronunciation errors, but')
  })

  test('lists every below-Perfect band, including errors without uncertainty and incidence checks', () => {
    const items: AssessmentResultDetails['non_perfect_items'] = [
      { item_id: 55, item_label: 'Glottal stops', band: 'Unclear' },
      ...page().non_perfect_items,
      { item_id: 1, item_label: 'Vowel check', band: 'Needs Improvement' },
    ]
    const errorOnly = { ...summary(1, 6, 0), item_id: 1, error_examples: 2 }
    const html = renderToStaticMarkup(<ResultEvidenceSummary items={items} summaries={[...page().item_summaries, errorOnly]} />)
    expect(html).toContain('Scored items below Perfect (3)')
    expect(html).toContain('Needs Improvement')
    expect(html).toContain('Unclear')
    expect(html).toContain('Good')
    expect(html).toContain('Confirmed pronunciation errors were detected')
    expect(html).toContain('55. Glottal stops')
    expect(html).toContain('No percentage-example summary is available')
    expect(html.indexOf('1. Vowel check')).toBeLessThan(html.indexOf('49. Stress'))
    expect(html.indexOf('49. Stress')).toBeLessThan(html.indexOf('55. Glottal stops'))
  })

  test('Perfect and unscored summaries are excluded even if they contain uncertainty', () => {
    const rows = [{ ...summary(1, 8, 0), band: 'Perfect' as const, item_label: 'Perfect check' },
      { ...summary(1, 0, 8), item_id: 47, band: null, item_label: 'Unscored check' }]
    const html = renderToStaticMarkup(<ResultEvidenceSummary items={[]} summaries={rows} />)
    expect(html).toContain('No scored items below Perfect.')
    expect(html).not.toContain('Perfect check')
    expect(html).not.toContain('Unscored check')
  })

  test('a clean selected reading does not hide a below-Perfect saved band', () => {
    const html = renderToStaticMarkup(<ResultEvidenceSummary items={page().non_perfect_items}
      summaries={[summary(2, 8, 0)]} readingIndex={2} />)
    expect(html).toContain('Scored items below Perfect (1)')
    expect(html).toContain('Good')
    expect(html).toContain('8 / 8')
    expect(html).toContain('All selected examples were counted as correct')
  })

  test('a saved check remains visible without selected-reading summary data', () => {
    const html = renderToStaticMarkup(<ResultEvidenceSummary items={page().non_perfect_items} summaries={[]} readingIndex={2} />)
    expect(html).toContain('49. Stress')
    expect(html).toContain('Good')
    expect(html).toContain('Coverage unavailable')
    expect(html).not.toContain('0 / 0')
  })

  test('older servers receive an explicitly partial fallback, not a complete-list claim', () => {
    const html = renderToStaticMarkup(<ResultEvidenceSummary summaries={[summary(1, 6, 0)]} />)
    expect(html).toContain('49. Stress')
    expect(html).toContain('list may be incomplete')
    expect(html).not.toContain('No scored items below Perfect.')
  })

  test('below-Perfect checks list loaded error words and exact positions, never uncertain words as errors', () => {
    const html = renderToStaticMarkup(<ResultEvidenceSummary items={page().non_perfect_items} summaries={page().item_summaries}
      errors={[{ ...detail(1), example: 'honestly' }, { ...detail(2), example: 'energy' }]} readingIndex={1} hasMoreFindings />)
    expect(html).toContain('Confirmed error words / positions')
    expect(html).toContain('honestly')
    expect(html).toContain('Reading 1 · Reference sentence 1, word 4 (passage word 4)')
    expect(html).not.toContain('energy')
    expect(html).toContain('loaded findings only')
  })

  test('absent or unlocalized errors are not given invented words or positions', () => {
    const noLocations = renderToStaticMarkup(<ResultEvidenceSummary items={page().non_perfect_items} summaries={[]} hasMoreFindings />)
    expect(noLocations).toContain('No error locations loaded.')
    const html = renderToStaticMarkup(<ResultFindingsTable errors={[{ ...detail(1), example: null, location: null, context: null }]} uncertainties={[]} />)
    expect(html).toContain('Word / span not localized')
    expect(html).toContain('Position not recorded')
  })

  test('legacy server positions are not silently presented as one-based reference positions', () => {
    const legacy = { ...detail(1), location: 'Word 160' }
    Reflect.deleteProperty(legacy, 'context')
    const html = renderToStaticMarkup(<ResultFindingsTable errors={[legacy]} uncertainties={[]} />)
    expect(html).toContain('Legacy position (index base unspecified): Word 160')
  })

  test('findings display one-based positions and escaped sentence context in separate columns', () => {
    const html = renderToStaticMarkup(<ResultFindingsTable errors={[{ ...detail(1), context: '<script>context()</script>' }]} uncertainties={page().uncertainties} />)
    expect(html).toContain('Reference word / span')
    expect(html).toContain('Position / context')
    expect(html).toContain('Reference sentence 1, word 4 (passage word 4)')
    expect(html).toContain('Context: &lt;script&gt;context()&lt;/script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('Uncertain · conflicting evidence')
  })

  test('uncertain and unsupported findings are not presented as confirmed errors', () => {
    const rows = [page().uncertainties[0]!, { ...detail(2, 'example:missing:1'), outcome: 'UNASSESSABLE' as const },
      { ...detail(2, 'example:unsupported:1'), outcome: 'UNSUPPORTED' as const }]
    const html = renderToStaticMarkup(<ResultFindingsTable errors={[]} uncertainties={rows} />)
    expect(html).toContain('Uncertain · conflicting evidence')
    expect(html).toContain('Uncertain · insufficient evidence')
    expect(html).toContain('Not supported')
    expect(html).toContain('Julia')
    expect(html).toContain('Syllable 1')
    expect(html).not.toContain('Confirmed error</span>')
    expect(html).not.toContain('admin-finding-error')
  })

  test('confirmed errors, missing observations and hostile text retain safe labels', () => {
    const row = { ...detail(1), example: '<script>unsafe()</script>', scored_in_report: false }
    const html = renderToStaticMarkup(<ResultFindingsTable errors={[row]} uncertainties={[]} />)
    expect(html).toContain('Confirmed error')
    expect(html).toContain('Check not scored in saved report')
    expect(html).toContain('Not recorded')
    expect(html).toContain('&lt;script&gt;unsafe()&lt;/script&gt;')
    expect(html).not.toContain('<script>')
  })

  test('empty, loading, failed and unavailable states do not promise correctness', () => {
    const empty = renderToStaticMarkup(<ResultFindingsTable errors={[]} uncertainties={[]} />)
    expect(empty).toContain('does not establish complete correctness')
    expect(renderToStaticMarkup(<ResultFindingsTable errors={[]} uncertainties={[]} loading />)).toContain('Loading result details')
    expect(renderToStaticMarkup(<ResultFindingsTable errors={[]} uncertainties={[]} error="failed" />)).toContain('could not be loaded')
    expect(renderToStaticMarkup(<ResultFindingsTable errors={[]} uncertainties={[]} available={false} />)).toContain('Detailed results are unavailable')
  })
})

describe('combined details pagination', () => {
  test('merges both finding types without duplicates or adding coverage counts twice', () => {
    const first = page()
    first.errors = [detail(1, 'example:error:1')]
    const next = page()
    next.errors = [detail(2, 'example:error:2')]
    next.uncertainties = [{ ...detail(2), outcome: 'AMBIGUOUS' }]
    const merged = mergeResultDetailsPage(first, next)
    expect(merged.errors).toHaveLength(2)
    expect(merged.uncertainties).toHaveLength(2)
    expect(merged.item_summaries).toEqual(next.item_summaries)
    expect(mergeResultDetailsPage(merged, next).uncertainties).toHaveLength(2)
  })

  test('never combines different assessments or report snapshots', () => {
    const first = page()
    for (const next of [{ ...page(), assessment_id: 'other-student' }, { ...page(), report_generated_at: '2026-11-09T00:00:00Z' }]) {
      expect(mergeResultDetailsPage(first, next)).toBe(next)
    }
  })
})
