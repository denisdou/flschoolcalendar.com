<script setup lang="ts">
import type { CalendarEvent, CalendarEventDisplayGroup } from '~~/shared/types/content'
import { groupCalendarEvents, secondaryGraduationLabels, type CalendarDisplayEvent } from '~~/shared/utils/calendarEventDisplay.mjs'
import { formatDateRange } from '~~/shared/utils/content'
import { hasEventType } from '~~/shared/utils/eventTypes.mjs'
import { isCalculatedScheduleEntry } from '~~/shared/utils/eventEvidence.mjs'
import { conditionalAttendanceLabel, isConditionalAttendance } from '~~/shared/utils/calendarAttendance.mjs'

const props = withDefaults(defineProps<{
  events: CalendarEvent[]
  eventDisplayGroups?: CalendarEventDisplayGroup[]
  districtName: string
  schoolYear: string
  sectionId?: string
  eyebrow?: string
  heading?: string
  caption?: string
  showStatus?: boolean
  showDetails?: boolean
  concise?: boolean
}>(), {
  sectionId: 'key-dates-table',
  eyebrow: 'Official calendar',
  heading: 'Key dates',
  caption: '',
  showStatus: true,
  showDetails: false,
  concise: false,
})

const statusLabels: Record<CalendarEvent['schoolStatus'], string> = {
  'schools-open': 'Schools open',
  'schools-closed': 'Schools closed',
  'no-classes': 'No classes',
  'no-regular-classes': 'No regular classes',
  'early-dismissal': 'Early dismissal',
  'modified-schedule': 'Modified schedule',
  'special-schedule': 'Special schedule',
  'program-specific': 'Program-specific',
  'program-not-scheduled': 'No program session',
  'optional-attendance': 'Optional',
  'varied-by-school': 'Varies by school',
  'varied-by-grade': 'Varies by grade',
  'remote-instruction': 'Remote instruction',
  'no-students': 'No students',
  'staff-only': 'Staff only',
  'exam-day': 'Exam day',
  'not-applicable': 'Not applicable',
  'conditional-attendance': 'If needed',
  'unknown': 'Unknown',
}

const noSchoolBreakTypes = new Set<CalendarEvent['eventType']>([
  'STUDENT_BREAK',
  'FALL_BREAK',
  'THANKSGIVING_BREAK',
  'WINTER_BREAK',
  'MIDWINTER_BREAK',
  'TRACK_BREAK',
  'SPRING_BREAK',
  'INTERSESSION',
])

function isNoSchoolBreak(event: CalendarEvent): boolean {
  return (event.schoolStatus === 'no-students' || event.schoolStatus === 'no-classes')
    && noSchoolBreakTypes.has(event.eventType)
}

function isShortenedDay(event: CalendarEvent): boolean {
  if (event.schoolStatus === 'modified-schedule' && hasEventType(event, 'MODIFIED_DAY')) return false
  return hasEventType(event, 'EARLY_RELEASE') || hasEventType(event, 'HALF_DAY')
}

function statusLabel(event: CalendarEvent): string {
  if (isConditionalAttendance(event)) return conditionalAttendanceLabel(event)
  if (event.schoolStatus === 'modified-schedule' && hasEventType(event, 'MODIFIED_DAY')) {
    return hasEventType(event, 'LAST_DAY') ? 'Last day / modified instructional day' : 'Modified instructional day'
  }
  if (event.schoolStatusLabel) {
    const label = event.schoolStatusLabel
    const mentionsShortenedDay = /\b(?:early[\s-]+(?:dismissal|release)|half[\s-]+day)\b/i.test(label)
    return event.schoolStatus === 'early-dismissal' && !mentionsShortenedDay
      ? label + ' / early dismissal'
      : label
  }
  if (event.eventType === 'CALENDAR_START') return 'First shown'
  if (event.eventType === 'CALENDAR_END') return 'Last shown'
  if (event.eventType === 'FIRST_DAY') return 'School opens'
  if (event.isFinalStudentDate === true && event.finalStudentDateBasis === 'derived') {
    if (event.finalStudentDateScope === 'regular-year') {
      if (hasEventType(event, 'HALF_DAY')) return 'Final regular-year / half day'
      return hasEventType(event, 'EARLY_RELEASE') ? 'Final regular-year / early dismissal' : 'Final regular-year student date'
    }
    return hasEventType(event, 'EARLY_RELEASE') ? 'Final shown / early dismissal' : 'Final student date shown'
  }
  if (hasEventType(event, 'LAST_DAY')) {
    return hasEventType(event, 'EARLY_RELEASE') ? 'Last day / early dismissal' : 'School closes'
  }
  if (hasEventType(event, 'HALF_DAY')) return 'Half day'
  if (isNoSchoolBreak(event)) return 'No school'
  return statusLabels[event.schoolStatus]
}

function candidateDateLabel(event: CalendarEvent): string | null {
  if (event.isDateConfirmed !== false || !event.candidateDates?.length) return null
  return event.candidateDates
    .map(candidate => formatDateRange(candidate.date, null))
    .join(' or ') + ' (unconfirmed)'
}

function singleDateWeekday(event: CalendarEvent): string {
  if (!event.dateStart || (event.dateEnd && event.dateEnd !== event.dateStart)) return ''
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' })
    .format(new Date(event.dateStart + 'T12:00:00Z'))
}

interface CalendarEventGroup {
  key: string
  events: [CalendarDisplayEvent, ...CalendarDisplayEvent[]]
}

const groupedEvents = computed<CalendarEventGroup[]>(() => {
  const groups: CalendarEventGroup[] = []
  const byDateRange = new Map<string, CalendarEventGroup>()
  const displayedIds = new Set(props.events.map(event => event.id))

  for (const event of groupCalendarEvents(props.events, props.eventDisplayGroups)) {
    if (event.coveredByBreakEventId && displayedIds.has(event.coveredByBreakEventId)) continue
    const key = event.dateStart === null
      ? event.id
      : `${event.dateStart}|${event.dateEnd || event.dateStart}`
    const existing = byDateRange.get(key)
    if (existing) {
      existing.events.push(event)
      continue
    }

    const group: CalendarEventGroup = { key, events: [event] }
    byDateRange.set(key, group)
    groups.push(group)
  }

  return groups
})

function groupStatuses(events: CalendarEvent[]) {
  const seen = new Set<string>()
  return events.flatMap((event) => {
    const label = statusLabel(event)
    if (seen.has(label)) return []
    seen.add(label)
    return [{ event, label }]
  })
}

function eventName(event: CalendarEvent): string {
  const name = event.displayName || event.name
  const scope = event.gradeScope || event.participantScope
  return props.concise && scope && !name.toLowerCase().includes(scope.toLowerCase())
    ? `${name} (${scope})` : name
}
</script>

<template>
  <div
    :id="sectionId"
    class="calendar-events-section"
    :class="{ 'calendar-events-section--two-columns': !showStatus }"
    :aria-labelledby="sectionId + '-heading'"
  >
    <div class="section-heading">
      <div>
        <p v-if="eyebrow" class="eyebrow">{{ eyebrow === 'Official calendar' && events.some(isCalculatedScheduleEntry) ? 'Calendar dates' : eyebrow }}</p>
        <h2 :id="sectionId + '-heading'">{{ heading }}</h2>
      </div>
    </div>

    <div class="calendar-events-table-wrap">
      <table class="calendar-events-table">
        <caption class="sr-only">
          {{ caption || 'Key dates for ' + districtName + ' ' + schoolYear + ' school calendar' }}
        </caption>
        <colgroup>
          <col class="calendar-events-col calendar-events-col--event">
          <col class="calendar-events-col calendar-events-col--date">
          <col v-if="showStatus" class="calendar-events-col calendar-events-col--status">
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Event</th>
            <th scope="col">Date(s)</th>
            <th v-if="showStatus" scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="group in groupedEvents"
            :key="group.key"
            :class="group.events.some(isShortenedDay) && 'calendar-event-row--early-release'"
          >
            <th scope="row">
              <span
                v-for="event in group.events"
                :key="event.id"
                class="calendar-event-name"
              >
                {{ eventName(event) }}
                <template v-if="!concise">
                  <span v-if="showDetails && (event.gradeScope || event.participantScope)" class="calendar-event-evidence">{{ event.gradeScope || event.participantScope }}</span>
                  <span v-if="showDetails && event.note" class="calendar-event-evidence">{{ event.note }}</span>
                  <span v-for="label in secondaryGraduationLabels(event)" :key="label" class="calendar-event-evidence">{{ label }} (school-specific ceremony)</span>
                  <span v-if="!showDetails && (event.isDisplayGroup || (hasEventType(event, 'LAST_DAY') && hasEventType(event, 'SCHOOL_MILESTONE')))" class="calendar-event-evidence">{{ event.note }}</span>
                  <span v-if="event.schoolStatus === 'program-not-scheduled'" class="calendar-event-evidence">{{ event.scheduleScope }}</span>
                  <span
                    v-if="isCalculatedScheduleEntry(event)"
                    class="calendar-event-evidence"
                    title="These dates are grouped or inferred from the published calendar."
                  >Calculated from calendar</span>
                </template>
              </span>
            </th>
            <td class="text-data calendar-event-date">
              <span v-if="candidateDateLabel(group.events[0])">
                {{ candidateDateLabel(group.events[0]) }}
              </span>
              <time v-else :datetime="group.events[0].dateStart || undefined">
                {{ formatDateRange(group.events[0].dateStart, null) }}
                <template v-if="singleDateWeekday(group.events[0])"> ({{ singleDateWeekday(group.events[0]) }})</template>
              </time>
              <template v-if="!candidateDateLabel(group.events[0]) && group.events[0].dateEnd && group.events[0].dateEnd !== group.events[0].dateStart">
                <span class="calendar-event-date-separator" aria-hidden="true">–</span>
                <span class="sr-only"> through </span>
                <time class="calendar-event-date-end" :datetime="group.events[0].dateEnd">
                  {{ formatDateRange(group.events[0].dateEnd, null) }}
                </time>
              </template>
            </td>
            <td v-if="showStatus">
              <div class="calendar-event-statuses">
                <span
                  v-for="status in groupStatuses(group.events)"
                  :key="status.label"
                  :class="[
                    'badge',
                    !isConditionalAttendance(status.event) && (status.event.schoolStatus === 'schools-closed' || status.event.schoolStatus === 'no-classes' || isNoSchoolBreak(status.event)) && 'badge--closed',
                    isConditionalAttendance(status.event) && 'badge--conditional',
                    (status.event.eventType === 'FIRST_DAY' || status.event.eventType === 'LAST_DAY') && 'badge--official',
                    isShortenedDay(status.event) && 'badge--early-release',
                  ]"
                >
                  {{ status.label }}
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
