import 'dotenv/config'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const SOURCE_FILE = new URL('../json.txt', import.meta.url)
const BATCH_SIZE = 500
const MAX_RETRIES = 5

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  throw new Error('VITE_SUPABASE_URL is missing from the .env file.')
}

if (!serviceRoleKey) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY is missing from the .env file.'
  )
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

function readGoogleVisualizationFile() {
  if (!fs.existsSync(SOURCE_FILE)) {
    throw new Error(
      'json.txt was not found in the main elements-baseball-app folder.'
    )
  }

  const rawText = fs.readFileSync(SOURCE_FILE, 'utf8').trim()
  const startMarker = 'google.visualization.Query.setResponse('
  const jsonStart = rawText.indexOf(startMarker)
  const jsonEnd = rawText.lastIndexOf(');')

  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error(
      'json.txt is not a valid Google Visualization response file.'
    )
  }

  const responseText = rawText.slice(
    jsonStart + startMarker.length,
    jsonEnd
  )

  const response = JSON.parse(responseText)

  if (!response.table?.rows || !response.table?.cols) {
    throw new Error(
      'The Google Visualization response does not contain a table.'
    )
  }

  return response.table
}

function getCellValue(row, index) {
  const cell = row.c?.[index]

  if (!cell || cell.v === null || cell.v === undefined || cell.v === '') {
    return null
  }

  return cell.v
}

function asText(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  return String(value).trim() || null
}

function asInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const number = Number(value)

  if (!Number.isFinite(number)) {
    return null
  }

  return Math.trunc(number)
}

function asNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const number = Number(value)

  if (!Number.isFinite(number)) {
    return null
  }

  return number
}

function createSourceHash(values) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(values))
    .digest('hex')
}

function mapRow(row, rowIndex) {
  const values = Array.from({ length: 52 }, (_, index) =>
    getCellValue(row, index)
  )

  const cardKey = asText(values[0])
  const playerName = asText(values[4])

  if (!cardKey || !playerName) {
    return null
  }

  return {
    card_key: cardKey,
    all_number: asInteger(values[1]),
    card_number: asInteger(values[2]),
    icon: asText(values[3]),
    player_name: playerName,
    league: asText(values[5]),
    team_name: asText(values[6]),
    ownership: asText(values[51]),

    hitter_bats: asText(values[7]),
    hitter_fatigue: asInteger(values[8]),
    hitter_year: asInteger(values[9]),
    hitter_team_code: asText(values[10]),
    hitter_on_base: asInteger(values[11]),
    hitter_outs: asInteger(values[12]),
    hitter_baserunning: asInteger(values[13]),
    hitter_stolen_base: asInteger(values[14]),

    defense_c: asInteger(values[15]),
    defense_1b: asInteger(values[16]),
    defense_2b: asInteger(values[17]),
    defense_3b: asInteger(values[18]),
    defense_ss: asInteger(values[19]),
    defense_lf: asInteger(values[20]),
    defense_cf: asInteger(values[21]),
    defense_rf: asInteger(values[22]),

    hitter_pu: asText(values[23]),
    hitter_k: asText(values[24]),
    hitter_gb: asText(values[25]),
    hitter_fb: asText(values[26]),
    hitter_bb: asText(values[27]),
    hitter_1b: asText(values[28]),
    hitter_1b_plus: asText(values[29]),
    hitter_2b: asText(values[30]),
    hitter_3b: asText(values[31]),
    hitter_hr: asText(values[32]),
    hitter_points: asInteger(values[33]),

    pitcher_arm: asText(values[34]),
    pitcher_fatigue: asInteger(values[35]),
    pitcher_year: asInteger(values[36]),
    pitcher_team_code: asText(values[37]),
    pitcher_control: asInteger(values[38]),
    pitcher_outs: asInteger(values[39]),
    pitcher_ip: asNumber(values[40]),
    pitcher_pu: asText(values[41]),
    pitcher_k: asText(values[42]),
    pitcher_gb: asText(values[43]),
    pitcher_fb: asText(values[44]),
    pitcher_bb: asText(values[45]),
    pitcher_1b: asText(values[46]),
    pitcher_2b: asText(values[47]),
    pitcher_3b: asText(values[48]),
    pitcher_hr: asText(values[49]),

    source_yes_field: asText(values[50]),
    source_row: rowIndex + 2,
    source_hash: createSourceHash(values),
    last_synced_at: new Date().toISOString(),
  }
}

function removeDuplicateCardKeys(cards) {
  const uniqueCards = new Map()
  const duplicateKeys = new Set()

  for (const card of cards) {
    if (uniqueCards.has(card.card_key)) {
      duplicateKeys.add(card.card_key)
    }

    uniqueCards.set(card.card_key, card)
  }

  return {
    cards: Array.from(uniqueCards.values()),
    duplicateKeys: Array.from(duplicateKeys),
  }
}

async function importBatch(batch, batchNumber, totalBatches) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const { error } = await supabase.from('cards').upsert(batch, {
        onConflict: 'card_key',
        ignoreDuplicates: false,
      })

      if (error) {
        throw new Error(error.message)
      }

      console.log(
        `Batch ${batchNumber.toLocaleString()} of ${totalBatches.toLocaleString()} complete.`
      )

      return
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error)

      if (attempt === MAX_RETRIES) {
        throw new Error(
          `Batch ${batchNumber} failed after ${MAX_RETRIES} attempts: ${message}`
        )
      }

      const waitTime = attempt * 3000

      console.warn(
        `Batch ${batchNumber} attempt ${attempt} failed: ${message}`
      )

      console.warn(
        `Retrying in ${(waitTime / 1000).toLocaleString()} seconds...`
      )

      await sleep(waitTime)
    }
  }
}

async function runImporter() {
  console.log('\nElements Baseball card importer')
  console.log('--------------------------------')

  const table = readGoogleVisualizationFile()

  console.log(
    `Source file contains ${table.rows.length.toLocaleString()} rows.`
  )

  const mappedCards = []
  let skippedRows = 0

  table.rows.forEach((row, index) => {
    const card = mapRow(row, index)

    if (card) {
      mappedCards.push(card)
    } else {
      skippedRows += 1
    }
  })

  if (mappedCards.length === 0) {
    throw new Error('No valid card records were found in json.txt.')
  }

  console.log(
    `${mappedCards.length.toLocaleString()} valid source rows prepared.`
  )

  if (skippedRows > 0) {
    console.log(
      `${skippedRows.toLocaleString()} blank or invalid rows will be skipped.`
    )
  }

  const deduplicated = removeDuplicateCardKeys(mappedCards)
  const cards = deduplicated.cards
  const duplicateCount = mappedCards.length - cards.length

  if (duplicateCount > 0) {
    console.log(
      `${duplicateCount.toLocaleString()} duplicate card-key rows were removed.`
    )

    console.log(
      `${deduplicated.duplicateKeys.length.toLocaleString()} unique card keys appeared more than once.`
    )
  }

  console.log(
    `${cards.length.toLocaleString()} unique cards will be imported.`
  )

  const totalBatches = Math.ceil(cards.length / BATCH_SIZE)

  console.log(
    `Importing in ${totalBatches.toLocaleString()} batches of up to ${BATCH_SIZE.toLocaleString()} cards.\n`
  )

  for (let start = 0; start < cards.length; start += BATCH_SIZE) {
    const batch = cards.slice(start, start + BATCH_SIZE)
    const batchNumber = Math.floor(start / BATCH_SIZE) + 1

    await importBatch(batch, batchNumber, totalBatches)
  }

  const { count, error: countError } = await supabase
    .from('cards')
    .select('*', {
      count: 'exact',
      head: true,
    })

  if (countError) {
    console.warn(
      `Import completed, but the final count could not be checked: ${countError.message}`
    )
  }

  console.log('\n--------------------------------')
  console.log('Import complete.')
  console.log(
    `${cards.length.toLocaleString()} unique cards were processed.`
  )

  if (count !== null) {
    console.log(
      `The Supabase cards table now contains ${count.toLocaleString()} records.`
    )
  }
}

runImporter().catch((error) => {
  console.error('\nImport stopped.')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})