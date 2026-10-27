import type { CalendarEvent, EventType } from '../types/content'
import { getEventTypes, hasEventType } from './eventTypes.mjs'

const boundaries: EventType[] = ['FIRST_DAY', 'LAST_DAY', 'CALENDAR_START', 'CALENDAR_END']
const noSchoolStatuses = new Set<CalendarEvent['schoolStatus']>([
  'schools-closed', 'no-classes', 'no-students', 'staff-only',
  'no-regular-classes', 'conditional-attendance', 'program-not-scheduled',
])
const importantLabels: Partial<Record<EventType, string>> = {
  GRADING_PERIOD_START: 'Grading Period Starts',
  GRADING_PERIOD_END: 'Grading Period Ends',
  SEMESTER_START: 'Semester Starts',
  SEMESTER_END: 'Semester Ends',
  EXAM: 'Exams', FINAL_EXAM: 'Final Exams', STATE_TEST: 'State Testing', REGENTS: 'Regents Exams',
  REPORT_CARD: 'Report Cards', PROGRESS_REPORT: 'Progress Reports',
  PARENT_CONFERENCE: 'Parent Conference', TEACHER_CONFERENCE: 'Teacher Conference',
  MEET_THE_TEACHER: 'Meet the Teacher', OPEN_HOUSE: 'Open House', BACK_TO_SCHOOL_NIGHT: 'Back-to-School Night',
  SCHOOL_MILESTONE: 'School Milestone',
  MODIFIED_DAY: 'Modified Instructional Day', LATE_START: 'Late Start',
}
const studentFamilyTypes = new Set<EventType>([
  'GRADING_PERIOD_START', 'GRADING_PERIOD_END', 'SEMESTER_START', 'SEMESTER_END',
  'COLLEGE_TERM_START', 'COLLEGE_TERM_END', 'EXAM', 'FINAL_EXAM', 'STATE_TEST', 'REGENTS',
  'REPORT_CARD', 'PROGRESS_REPORT', 'PARENT_CONFERENCE', 'MEET_THE_TEACHER',
  'OPEN_HOUSE', 'BACK_TO_SCHOOL_NIGHT', 'MODIFIED_DAY', 'LATE_START',
  'INTERSESSION', 'INTERSESSION_CLASSES', 'SUMMER_PROGRAM', 'ENRICHMENT_DAY',
  'PROGRAM_EXTENDED_DAY', 'PROGRAM_ADSY_DAY', 'REMOTE_INSTRUCTION',
  'WEATHER_DAY', 'BAD_WEATHER_DAY', 'SNOW_DAY', 'MAKEUP_DAY',
])

function isStudentFamilyImportantDate(event: CalendarEvent): boolean {
  const familyAudience = /\b(?:students?|parents?|famil(?:y|ies)|guardians?|graduates?|seniors?|pupils?)\b/i
  const staffAudience = /\b(?:staff|employees?|teachers?|personnel|administrators?)\b/i
  // Explicit employee-only scope takes precedence over a generic milestone tag.
  if (staffAudience.test(event.participantScope || '') && !familyAudience.test(event.participantScope || '')) return false
  if (getEventTypes(event).some(type => studentFamilyTypes.has(type))) return true

  const title = [event.displayName, event.name, event.officialLabel, ...(event.officialLabels || [])].filter(Boolean).join(' ')
  const familyFacing = familyAudience.test(title)
    || /\b(?:graduation|baccalaureate|homecoming|interim|meet the teacher)\b/i.test(title)
  const staffBusiness = staffAudience.test(title)
    || /\b(?:planning|workdays?|professional (?:development|learning)|payroll|board meeting)\b/i.test(title)
  if (staffBusiness && !familyFacing) return false
  if (hasEventType(event, 'TEACHER_CONFERENCE')) return familyFacing
  if (!hasEventType(event, 'SCHOOL_MILESTONE')) return false
  return familyFacing || event.schoolStatus === 'schools-open'
    || /\b(?:orientation|registration|enrollment|activities|events after sundown|open house|classes? resume|return (?:from|after))\b/i.test(title)
}

export function isEarlyReleaseEvent(event: CalendarEvent): boolean {
  // A modified instructional day does not establish early dismissal by itself.
  if (event.schoolStatus === 'modified-schedule' && hasEventType(event, 'MODIFIED_DAY')) return false
  return event.schoolStatus === 'early-dismissal'
    || ['EARLY_RELEASE', 'HALF_DAY', 'MINIMUM_DAY'].some(type => hasEventType(event, type as EventType))
}

function project(event: CalendarEvent, types: EventType[], name: string): CalendarEvent {
  return {
    ...event, eventType: types[0]!, eventTypes: types,
    displayName: name, displayNameBasis: 'derived',
  }
}

function milestoneLabel(event: CalendarEvent): string {
  const labels = [...new Set([event.displayName || event.name, ...(event.officialLabels || []), event.officialLabel || ''])]
  const ceremony = labels.flatMap(label => label.split(/\s*(?:\/|\band\b|—)\s*/i))
    .filter(label => /graduation|baccalaureate|homecoming/i.test(label)
      && !/early (?:dismissal|release)|last day|first day/i.test(label))
  const unique = [...new Set(ceremony)]
  return unique.filter(label => !unique.some(other => other !== label && other.toLowerCase().includes(label.toLowerCase())))
    .join(' / ') || 'School Milestone'
}

/** View-only partitions: canonical dates, scopes, provenance and attendance remain untouched. */
export function splitCalendarDetailEvents(events: CalendarEvent[]) {
  const keyDates: CalendarEvent[] = []
  const earlyRelease: CalendarEvent[] = []
  const otherImportant: CalendarEvent[] = []

  for (const event of events) {
    if (!event.dateStart || event.isDateConfirmed === false) {
      if (event.candidateDates?.length) otherImportant.push(event)
      continue
    }
    const types = getEventTypes(event)
    const boundary = boundaries.find(type => types.includes(type))
    const early = isEarlyReleaseEvent(event)
    const key = Boolean(boundary) || (!early && noSchoolStatuses.has(event.schoolStatus))
    const important = types.filter(type => importantLabels[type] !== undefined)

    if (key) {
      if (boundary) {
        const boundaryLabel = {
          FIRST_DAY: 'First Day of School', LAST_DAY: 'Last Day of School',
          CALENDAR_START: 'Calendar Start', CALENDAR_END: 'Calendar End',
        }[boundary as 'FIRST_DAY' | 'LAST_DAY' | 'CALENDAR_START' | 'CALENDAR_END']
        const originalName = event.displayName || event.name
        const label = /\bearly\b|half[ -]day|grading|quarter|semester|exam|graduation|baccalaureate|modified/i.test(originalName)
          ? boundaryLabel : originalName
        keyDates.push({
          ...project(event, [boundary], label),
          schoolStatus: early ? 'schools-open' : event.schoolStatus,
          schoolStatusLabel: undefined, note: null,
        })
      }
      else if (important.length) {
        const name = (event.displayName || event.name).split(/\s*(?:\/|—|\band\b)\s*/i)
          .filter(label => !/grading|quarter|semester|report|conference|graduation|baccalaureate|homecoming/i.test(label))
          .join(' / ') || 'No School for Students'
        const closureTypes = types.filter(type => !important.includes(type))
        keyDates.push({
          ...project(event, closureTypes.length ? closureTypes : ['NON_STUDENT_DAY'], name),
          schoolStatusLabel: undefined, note: null,
        })
      }
      else keyDates.push(event)
    }
    if (early) {
      // Keep the original timing, audience and caveats in notes; avoid repeating
      // graduation/academic labels in the early-release event title.
      const name = hasEventType(event, 'HALF_DAY') ? 'Half Day' : 'Early Release'
      earlyRelease.push(boundary || important.length
        ? project(event, types.filter(type => ['EARLY_RELEASE', 'HALF_DAY', 'MINIMUM_DAY'].includes(type)).length
            ? types.filter(type => ['EARLY_RELEASE', 'HALF_DAY', 'MINIMUM_DAY'].includes(type)) : ['EARLY_RELEASE'], name)
        : event)
    }
    if (!key && !early) otherImportant.push(event)
    else if (important.length) {
      const name = important.map(type => type === 'SCHOOL_MILESTONE'
        ? milestoneLabel(event) : importantLabels[type]!).join(' / ')
      otherImportant.push({
        ...project(event, important, name),
        schoolStatus: 'not-applicable', schoolStatusLabel: undefined,
      })
    }
  }
  const byDate = (a: CalendarEvent, b: CalendarEvent) =>
    (a.dateStart || a.candidateDates?.[0]?.date || '').localeCompare(b.dateStart || b.candidateDates?.[0]?.date || '')
  return {
    keyDates: keyDates.sort(byDate),
    earlyRelease: earlyRelease.sort(byDate),
    otherImportant: otherImportant.filter(isStudentFamilyImportantDate).sort(byDate),
  }
}
