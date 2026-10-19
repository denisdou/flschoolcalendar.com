import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getEventTypes } from '../shared/utils/eventTypes.mjs'
import { isCalculatedScheduleEntry } from '../shared/utils/eventEvidence.mjs'
import { conditionalAttendanceDescription, isConditionalAttendance } from '../shared/utils/calendarAttendance.mjs'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const recordsRoot = join(projectRoot, 'server', 'data', 'districts', 'records')
const outputRoot = join(projectRoot, 'public', 'ics')
const localIcsPattern = /^\/ics\/[a-z0-9][a-z0-9-]*\.ics$/

function escapeText(value) {
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('\n', '\\n')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
}

function compactDate(value) {
  return value.replaceAll('-', '')
}

function addOneDay(value) {
  const date = new Date(value + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + 1)
  return compactDate(date.toISOString().slice(0, 10))
}

function foldLine(line) {
  const chunks = []
  let chunk = ''
  let limit = 75

  for (const character of line) {
    if (Buffer.byteLength(chunk + character, 'utf8') > limit) {
      chunks.push(chunk)
      chunk = character
      limit = 74
    }
    else {
      chunk += character
    }
  }
  chunks.push(chunk)
  return chunks.join('\r\n ')
}

function isCalendarVisibleEvent(event) {
  return event.excludeFromIcs !== true
    && event.isDateConfirmed !== false
    && !['CALENDAR_START', 'CALENDAR_END'].includes(event.eventType)
    && !(['PARENT_CONFERENCE', 'TEACHER_CONFERENCE'].includes(event.eventType) && event.schoolStatus === 'schools-open')
}

function buildCalendar(record, calendar) {
  const sourceById = new Map(calendar.sources.map(source => [source.id, source]))
  const stampDate = calendar.verifiedAt || calendar.publishedAt || calendar.firstDay
  const timestamp = compactDate(stampDate) + 'T000000Z'
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FL School Calendar//District Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + escapeText(
      record.district.shortName
      + ' '
      + calendar.schoolYear
      + (calendar.calendarLabel ? ' ' + calendar.calendarLabel : ''),
    ),
    'X-WR-CALDESC:' + escapeText(calendar.seo.description),
  ]
  if (calendar.calendarScope) {
    lines.push('X-TXSC-CALENDAR-SCOPE:' + escapeText(calendar.calendarScope))
  }
  if (calendar.excludedCampuses?.length) {
    lines.push('X-TXSC-EXCLUDED-CAMPUSES:' + escapeText(calendar.excludedCampuses.join(', ')))
  }

  for (const event of calendar.events.filter(isCalendarVisibleEvent)) {
    const displayName = event.displayName || event.name
    const officialLabel = event.officialLabel || (event.displayName ? event.name : null)
    const officialLabels = event.officialLabels?.length ? event.officialLabels : null
    const source = sourceById.get(event.sourceId)
    const timeSource = event.timeSourceId ? sourceById.get(event.timeSourceId) : null
    const scheduleSource = event.scheduleSourceId ? sourceById.get(event.scheduleSourceId) : null
    const scheduleSources = (event.scheduleSourceIds || [])
      .map(sourceId => sourceById.get(sourceId))
      .filter(item => item && item.id !== source?.id && item.id !== scheduleSource?.id)
    const attendanceSource = event.attendanceStatusBasisSourceId ? sourceById.get(event.attendanceStatusBasisSourceId) : null
    const noteSources = (event.noteSourceIds || [])
      .map(sourceId => sourceById.get(sourceId))
      .filter(item => item && item.id !== source?.id)
    const conflictSources = (event.conflictSourceIds || [])
      .map(sourceId => sourceById.get(sourceId))
      .filter(Boolean)
    const descriptionParts = [
      'School status: ' + (isConditionalAttendance(event)
        ? conditionalAttendanceDescription(event)
        : event.schoolStatusLabel || event.schoolStatus.replaceAll('-', ' ')),
      isCalculatedScheduleEntry(event) ? 'Calculated from calendar: these dates are grouped or inferred from published entries.' : null,
      officialLabels
        ? 'Official calendar labels: ' + officialLabels.join(' / ')
        : officialLabel && officialLabel !== displayName ? 'Official calendar label: ' + officialLabel : null,
      event.note,
      event.isFinalStudentDate === true && event.finalStudentDateBasis === 'derived'
        ? event.finalStudentDateScope === 'regular-year'
          ? 'Final regular-year student date shown: inferred from academic-calendar boundaries, not a separately printed last-day label. Later supplemental programs or care are outside this regular-year boundary.'
          : 'Final student date shown: inferred from academic-calendar boundaries, not a separately printed last-day label.'
        : null,
      event.scheduleStatus === 'regular' ? 'Regular schedule: ' + event.scheduleScope : null,
      event.schoolStatus === 'program-not-scheduled' ? 'Program scope: ' + event.scheduleScope : null,
      ...(event.scheduleDetails || []).map(detail => detail.gradeScope + ': half day'),
      source ? 'Source: ' + source.url : null,
      event.note && noteSources.length ? 'Note sources: ' + noteSources.map(item => item.url).join(', ') : null,
      timeSource && timeSource.id !== source?.id ? 'Time source: ' + timeSource.url : null,
      scheduleSource && scheduleSource.id !== source?.id ? 'Schedule source: ' + scheduleSource.url : null,
      scheduleSources.length ? 'Schedule sources: ' + scheduleSources.map(item => item.url).join(', ') : null,
      attendanceSource && attendanceSource.id !== source?.id ? 'Attendance status source: ' + attendanceSource.url : null,
      event.sourceConflict && event.conflictField ? 'Conflicting field: ' + event.conflictField : null,
      event.sourceInternalConflict ? 'Official source contains internally conflicting labels for this event.' : null,
      calendar.calendarScope ? 'Calendar scope: ' + calendar.calendarScope : null,
      calendar.excludedCampuses?.length ? 'Excluded campuses: ' + calendar.excludedCampuses.join(', ') : null,
      event.sourceConflict && conflictSources.length
        ? 'Conflicting official source' + (conflictSources.length === 1 ? '' : 's') + ': ' + conflictSources.map(item => item.url).join(', ')
        : null,
    ].filter(Boolean)

    lines.push(
      'BEGIN:VEVENT',
      'UID:' + escapeText(event.id + '@flschoolcalendar.com'),
      'DTSTAMP:' + timestamp,
      'DTSTART;VALUE=DATE:' + compactDate(event.dateStart),
      'DTEND;VALUE=DATE:' + addOneDay(event.dateEnd || event.dateStart),
      'SUMMARY:' + escapeText(displayName),
      'DESCRIPTION:' + escapeText(descriptionParts.join('\n')),
      'CATEGORIES:' + getEventTypes(event).map(escapeText).join(','),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

mkdirSync(outputRoot, { recursive: true })
for (const file of readdirSync(outputRoot)) {
  if (file.endsWith('.ics')) unlinkSync(join(outputRoot, file))
}

let generatedCount = 0
for (const file of readdirSync(recordsRoot).filter(file => file.endsWith('.json')).sort()) {
  const record = JSON.parse(readFileSync(join(recordsRoot, file), 'utf8'))

  for (const calendar of Object.values(record.schoolYears || {})) {
    if (!calendar.indexable || !calendar.actions?.staticIcsUrl) continue
    if (!localIcsPattern.test(calendar.actions.staticIcsUrl)) {
      throw new Error('ICS output path must use /ics/<filename>.ics: ' + calendar.actions.staticIcsUrl)
    }
    if (!calendar.events?.length) {
      throw new Error('Cannot generate an empty ICS calendar: ' + record.district.slug + '/' + calendar.schoolYear)
    }

    const filename = basename(calendar.actions.staticIcsUrl)
    writeFileSync(join(outputRoot, filename), buildCalendar(record, calendar), 'utf8')
    generatedCount += 1
  }
}

if (!existsSync(outputRoot)) throw new Error('ICS output directory was not created')
console.log('Generated ' + generatedCount + ' static ICS calendars in public/ics.')
