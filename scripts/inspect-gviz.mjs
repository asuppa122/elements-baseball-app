import fs from 'node:fs'

const filePath = new URL('../json.txt', import.meta.url)
const rawText = fs.readFileSync(filePath, 'utf8').trim()

const startMarker = 'google.visualization.Query.setResponse('

if (!rawText.includes(startMarker)) {
  throw new Error(
    'The file does not appear to be a Google Visualization response.'
  )
}

const jsonStart = rawText.indexOf(startMarker) + startMarker.length
const jsonEnd = rawText.lastIndexOf(');')

if (jsonEnd === -1) {
  throw new Error('Could not locate the end of the Google response.')
}

const response = JSON.parse(rawText.slice(jsonStart, jsonEnd))
const table = response.table

if (!table?.cols || !table?.rows) {
  throw new Error('The Google response does not contain a valid table.')
}

const columns = table.cols.map((column, index) => ({
  number: index + 1,
  letter: column.id,
  label: column.label || '(blank)',
  type: column.type,
}))

const valueFromCell = (cell) => {
  if (!cell) return null
  return cell.v ?? null
}

const firstPopulatedRow = table.rows.find((row) =>
  row.c?.some((cell) => valueFromCell(cell) !== null)
)

const sampleCard = {}

if (firstPopulatedRow) {
  columns.forEach((column, index) => {
    sampleCard[`${column.letter} — ${column.label}`] = valueFromCell(
      firstPopulatedRow.c?.[index]
    )
  })
}

console.log('\n=== FILE SUMMARY ===')
console.log(`Columns: ${columns.length}`)
console.log(`Rows: ${table.rows.length}`)

console.log('\n=== COLUMN DEFINITIONS ===')
console.table(columns)

console.log('\n=== FIRST POPULATED CARD ===')
console.dir(sampleCard, {
  depth: null,
  colors: true,
  maxArrayLength: null,
})