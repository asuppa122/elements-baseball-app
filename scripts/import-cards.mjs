import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { fetchCardsCsv, prepareCardsFromCsv } from './card-source.mjs'

const BATCH_SIZE = 500
const MAX_RETRIES = 5

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl) throw new Error('VITE_SUPABASE_URL is missing from the .env file.')
if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing from the .env file.')

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }

async function importBatch(batch, batchNumber, totalBatches) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const { error } = await supabase.from('cards').upsert(batch, {
        onConflict: 'card_key',
        ignoreDuplicates: false,
      })
      if (error) throw new Error(error.message)
      console.log(`Batch ${batchNumber.toLocaleString()} of ${totalBatches.toLocaleString()} complete.`)
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (attempt === MAX_RETRIES) throw new Error(`Batch ${batchNumber} failed after ${MAX_RETRIES} attempts: ${message}`)
      const wait = attempt * 3000
      console.warn(`Batch ${batchNumber} attempt ${attempt} failed: ${message}`)
      console.warn(`Retrying in ${wait / 1000} seconds...`)
      await sleep(wait)
    }
  }
}

console.log('\nElements Baseball card importer — live CSV source')
console.log('------------------------------------------------')
console.log('Downloading current CARDS worksheet...')

const csv = await fetchCardsCsv()
const prepared = prepareCardsFromCsv(csv)

console.log(`${prepared.cards.length.toLocaleString()} unique cards prepared.`)
console.log(`${prepared.hitterChartsChecked.toLocaleString()} hitter charts validated.`)
console.log(`${prepared.pitcherChartsChecked.toLocaleString()} pitcher charts validated.`)
console.log(`${prepared.sourceCorrections.length.toLocaleString()} known source anomalies normalized in the import stream.`)

if (prepared.sourceCorrections.length > 0) {
  for (const item of prepared.sourceCorrections) {
    console.log(`Source correction: ${item.card_key} — moved ${item.value} from ${item.from_field} to ${item.to_field}.`)
  }
}

if (prepared.chartIssues.length > 0) {
  console.error(`\nIMPORT BLOCKED: ${prepared.chartIssues.length.toLocaleString()} invalid populated charts were found.`)
  console.error('Run "npm run audit:cards" for a detailed report. No Supabase rows were changed.')
  process.exit(2)
}

const totalBatches = Math.ceil(prepared.cards.length / BATCH_SIZE)
console.log(`All populated charts passed 1-20 validation.`)
console.log(`Importing ${totalBatches.toLocaleString()} batches...\n`)

for (let start = 0; start < prepared.cards.length; start += BATCH_SIZE) {
  const batch = prepared.cards.slice(start, start + BATCH_SIZE)
  await importBatch(batch, Math.floor(start / BATCH_SIZE) + 1, totalBatches)
}

const { count, error } = await supabase.from('cards').select('*', { count: 'exact', head: true })
if (error) console.warn(`Import completed, but final count check failed: ${error.message}`)

console.log('\n------------------------------------------------')
console.log('Import complete.')
console.log(`${prepared.cards.length.toLocaleString()} unique cards processed.`)
if (count !== null) console.log(`Supabase cards table contains ${count.toLocaleString()} records.`)
