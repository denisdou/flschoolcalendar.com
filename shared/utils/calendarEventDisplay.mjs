import { getEventTypes, hasEventType } from './eventTypes.mjs'
import { isConditionalAttendance } from './calendarAttendance.mjs'

const breakTypes = new Set(['THANKSGIVING_BREAK', 'WINTER_BREAK', 'SPRING_BREAK', 'FALL_BREAK', 'STUDENT_BREAK'])
const noSchoolStatuses = new Set(['schools-closed', 'no-classes', 'no-students', 'conditional-attendance'])

/** Never bridge missing dates, hide attendance days, or combine unrelated school scopes. */
export function eventDisplayGroupError(events, group) {
  if (!group || typeof group.id !== 'string' || !group.id.trim()
    || typeof group.name !== 'string' || !group.name.trim()
    || typeof group.note !== 'string' || !group.note.trim()
    || !Array.isArray(group.eventIds) || group.eventIds.length < 2
    || new Set(group.eventIds).size !== group.eventIds.length) return 'Groups require an ID, name, note and at least two distinct event IDs.'
  if (events.some(event => event.id === group.id)) return 'A display group ID must differ from canonical event IDs.'
  const parts = group.eventIds.map(id => events.find(event => event.id === id))
  if (parts.some(event => !event?.dateStart || event.isDateConfirmed === false || event.gradeScope
    || !noSchoolStatuses.has(event.schoolStatus))) return 'Group components must be confirmed, calendar-wide no-school events.'
  const type = parts[0].eventType
  if (!breakTypes.has(type) || parts.some(event => event.eventType !== type)) return 'Only components of the same named break type may be grouped.'
  const ordered = [...parts].sort((a, b) => a.dateStart.localeCompare(b.dateStart))
  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1]
    const nextDate = new Date((previous.dateEnd || previous.dateStart) + 'T00:00:00Z')
    if (Number.isNaN(nextDate.valueOf())) return 'Group component dates must be valid.'
    nextDate.setUTCDate(nextDate.getUTCDate() + 1)
    if (nextDate.toISOString().slice(0, 10) !== ordered[i].dateStart) return 'Break components must cover consecutive dates without gaps or overlap.'
  }
  return null
}

/** Group list and export presentation only; date grids and attendance calculations use raw events. */
export function groupCalendarEvents(events, groups = []) {
  const replacementById = new Map()
  const groupedIds = new Set()
  const groupIds = new Set()
  for (const group of groups) {
    if (eventDisplayGroupError(events, group) || groupIds.has(group.id)
      || group.eventIds.some(id => groupedIds.has(id))) continue
    const parts = group.eventIds.map(id => events.find(event => event.id === id))
      .sort((a, b) => a.dateStart.localeCompare(b.dateStart))
    const conditional = parts.find(isConditionalAttendance)
    const first = parts[0]
    replacementById.set(first.id, {
      ...first,
      id: group.id, name: group.name, displayName: undefined,
      dateEnd: parts.at(-1).dateEnd || parts.at(-1).dateStart,
      eventTypes: [...new Set(parts.flatMap(getEventTypes))],
      nameBasis: 'derived', dateBasis: 'derived',
      note: group.note, noteBasis: 'derived',
      countsAsStudentAttendanceDay: conditional ? undefined : false,
      mayBecomeAttendanceDay: conditional ? true : undefined,
      scheduledAsNoSchool: conditional ? true : undefined,
      schoolStatusLabel: conditional ? 'Scheduled break; includes possible weather make-up dates' : first.schoolStatusLabel,
      isDisplayGroup: true,
      displayGroupEventIds: [...group.eventIds],
    })
    groupIds.add(group.id)
    for (const id of group.eventIds) groupedIds.add(id)
  }
  return events.flatMap(event => replacementById.has(event.id)
    ? [replacementById.get(event.id)]
    : groupedIds.has(event.id) ? [] : [event])
}

/** Preserve a school-specific ceremony label when the primary occurrence is a district schedule boundary. */
export function secondaryGraduationLabels(event) {
  if (!hasEventType(event, 'SCHOOL_MILESTONE') || event.eventType === 'SCHOOL_MILESTONE') return []
  return [...new Set([...(event.officialLabels || []), event.officialLabel].filter(label =>
    typeof label === 'string' && /graduation/i.test(label),
  ))]
}
