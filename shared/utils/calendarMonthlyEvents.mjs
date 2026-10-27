import { getEventTypes } from './eventTypes.mjs'
import { isConditionalAttendance } from './calendarAttendance.mjs'
import { groupCalendarEvents } from './calendarEventDisplay.mjs'

/** Shared by the web month grids and the printable calendar. */
export function monthlyCalendarEvents(events, firstDay, lastDay) {
  return events.filter(event => {
    if (!event.dateStart || event.isDateConfirmed === false) return false
    if (['PARENT_CONFERENCE', 'TEACHER_CONFERENCE'].includes(event.eventType) && event.schoolStatus === 'schools-open') return false
    const scope = event.participantScope || ''
    if (/\b(?:staff|employees?|teachers?|administrators?|personnel)\b/i.test(scope)
      && !/\b(?:students?|parents?|famil(?:y|ies)|guardians?|graduates?|seniors?)\b/i.test(scope)) return false
    const title = event.displayName || event.name
    if (/\b(?:board|committee|administrative|administration)\s+meetings?\b|\bpayroll\b|\badministrative calendar\b/i.test(title)) return false
    const staffWork = /\b(?:staff|teacher|employee|planning|inservice|in-service|professional development)\b/i.test(title)
      && !/\bmeet the teacher\b/i.test(title)
    const outsideYear = firstDay && lastDay && ((event.dateEnd || event.dateStart) < firstDay || event.dateStart > lastDay)
    return !(staffWork && outsideYear && !isConditionalAttendance(event))
  })
}

export function isMonthListEvent(event) {
  if (event.coveredByBreakEventId) return false
  return event.isFinalStudentDate === true
    || isConditionalAttendance(event)
    || event.schoolStatus === 'program-not-scheduled'
    || event.schoolStatus === 'conditional-attendance'
    || getEventTypes(event).some(type =>
      ['FIRST_DAY', 'LAST_DAY', 'CALENDAR_START', 'CALENDAR_END', 'REGENTS', 'EXAM', 'FINAL_EXAM', 'HOLIDAY'].includes(type)
      || type.endsWith('_BREAK'))
    || ['schools-closed', 'no-classes', 'no-regular-classes', 'no-students', 'staff-only'].includes(event.schoolStatus)
}

export function monthlyCalendarListEvents(events, groups = []) {
  return groupCalendarEvents(events, groups).filter(event => event.dateStart && isMonthListEvent(event))
    .sort((a, b) => a.dateStart.localeCompare(b.dateStart)
      || (a.dateEnd || a.dateStart).localeCompare(b.dateEnd || b.dateStart)
      || (a.displayName || a.name).localeCompare(b.displayName || b.name))
}

export function monthlyEventTone(events) {
  if (events.some(isConditionalAttendance)) return 'conditional'
  if (events.some(event => ['FIRST_DAY', 'LAST_DAY', 'CALENDAR_START', 'CALENDAR_END'].includes(event.eventType) || event.isFinalStudentDate === true)) return 'boundary'
  if (events.some(event => event.eventType.endsWith('_BREAK'))) return 'break'
  if (events.some(event => event.eventType === 'HOLIDAY'
    || ['schools-closed', 'no-classes', 'no-regular-classes', 'no-students', 'staff-only'].includes(event.schoolStatus))) return 'holiday'
  return events.length ? 'important' : null
}
