import { createHash } from 'node:crypto'
import { getEventTypes, hasEventType } from '../../shared/utils/eventTypes.mjs'
import { isConditionalAttendance, conditionalAttendanceDescription } from '../../shared/utils/calendarAttendance.mjs'
import { secondaryGraduationLabels } from '../../shared/utils/calendarEventDisplay.mjs'
import { monthlyCalendarEvents, monthlyCalendarListEvents, monthlyEventTone } from '../../shared/utils/calendarMonthlyEvents.mjs'
import { isCalculatedScheduleEntry } from '../../shared/utils/eventEvidence.mjs'
import { splitCalendarDetailEvents } from '../../shared/utils/calendarDetailSections.ts'
import { calendarPdfFilename } from '../../shared/utils/calendarPdf.ts'

export const pdfHash = value => createHash('sha256').update(value).digest('hex')

export function pdfPalette(css) {
  const root = css.match(/:root\s*\{([\s\S]*?)\}/)?.[1] || ''
  const names = ['brand', 'brand-soft', 'canvas', 'panel', 'panel-muted', 'panel-strong', 'line', 'ink', 'ink-muted', 'ink-dim', 'positive', 'positive-soft', 'warning-ink', 'warning-soft']
  return Object.fromEntries(names.map(name => {
    const value = root.match(new RegExp(`--fl-${name}:\\s*hsl\\(([^)]+)\\)`))?.[1]
    if (!value) throw new Error('Missing website PDF color: ' + name)
    const [h, s, l] = value.match(/[\d.]+/g).map(Number)
    return [name, [h / 360, s / 100, l / 100]]
  }))
}

function status(event) {
  if (isConditionalAttendance(event)) return conditionalAttendanceDescription(event)
  if (event.schoolStatusLabel) return event.schoolStatusLabel
  if (hasEventType(event, 'FIRST_DAY')) return 'School opens'
  if (hasEventType(event, 'LAST_DAY')) return 'Last student day'
  if (hasEventType(event, 'HALF_DAY')) return 'Half day'
  if (event.schoolStatus === 'early-dismissal') return 'Early dismissal'
  if (['no-classes', 'no-students', 'staff-only'].includes(event.schoolStatus)) return 'No student classes'
  return event.schoolStatus.replaceAll('-', ' ')
}

function pdfEvent(event) {
  return {
    id: event.id, name: event.displayName || event.name,
    start: event.dateStart, end: event.dateEnd || event.dateStart,
    types: getEventTypes(event), status: status(event), schoolStatus: event.schoolStatus,
    scope: event.gradeScope || event.participantScope || event.scheduleScope || null,
    note: event.note || null,
    candidates: event.isDateConfirmed === false ? event.candidateDates || [] : [],
    conditional: isConditionalAttendance(event),
    conditionalNote: isConditionalAttendance(event) ? conditionalAttendanceDescription(event) : null,
    attendance: event.countsAsStudentAttendanceDay === true,
    scheduleDetails: event.scheduleDetails || [],
    confirmed: event.isDateConfirmed !== false,
    calculated: isCalculatedScheduleEntry(event),
    context: secondaryGraduationLabels(event),
    displayGroup: Boolean(event.isDisplayGroup),
    showNote: Boolean(event.isDisplayGroup || (hasEventType(event, 'LAST_DAY') && hasEventType(event, 'SCHOOL_MILESTONE'))),
    scheduleConflict: Boolean(event.sourceConflict || event.sourceInternalConflict),
  }
}

export function buildPdfJobs(records, palette, siteUrl = 'https://flschoolcalendar.com') {
  const jobs = []
  const usedNames = new Set()
  for (const record of records) for (const calendar of Object.values(record.schoolYears || {})) {
    if (!calendar.indexable || calendar.status === 'draft') continue
    if (!calendar.verifiedAt || !/^\d{4}-\d{2}-\d{2}$/.test(calendar.contentUpdatedAt || '')) {
      throw new Error(`Audit and article update dates are required before PDF generation: ${record.district.slug}/${calendar.schoolYear}`)
    }
    if (!calendar.firstDay || !calendar.lastDay || !calendar.events.length) throw new Error('Cannot print an incomplete school calendar')
    const filename = calendarPdfFilename(record.district, calendar)
    if (usedNames.has(filename)) throw new Error('Duplicate calendar PDF filename: ' + filename)
    usedNames.add(filename)
    const sections = splitCalendarDetailEvents(calendar.events)
    const gridEvents = monthlyCalendarEvents(calendar.events, calendar.firstDay, calendar.lastDay)
    const monthEvents = monthlyCalendarListEvents(gridEvents, calendar.eventDisplayGroups)
    const eventsByDate = new Map()
    for (const event of gridEvents) {
      let cursor = event.dateStart
      const end = event.dateEnd || event.dateStart
      for (let count = 0; cursor <= end && count < 370; count++) {
        eventsByDate.set(cursor, [...(eventsByDate.get(cursor) || []), event])
        const next = new Date(cursor + 'T12:00:00Z')
        next.setUTCDate(next.getUTCDate() + 1)
        cursor = next.toISOString().slice(0, 10)
      }
    }
    const payload = {
      filename, palette, districtSlug: record.district.slug,
      route: calendar.routeSlug || calendar.schoolYear,
      title: calendar.hero.heading,
      district: record.district.name, year: calendar.schoolYear, label: calendar.calendarLabel || null,
      firstDay: calendar.firstDay, lastDay: calendar.lastDay,
      updatedAt: calendar.contentUpdatedAt, timeZone: record.district.timeZone,
      pageUrl: `${siteUrl.replace(/\/$/, '')}/${record.district.slug}/${calendar.routeSlug || calendar.schoolYear}/`,
      earlyRelease: sections.earlyRelease.map(pdfEvent),
      monthEvents: monthEvents.map(pdfEvent),
      gridEvents: gridEvents.map(pdfEvent),
      dayTones: Object.fromEntries([...eventsByDate].map(([date, events]) => [date, monthlyEventTone(events)])),
    }
    jobs.push({ filename, payload })
  }
  return jobs.sort((a, b) => a.filename.localeCompare(b.filename))
}
