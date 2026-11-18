import { describe, expect, test } from 'bun:test'
import type { components } from '../src/api-schema'
import { buildItemComparisons, comparisonStatusLabel, parseExpertReviewCsv } from '../src/admin/expert-report-comparison'

const headers = 'Item,Sentence #,Phonological / check item,Example,R1,R2'

function reportItem(itemId: number): components['schemas']['ReportItem'] {
  return { item_id: itemId, status: 'SCORED', band: 'Needs Improvement' }
}

function engineSummary(itemId: number, readingIndex: number, overrides: Partial<components['schemas']['ResultItemEvidenceSummary']> = {}): components['schemas']['ResultItemEvidenceSummary'] {
  return {
    item_id: itemId,
    item_label: `Item ${itemId}`,
    reading_index: readingIndex,
    details_available: true,
    expected_examples: 2,
    correct_examples: 1,
    error_examples: 1,
    uncertain_examples: 0,
    uncertainty_affects_band: false,
    ...overrides,
  }
}

describe('expert report comparison', () => {
  test('parses the calibration CSV format, including BOM, quoted commas, and blank labels', () => {
    const rows = parseExpertReviewCsv(`\uFEFF${headers}\r\n64,1,Sentence stress,"WHEN my COU-sin, she CALLED",1,0\r\n48,2,Whole reading,All,,\r\n`)
    expect(rows).toEqual([
      { itemId: 64, checkItem: 'Sentence stress', reading1: 1, reading2: 0 },
      { itemId: 48, checkItem: 'Whole reading', reading1: null, reading2: null },
    ])
  })

  test('rejects unsupported headers and non-binary reviewer values', () => {
    expect(() => parseExpertReviewCsv('Item,Sentence,Check,Example,R1,R2\n')).toThrow('Expected CSV columns')
    expect(() => parseExpertReviewCsv(`${headers}\n64,1,Stress,example,2,1\n`)).toThrow('R1 must be 0, 1, or blank')
    expect(() => parseExpertReviewCsv(`${headers}\n64,1,Stress,"unterminated,1,0\n`)).toThrow('unterminated quoted field')
  })

  test('matches complete per-reading counts but marks uncertain or incomplete coverage explicitly', () => {
    const rows = parseExpertReviewCsv(`${headers}\n1,1,Check,first,1,1\n1,2,Check,second,0,1\n2,1,Check,third,1,\n`)
    const comparisons = buildItemComparisons(rows, [reportItem(1), reportItem(2)], [
      engineSummary(1, 1),
      engineSummary(1, 2, { correct_examples: 1, error_examples: 1, uncertain_examples: 0 }),
      engineSummary(2, 1, { expected_examples: 2, correct_examples: 1, error_examples: 0 }),
    ])

    expect(comparisons[0].reportItem?.band).toBe('Needs Improvement')
    expect(comparisons[0].reading1.status).toBe('counts-match')
    expect(comparisons[0].reading2.status).toBe('counts-differ')
    expect(comparisons[1].reading1.status).toBe('coverage-differs')
    expect(comparisons[1].reading2.status).toBe('not-reviewed')
    expect(comparisonStatusLabel('counts-match')).toBe('Counts match')
  })

  test('does not call uncertain engine evidence a count match', () => {
    const rows = parseExpertReviewCsv(`${headers}\n1,1,Check,first,1,0\n1,2,Check,second,0,1\n`)
    const comparison = buildItemComparisons(rows, [], [
      engineSummary(1, 1, { uncertain_examples: 1 }),
      engineSummary(1, 2, { details_available: false }),
    ])[0]
    expect(comparison.reading1.status).toBe('engine-uncertain')
    expect(comparison.reading2.status).toBe('unavailable')
  })
})
