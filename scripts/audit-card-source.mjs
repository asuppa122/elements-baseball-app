import fs from 'node:fs'
import { fetchCardsCsv, findCard, prepareCardsFromCsv } from './card-source.mjs'

console.log('\nElements Baseball live card-source audit')
console.log('----------------------------------------')
console.log('Downloading the CARDS worksheet as raw CSV values...')

const csv = await fetchCardsCsv()
const audit = prepareCardsFromCsv(csv)

const bobby = findCard(audit.cards, 'Bobby Williams 1925 CAG')
const earl = findCard(audit.cards, 'Earl Gurley 1925 TOT')

const report = {
  generated_at: new Date().toISOString(),
  source_rows: audit.sourceRows,
  unique_cards: audit.cards.length,
  skipped_rows: audit.skippedRows,
  duplicate_card_keys: audit.duplicateKeys,
  hitter_charts_checked: audit.hitterChartsChecked,
  pitcher_charts_checked: audit.pitcherChartsChecked,
  invalid_chart_count: audit.chartIssues.length,
  known_source_correction_count: audit.sourceCorrections.length,
  known_source_corrections: audit.sourceCorrections,
  sample_verification: {
    bobby_williams_1925_cag_hitter_k: bobby?.hitter_k ?? null,
    earl_gurley_1925_tot_pitcher_pu: earl?.pitcher_pu ?? null,
  },
  chart_issues: audit.chartIssues,
}

fs.writeFileSync(new URL('../card-source-audit.json', import.meta.url), JSON.stringify(report, null, 2))

console.log(`Source rows: ${audit.sourceRows.toLocaleString()}`)
console.log(`Unique cards: ${audit.cards.length.toLocaleString()}`)
console.log(`Hitter charts checked: ${audit.hitterChartsChecked.toLocaleString()}`)
console.log(`Pitcher charts checked: ${audit.pitcherChartsChecked.toLocaleString()}`)
console.log(`Known source anomalies normalized: ${audit.sourceCorrections.length.toLocaleString()}`)
console.log(`Invalid charts: ${audit.chartIssues.length.toLocaleString()}`)
console.log('')
if (audit.sourceCorrections.length > 0) {
  console.log('Known source anomalies normalized in-memory (workbook unchanged):')
  for (const item of audit.sourceCorrections) {
    console.log(`- ${item.card_key}: moved ${item.value} from ${item.from_field} to ${item.to_field}`)
  }
  console.log('')
}
console.log(`Bobby Williams 1925 CAG — hitter K: ${bobby?.hitter_k ?? 'NOT FOUND'}`)
console.log(`Earl Gurley 1925 TOT — pitcher PU: ${earl?.pitcher_pu ?? 'NOT FOUND'}`)
console.log('')

if (audit.chartIssues.length > 0) {
  console.log('First 10 invalid charts:')
  for (const issue of audit.chartIssues.slice(0, 10)) {
    console.log(`- ${issue.card_key} (${issue.side}) | missing: ${issue.missing_rolls.join(',') || 'none'} | overlaps: ${issue.overlapping_rolls.map((x) => x.roll).join(',') || 'none'} | parse errors: ${issue.parse_errors.join('; ') || 'none'}`)
  }
  console.log('\nFull details written to card-source-audit.json.')
  process.exitCode = 2
} else {
  console.log('PASS: Every populated chart covers rolls 1-20 exactly once.')
  console.log('Audit details written to card-source-audit.json.')
}
