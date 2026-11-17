import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ReportItemCard } from '../src/screens/ReportPage'
import type { ReportItem } from '../src/student-api'

type ReportItemWithBasis = ReportItem & {
  assessment_basis?: 'LOWER_CONFIDENCE_LINKING_BREAK_PROXY' | null
}

function item(overrides: Partial<ReportItemWithBasis> = {}): ReportItemWithBasis {
  return { item_id: 55, status: 'SCORED', band: 'Good', ...overrides }
}

function blocker(reason: string, outcome = 'AMBIGUOUS') {
  return {
    target_occurrence_id: 'target-1',
    reading_number: 1,
    outcome,
    reason,
    word_ids: ['word-1'],
  }
}

const proxyDisclosure = 'Lower-confidence linking-break proxy. This result does not confirm a physiological glottal stop.'

describe('learner report assessment basis', () => {
  test('discloses the saved proxy basis for a scored result', () => {
    const html = renderToStaticMarkup(<ReportItemCard item={item({
      assessment_basis: 'LOWER_CONFIDENCE_LINKING_BREAK_PROXY',
    })} />)

    expect(html).toContain('Good')
    expect(html).toContain(proxyDisclosure)
  })

  test('discloses the proxy and unvalidated policy for an unscored result', () => {
    for (const reason of ['linking_break_policy_uncalibrated', 'unexpected_linking_break_candidate_uncalibrated']) {
      const html = renderToStaticMarkup(<ReportItemCard item={item({
        status: 'UNSCORED',
        band: null,
        unscored_reason: 'AMBIGUOUS',
        assessment_basis: 'LOWER_CONFIDENCE_LINKING_BREAK_PROXY',
        blocking_targets: [blocker(reason)],
      })} />)

      expect(html).toContain(proxyDisclosure)
      expect(html).toContain('This check is not scored because its detection policy has not been validated.')
      expect(html).toContain('Detection policy has not been validated')
      expect(html).not.toContain('conflicting evidence')
    }
  })

  test('does not infer the saved basis from an item ID when historical data omits it', () => {
    const html = renderToStaticMarkup(<ReportItemCard item={item()} />)

    expect(html).toContain('This item was assessed in your reading.')
    expect(html).not.toContain('Lower-confidence linking-break proxy')
    expect(html).not.toContain('physiological glottal stop')
  })

  test('renders blocker text as escaped React text', () => {
    const html = renderToStaticMarkup(<ReportItemCard item={item({
      status: 'UNSCORED',
      band: null,
      blocking_targets: [blocker('ordinary_reason', '<script>alert(1)</script>')],
    })} />)

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>')
  })
})
