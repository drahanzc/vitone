import type { components } from '../api-schema'

export type ExpertReviewRow = {
  itemId: number
  checkItem: string
  reading1: 0 | 1 | null
  reading2: 0 | 1 | null
}

export type ExpertReviewStats = {
  rowCount: number
  correct: number
  errors: number
  unreviewed: number
}

export type ReadingComparison = {
  expert: ExpertReviewStats
  engine: components['schemas']['ResultItemEvidenceSummary'] | undefined
  status: 'not-reviewed' | 'unavailable' | 'coverage-differs' | 'engine-uncertain' | 'counts-match' | 'counts-differ'
}

export type ItemComparison = {
  itemId: number
  itemLabel: string
  reportItem: components['schemas']['ReportItem'] | undefined
  reading1: ReadingComparison
  reading2: ReadingComparison
}

const EXPECTED_HEADERS = ['Item', 'Sentence #', 'Phonological / check item', 'Example', 'R1', 'R2']
const MAX_EXPERT_CSV_BYTES = 2 * 1024 * 1024

function parseCsvRecords(source: string): string[][] {
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false
  let closedQuote = false

  function pushRecord() {
    record.push(field.trim())
    records.push(record)
    record = []
    field = ''
    closedQuote = false
  }

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
        closedQuote = true
      } else {
        field += character
      }
      continue
    }

    if (character === '"' && field.length === 0 && !closedQuote) {
      quoted = true
    } else if (character === ',') {
      record.push(field.trim())
      field = ''
      closedQuote = false
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1
      pushRecord()
    } else if (closedQuote && character.trim() !== '') {
      throw new Error('CSV has unexpected text after a quoted field.')
    } else if (!closedQuote) {
      field += character
    }
  }

  if (quoted) throw new Error('CSV contains an unterminated quoted field.')
  if (field.length > 0 || record.length > 0) pushRecord()
  return records
}

export function parseExpertReviewCsv(source: string): ExpertReviewRow[] {
  const records = parseCsvRecords(source.replace(/^\uFEFF/, ''))
  const [headers, ...data] = records
  if (!headers || headers.length !== EXPECTED_HEADERS.length || headers.some((header, index) => header !== EXPECTED_HEADERS[index])) {
    throw new Error(`Expected CSV columns: ${EXPECTED_HEADERS.join(', ')}.`)
  }

  return data.map((record, index) => {
    if (record.length !== EXPECTED_HEADERS.length) {
      throw new Error(`CSV row ${index + 2} must contain exactly ${EXPECTED_HEADERS.length} columns.`)
    }
    const itemId = Number(record[0])
    if (!Number.isInteger(itemId) || itemId < 1 || itemId > 65) {
      throw new Error(`CSV row ${index + 2} has an invalid item number.`)
    }
    const parseLabel = (value: string, column: string): 0 | 1 | null => {
      if (value === '') return null
      if (value === '0' || value === '1') return Number(value) as 0 | 1
      throw new Error(`CSV row ${index + 2} ${column} must be 0, 1, or blank.`)
    }
    return {
      itemId,
      checkItem: record[2],
      reading1: parseLabel(record[4], 'R1'),
      reading2: parseLabel(record[5], 'R2'),
    }
  })
}

export function parseExpertReviewFile(file: File): Promise<ExpertReviewRow[]> {
  if (file.size > MAX_EXPERT_CSV_BYTES) {
    return Promise.reject(new Error('The reviewed CSV must be no larger than 2 MiB.'))
  }
  return file.text().then(parseExpertReviewCsv)
}

function statsFor(rows: ExpertReviewRow[], reading: 1 | 2): ExpertReviewStats {
  const labels = rows.map(row => reading === 1 ? row.reading1 : row.reading2)
  return {
    rowCount: rows.length,
    correct: labels.filter(label => label === 1).length,
    errors: labels.filter(label => label === 0).length,
    unreviewed: labels.filter(label => label === null).length,
  }
}

function compareReading(
  expert: ExpertReviewStats,
  engine: components['schemas']['ResultItemEvidenceSummary'] | undefined,
): ReadingComparison {
  if (expert.correct + expert.errors === 0) return { expert, engine, status: 'not-reviewed' }
  if (!engine || !engine.details_available) return { expert, engine, status: 'unavailable' }
  if (expert.unreviewed > 0 || expert.rowCount !== engine.expected_examples) {
    return { expert, engine, status: 'coverage-differs' }
  }
  if (engine.uncertain_examples > 0) return { expert, engine, status: 'engine-uncertain' }
  const countsMatch = expert.correct === engine.correct_examples && expert.errors === engine.error_examples
  return { expert, engine, status: countsMatch ? 'counts-match' : 'counts-differ' }
}

export function buildItemComparisons(
  rows: ExpertReviewRow[],
  reportItems: components['schemas']['ReportItem'][],
  engineSummaries: components['schemas']['ResultItemEvidenceSummary'][],
): ItemComparison[] {
  const expertByItem = new Map<number, ExpertReviewRow[]>()
  for (const row of rows) {
    const itemRows = expertByItem.get(row.itemId) ?? []
    itemRows.push(row)
    expertByItem.set(row.itemId, itemRows)
  }
  const reportByItem = new Map(reportItems.map(item => [item.item_id, item]))
  const engineByReading = new Map(engineSummaries.map(summary => [`${summary.item_id}:${summary.reading_index}`, summary]))

  return [...expertByItem.entries()]
    .filter(([, itemRows]) => itemRows.some(row => row.reading1 !== null || row.reading2 !== null))
    .sort(([left], [right]) => left - right)
    .map(([itemId, itemRows]) => {
      const engineFor = (reading: 1 | 2) => engineByReading.get(`${itemId}:${reading}`)
      return {
        itemId,
        itemLabel: itemRows.find(row => row.checkItem)?.checkItem ?? '',
        reportItem: reportByItem.get(itemId),
        reading1: compareReading(statsFor(itemRows, 1), engineFor(1)),
        reading2: compareReading(statsFor(itemRows, 2), engineFor(2)),
      }
    })
}

export function comparisonStatusLabel(status: ReadingComparison['status']): string {
  switch (status) {
    case 'not-reviewed': return 'No expert labels'
    case 'unavailable': return 'No per-reading breakdown'
    case 'coverage-differs': return 'Coverage differs'
    case 'engine-uncertain': return 'Engine has uncertain examples'
    case 'counts-match': return 'Counts match'
    case 'counts-differ': return 'Counts differ'
  }
}
