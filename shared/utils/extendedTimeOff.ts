import type { CalendarEvent, DistrictCalendar, EventType } from '../types/content'
import { isConditionalAttendance } from './calendarAttendance.mjs'
import { hasEventType } from './eventTypes.mjs'

export interface DateSpan { start: string; end: string }
export interface TimeOffWindow extends DateSpan {
  name: string
  days: number
  noSchool: DateSpan[]
  weekends: DateSpan[]
  conditional: DateSpan[]
}

const dayMs = 86_400_000
const timestamp = (date: string) => Date.parse(date + 'T12:00:00Z')
const iso = (date: number) => new Date(date).toISOString().slice(0, 10)
const weekend = (date: string) => [0, 6].includes(new Date(timestamp(date)).getUTCDay())

function dateRange(start: string, end: string): string[] {
  const dates: string[] = []
  for (let date = timestamp(start); date <= timestamp(end); date += dayMs) dates.push(iso(date))
  return dates
}

function spans(dates: string[]): DateSpan[] {
  const result: DateSpan[] = []
  for (const date of dates) {
    const previous = result.at(-1)
    if (previous && timestamp(date) - timestamp(previous.end) === dayMs) previous.end = date
    else result.push({ start: date, end: date })
  }
  return result
}

/** Planning windows are derived from student attendance, never from staff holidays or early release. */
export function buildExtendedTimeOff(calendar: DistrictCalendar): TimeOffWindow[] {
  if (!calendar.firstDay || !calendar.lastDay) return []
  const closures = new Map<string, CalendarEvent[]>()
  const attendance = new Set<string>()
  for (const event of calendar.events) {
    if (!event.dateStart || event.isDateConfirmed === false || event.gradeScope) continue
    const conditional = isConditionalAttendance(event)
    const noClasses = ['no-classes', 'schools-closed', 'no-students', 'staff-only', 'program-not-scheduled'].includes(event.schoolStatus)
      && (!conditional || event.scheduledAsNoSchool === true)
    const attends = !conditional && (event.countsAsStudentAttendanceDay === true || event.schoolStatus === 'schools-open')
    if (!noClasses && !attends) continue
    for (const date of dateRange(event.dateStart, event.dateEnd || event.dateStart)) {
      if (date < calendar.firstDay || date > calendar.lastDay) continue
      if (attends) attendance.add(date)
      if (noClasses && !weekend(date)) closures.set(date, [...closures.get(date) || [], event])
    }
  }
  const windows: string[][] = []
  let current: string[] = []
  for (const date of dateRange(calendar.firstDay, calendar.lastDay)) {
    const off = !attendance.has(date) && (closures.has(date) || weekend(date))
    if (off) current.push(date)
    else if (current.length) { windows.push(current); current = [] }
  }
  if (current.length) windows.push(current)
  return windows.filter(dates => dates.length >= 4 && dates.some(date => closures.has(date))).map((dates) => {
    const start = dates[0]!
    const end = dates.at(-1)!
    const events = [...new Set(dates.flatMap(date => closures.get(date) || []))]
    const namedBreak = calendar.breaks
      .filter(item => item.dateStart <= end && item.dateEnd >= start)
      .sort((a, b) => timestamp(b.dateEnd) - timestamp(b.dateStart) - (timestamp(a.dateEnd) - timestamp(a.dateStart)))[0]
    const breakEvent = events.find(event => (['THANKSGIVING_BREAK', 'WINTER_BREAK', 'SPRING_BREAK', 'FALL_BREAK', 'STUDENT_BREAK', 'MIDWINTER_BREAK'] as EventType[]).some(type => hasEventType(event, type)))
    const label = namedBreak?.name || breakEvent?.name || events[0]?.name || 'Student Time Off'
    return {
      start, end, days: dates.length,
      name: /window$/i.test(label) ? label : label + ' Window',
      noSchool: spans(dates.filter(date => closures.has(date))),
      weekends: spans(dates.filter(date => weekend(date))),
      conditional: spans(dates.filter(date => closures.get(date)?.some(isConditionalAttendance))),
    }
  })
}
