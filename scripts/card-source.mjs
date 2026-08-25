import crypto from 'node:crypto'

const SPREADSHEET_ID = '1u23DbvIv0w17rMVBfZb9jq6TGvE3bWDsaMRMUzICvgM'
const CARDS_GID = '0'
const CARDS_CSV_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${CARDS_GID}`

const EXPECTED_COLUMN_COUNT = 52
const HITTER_CHART_FIELDS = [
  ['PU', 'hitter_pu'],
  ['K', 'hitter_k'],
  ['GB', 'hitter_gb'],
  ['FB', 'hitter_fb'],
  ['BB', 'hitter_bb'],
  ['1B', 'hitter_1b'],
  ['1B+', 'hitter_1b_plus'],
  ['2B', 'hitter_2b'],
  ['3B', 'hitter_3b'],
  ['HR', 'hitter_hr'],
]
const PITCHER_CHART_FIELDS = [
  ['PU', 'pitcher_pu'],
  ['K', 'pitcher_k'],
  ['GB', 'pitcher_gb'],
  ['FB', 'pitcher_fb'],
  ['BB', 'pitcher_bb'],
  ['1B', 'pitcher_1b'],
  ['2B', 'pitcher_2b'],
  ['3B', 'pitcher_3b'],
  ['HR', 'pitcher_hr'],
]


const KNOWN_SOURCE_METADATA_MISPLACEMENTS = new Map([
  ['Jesse Winker 2020 CIN', { fromIndex: 49, toIndex: 50, expectedValue: 'Eric', fromField: 'pitcher_hr', toField: 'source_yes_field' }],
  ['Pedro Strop 2016 CHC', { fromIndex: 49, toIndex: 50, expectedValue: 'yes', fromField: 'pitcher_hr', toField: 'source_yes_field' }],
])

function applyKnownSourceCorrections(padded, cardKey, spreadsheetRow, sourceCorrections) {
  const correction = KNOWN_SOURCE_METADATA_MISPLACEMENTS.get(cardKey)
  if (!correction) return

  const fromValue = asText(padded[correction.fromIndex])
  const toValue = asText(padded[correction.toIndex])
  if (fromValue !== correction.expectedValue || toValue !== null) return

  padded[correction.fromIndex] = ''
  padded[correction.toIndex] = fromValue
  sourceCorrections.push({
    card_key: cardKey,
    source_row: spreadsheetRow,
    action: 'MOVE_MISPLACED_METADATA',
    from_field: correction.fromField,
    to_field: correction.toField,
    value: fromValue,
    reason: 'Known workbook metadata value is one column left in a chart field; normalized only in the import stream. Source workbook is unchanged.',
  })
}

function parseCsv(text) {
  const rows = []
  let row = []
  let value = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          value += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        value += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(value)
      value = ''
    } else if (char === '\n') {
      row.push(value.replace(/\r$/, ''))
      rows.push(row)
      row = []
      value = ''
    } else {
      value += char
    }
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value.replace(/\r$/, ''))
    rows.push(row)
  }

  return rows
}

export async function fetchCardsCsv() {
  const response = await fetch(CARDS_CSV_URL, {
    headers: {
      'user-agent': 'ElementsBaseballCardSync/1.0',
    },
    redirect: 'follow',
  })

  if (!response.ok) {
    throw new Error(`Google Sheets CSV download failed with HTTP ${response.status}.`)
  }

  const text = await response.text()
  if (!text.includes('Player Name') || !text.includes('On Base')) {
    throw new Error('The downloaded file does not look like the CARDS worksheet CSV export.')
  }

  return text
}

function asText(value) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

function asInteger(value) {
  const text = asText(value)
  if (text === null) return null
  const number = Number(text.replaceAll(',', ''))
  return Number.isFinite(number) ? Math.trunc(number) : null
}

function asNumber(value) {
  const text = asText(value)
  if (text === null) return null
  const number = Number(text.replaceAll(',', ''))
  return Number.isFinite(number) ? number : null
}

function createSourceHash(values) {
  return crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex')
}

function findHeaderRow(rows) {
  const index = rows.findIndex((row) =>
    row[4]?.trim() === 'Player Name' &&
    row[11]?.trim() === 'On Base' &&
    row[38]?.trim() === 'Control'
  )

  if (index < 0) throw new Error('Could not locate the CARDS header row in the CSV export.')
  return index
}

function mapCsvRow(values, spreadsheetRow, sourceCorrections = []) {
  const padded = Array.from({ length: EXPECTED_COLUMN_COUNT }, (_, index) => values[index] ?? '')
  const cardKey = asText(padded[0])
  const playerName = asText(padded[4])
  if (!cardKey || !playerName) return null

  applyKnownSourceCorrections(padded, cardKey, spreadsheetRow, sourceCorrections)

  return {
    card_key: cardKey,
    all_number: asInteger(padded[1]),
    card_number: asInteger(padded[2]),
    icon: asText(padded[3]),
    player_name: playerName,
    league: asText(padded[5]),
    team_name: asText(padded[6]),
    ownership: asText(padded[51]),

    hitter_bats: asText(padded[7]),
    hitter_fatigue: asInteger(padded[8]),
    hitter_year: asInteger(padded[9]),
    hitter_team_code: asText(padded[10]),
    hitter_on_base: asInteger(padded[11]),
    hitter_outs: asInteger(padded[12]),
    hitter_baserunning: asInteger(padded[13]),
    hitter_stolen_base: asInteger(padded[14]),

    defense_c: asInteger(padded[15]),
    defense_1b: asInteger(padded[16]),
    defense_2b: asInteger(padded[17]),
    defense_3b: asInteger(padded[18]),
    defense_ss: asInteger(padded[19]),
    defense_lf: asInteger(padded[20]),
    defense_cf: asInteger(padded[21]),
    defense_rf: asInteger(padded[22]),

    // IMPORTANT: chart values are intentionally preserved as strings.
    // "2-5" remains "2-5" and the gameplay resolver interprets it as 2,3,4,5.
    // A single numeric-looking value such as "1" remains "1" instead of being
    // coerced away by Google Visualization's mixed-column type inference.
    hitter_pu: asText(padded[23]),
    hitter_k: asText(padded[24]),
    hitter_gb: asText(padded[25]),
    hitter_fb: asText(padded[26]),
    hitter_bb: asText(padded[27]),
    hitter_1b: asText(padded[28]),
    hitter_1b_plus: asText(padded[29]),
    hitter_2b: asText(padded[30]),
    hitter_3b: asText(padded[31]),
    hitter_hr: asText(padded[32]),
    hitter_points: asInteger(padded[33]),

    pitcher_arm: asText(padded[34]),
    pitcher_fatigue: asInteger(padded[35]),
    pitcher_year: asInteger(padded[36]),
    pitcher_team_code: asText(padded[37]),
    pitcher_control: asInteger(padded[38]),
    pitcher_outs: asInteger(padded[39]),
    pitcher_ip: asNumber(padded[40]),
    pitcher_pu: asText(padded[41]),
    pitcher_k: asText(padded[42]),
    pitcher_gb: asText(padded[43]),
    pitcher_fb: asText(padded[44]),
    pitcher_bb: asText(padded[45]),
    pitcher_1b: asText(padded[46]),
    pitcher_2b: asText(padded[47]),
    pitcher_3b: asText(padded[48]),
    pitcher_hr: asText(padded[49]),

    source_yes_field: asText(padded[50]),
    source_row: spreadsheetRow,
    source_hash: createSourceHash(padded),
    last_synced_at: new Date().toISOString(),
  }
}

function rollsFromRange(raw) {
  const text = asText(raw)
  if (!text) return { error: null, rolls: [] }

  const normalized = text.replace(/[–—]/g, '-').replace(/\s+/g, '')
  const pieces = normalized.split(/[,;/]+/).filter(Boolean)
  const rolls = []

  for (const piece of pieces) {
    const match = piece.match(/^(\d+)(?:-(\d+))?$/)
    if (!match) return { error: `unrecognized range "${text}"`, rolls: [] }
    const start = Number(match[1])
    const end = match[2] ? Number(match[2]) : start
    if (start < 1 || end > 20 || end < start) {
      return { error: `out-of-bounds range "${text}"`, rolls: [] }
    }
    for (let roll = start; roll <= end; roll += 1) rolls.push(roll)
  }

  return { error: null, rolls }
}

function validateOneChart(card, side, fields) {
  const populated = fields.filter(([, field]) => asText(card[field]) !== null)
  if (populated.length === 0) return null

  const coverage = new Map(Array.from({ length: 20 }, (_, i) => [i + 1, []]))
  const parseErrors = []

  for (const [result, field] of fields) {
    const parsed = rollsFromRange(card[field])
    if (parsed.error) {
      parseErrors.push(`${result}: ${parsed.error}`)
      continue
    }
    for (const roll of parsed.rolls) coverage.get(roll)?.push(result)
  }

  const missing = []
  const overlaps = []
  for (const [roll, results] of coverage) {
    if (results.length === 0) missing.push(roll)
    if (results.length > 1) overlaps.push({ roll, results })
  }

  if (parseErrors.length === 0 && missing.length === 0 && overlaps.length === 0) return null

  return {
    card_key: card.card_key,
    player_name: card.player_name,
    side,
    source_row: card.source_row,
    parse_errors: parseErrors,
    missing_rolls: missing,
    overlapping_rolls: overlaps,
    chart: Object.fromEntries(fields.map(([result, field]) => [result, card[field]])),
  }
}

export function prepareCardsFromCsv(csvText) {
  const rows = parseCsv(csvText)
  const headerIndex = findHeaderRow(rows)
  const cards = []
  const sourceCorrections = []
  let skipped = 0

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const card = mapCsvRow(rows[index], index + 1, sourceCorrections)
    if (card) cards.push(card)
    else skipped += 1
  }

  const unique = new Map()
  const duplicateKeys = new Set()
  for (const card of cards) {
    if (unique.has(card.card_key)) duplicateKeys.add(card.card_key)
    unique.set(card.card_key, card)
  }
  const deduplicated = [...unique.values()]

  const chartIssues = []
  let hitterChartsChecked = 0
  let pitcherChartsChecked = 0
  for (const card of deduplicated) {
    const hitterHasChart = HITTER_CHART_FIELDS.some(([, field]) => asText(card[field]) !== null)
    const pitcherHasChart = PITCHER_CHART_FIELDS.some(([, field]) => asText(card[field]) !== null)
    if (hitterHasChart) hitterChartsChecked += 1
    if (pitcherHasChart) pitcherChartsChecked += 1
    const hitterIssue = validateOneChart(card, 'hitter', HITTER_CHART_FIELDS)
    const pitcherIssue = validateOneChart(card, 'pitcher', PITCHER_CHART_FIELDS)
    if (hitterIssue) chartIssues.push(hitterIssue)
    if (pitcherIssue) chartIssues.push(pitcherIssue)
  }

  return {
    cards: deduplicated,
    sourceRows: rows.length,
    skippedRows: skipped,
    duplicateKeys: [...duplicateKeys],
    hitterChartsChecked,
    pitcherChartsChecked,
    chartIssues,
    sourceCorrections,
  }
}

export function findCard(cards, cardKey) {
  return cards.find((card) => card.card_key === cardKey) ?? null
}
