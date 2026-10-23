import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { calculateCalendarStatistics } from './lib/calendar-statistics.mjs'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const recordsRoot = join(projectRoot, 'server', 'data', 'districts', 'records')
const files = readdirSync(recordsRoot).filter(file => file.endsWith('.json')).sort()
let updatedFiles = 0
let generatedCalendars = 0

for (const file of files) {
  const path = join(recordsRoot, file)
  const original = readFileSync(path, 'utf8')
  const record = JSON.parse(original)

  for (const calendar of Object.values(record.schoolYears || {})) {
    calendar.statistics = calculateCalendarStatistics(calendar, { preserveStoredBreakWording: true })
    generatedCalendars += 1
  }

  const generated = `${JSON.stringify(record, null, 2)}\n`
  if (generated !== original) {
    writeFileSync(path, generated)
    updatedFiles += 1
  }
}

console.log(`Generated stored statistics for ${generatedCalendars} calendars; updated ${updatedFiles} record files.`)
