<script setup lang="ts">
import { isCalculatedScheduleEntry } from '~~/shared/utils/eventEvidence.mjs'
import type { CalendarEvent } from '~~/shared/types/content'
import { conditionalAttendanceDescription, isConditionalAttendance } from '~~/shared/utils/calendarAttendance.mjs'
import {
  calendarTimeZoneLabel,
  dateInCalendarTimeZone,
  defaultCalendarTimeZone,
} from '~~/shared/utils/calendarDate'

type DayTone = 'boundary' | 'break' | 'holiday' | 'conditional' | 'important' | null

interface CalendarDayCell {
  date: string
  day: number
  weekend: boolean
  schoolDay: boolean
  tone: DayTone
  events: CalendarEvent[]
}

interface CalendarMonth {
  key: string
  label: string
  weeks: Array<Array<CalendarDayCell | null>>
  events: CalendarEvent[]
}

const props = defineProps<{
  districtName: string
  events: CalendarEvent[]
  firstDay: string | null
  lastDay: string | null
  heading?: string
  timeZone?: string
}>()

const timeZone = computed(() => props.timeZone || defaultCalendarTimeZone)
const timeZoneLabel = computed(() => calendarTimeZoneLabel(timeZone.value))

const centralToday = ref<string | null>(null)
let dateRefreshTimer: ReturnType<typeof setInterval> | undefined

function refreshCentralToday() {
  centralToday.value = dateInCalendarTimeZone(new Date(), timeZone.value)
}

function refreshWhenVisible() {
  if (document.visibilityState === 'visible') refreshCentralToday()
}

onMounted(() => {
  refreshCentralToday()
  dateRefreshTimer = setInterval(refreshCentralToday, 60_000)
  window.addEventListener('focus', refreshCentralToday)
  window.addEventListener('pageshow', refreshCentralToday)
  document.addEventListener('visibilitychange', refreshWhenVisible)
})

onBeforeUnmount(() => {
  if (dateRefreshTimer) clearInterval(dateRefreshTimer)
  window.removeEventListener('focus', refreshCentralToday)
  window.removeEventListener('pageshow', refreshCentralToday)
  document.removeEventListener('visibilitychange', refreshWhenVisible)
})

const todayInCalendar = computed(() => {
  if (!centralToday.value || !props.firstDay || !props.lastDay) return null
  return centralToday.value >= props.firstDay && centralToday.value <= props.lastDay
    ? centralToday.value
    : null
})

const currentMonthKey = computed(() => todayInCalendar.value?.slice(0, 7) || null)

const calendarEvents = computed(() => props.events.filter((event): event is CalendarEvent & { dateStart: string } =>
  event.dateStart !== null
  && event.isDateConfirmed !== false
  && !(['PARENT_CONFERENCE', 'TEACHER_CONFERENCE'].includes(event.eventType) && event.schoolStatus === 'schools-open'),
))

const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const monthFormatter = computed(() => new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: timeZone.value,
}))
const monthEventDateFormatter = computed(() => new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: timeZone.value,
}))
const fullDateFormatter = computed(() => new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: timeZone.value,
}))

function parseDate(value: string): Date {
  return new Date(value + 'T12:00:00Z')
}

function dateParts(value: string): { year: number; month: number; day: number } {
  const [year = '0', month = '0', day = '0'] = value.split('-')
  return { year: Number(year), month: Number(month), day: Number(day) }
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

function addCalendarDay(value: string): string {
  let { year, month, day } = dateParts(value)
  day += 1
  if (day > daysInMonth(year, month)) {
    day = 1
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function sundayBasedWeekday(year: number, month: number, day: number): number {
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]
  const adjustedYear = month < 3 ? year - 1 : year
  return (
    adjustedYear
    + Math.floor(adjustedYear / 4)
    - Math.floor(adjustedYear / 100)
    + Math.floor(adjustedYear / 400)
    + (offsets[month - 1] ?? 0)
    + day
  ) % 7
}

function formatMonthEventDate(event: CalendarEvent): string {
  if (!event.dateStart) return 'Date unresolved'
  const start = parseDate(event.dateStart)
  if (!event.dateEnd || event.dateEnd === event.dateStart) {
    return monthEventDateFormatter.value.format(start)
  }
  const end = parseDate(event.dateEnd)
  if (event.dateStart.slice(0, 7) === event.dateEnd.slice(0, 7)) {
    return monthEventDateFormatter.value.format(start) + '–' + dateParts(event.dateEnd).day
  }
  return monthEventDateFormatter.value.format(start) + ' – ' + monthEventDateFormatter.value.format(end)
}

function displayEventName(event: CalendarEvent): string {
  return event.displayName || event.name
}

function formatEventTooltip(event: CalendarEvent): string {
  const dateRange = formatMonthEventDate(event)
  return displayEventName(event) + ' — ' + dateRange
    + (isConditionalAttendance(event) ? '. ' + conditionalAttendanceDescription(event) : '')
    + (event.schoolStatus === 'program-not-scheduled' && event.scheduleScope ? '. ' + event.scheduleScope : '')
    + (isCalculatedScheduleEntry(event) ? ' (calculated from calendar)' : '')
    + (event.note ? '. ' + event.note : '')
}

function formatCellTooltip(events: CalendarEvent[]): string {
  return events.map(formatEventTooltip).join(' • ')
}

function formatCellAriaLabel(cell: CalendarDayCell): string {
  return fullDateFormatter.value.format(parseDate(cell.date))
    + (cell.date === todayInCalendar.value ? ', today' : '')
}

function eventTone(events: CalendarEvent[]): DayTone {
  if (events.some(isConditionalAttendance)) return 'conditional'
  if (events.some(event =>
    event.eventType === 'FIRST_DAY'
    || event.eventType === 'LAST_DAY'
    || event.eventType === 'CALENDAR_START'
    || event.eventType === 'CALENDAR_END'
    || event.isFinalStudentDate === true,
  )) {
    return 'boundary'
  }
  if (events.some(event => event.eventType.endsWith('_BREAK'))) {
    return 'break'
  }
  if (events.some(event =>
    event.eventType === 'HOLIDAY'
    || event.schoolStatus === 'schools-closed'
    || event.schoolStatus === 'no-classes'
    || event.schoolStatus === 'no-regular-classes'
    || event.schoolStatus === 'no-students'
    || event.schoolStatus === 'staff-only',
  )) {
    return 'holiday'
  }
  return events.length ? 'important' : null
}

function isMonthListEvent(event: CalendarEvent): boolean {
  if (event.coveredByBreakEventId) return false
  return event.isFinalStudentDate === true
    || isConditionalAttendance(event)
    || event.schoolStatus === 'program-not-scheduled'
    || event.schoolStatus === 'conditional-attendance'
    || event.eventType === 'FIRST_DAY'
    || event.eventType === 'LAST_DAY'
    || event.eventType === 'CALENDAR_START'
    || event.eventType === 'CALENDAR_END'
    || event.eventType === 'REGENTS'
    || event.eventType === 'EXAM'
    || event.eventType === 'FINAL_EXAM'
    || event.eventType === 'HOLIDAY'
    || event.eventType.endsWith('_BREAK')
    || event.schoolStatus === 'schools-closed'
    || event.schoolStatus === 'no-classes'
    || event.schoolStatus === 'no-regular-classes'
    || event.schoolStatus === 'no-students'
    || event.schoolStatus === 'staff-only'
}

const eventsByDate = computed(() => {
  const map = new Map<string, CalendarEvent[]>()
  for (const event of calendarEvents.value) {
    let cursor = event.dateStart
    const end = event.dateEnd || event.dateStart
    let guard = 0
    while (cursor <= end && guard < 370) {
      map.set(cursor, [...(map.get(cursor) || []), event])
      cursor = addCalendarDay(cursor)
      guard += 1
    }
  }
  return map
})

const months = computed<CalendarMonth[]>(() => {
  if (!props.firstDay || !props.lastDay) return []

  const first = dateParts(props.firstDay)
  const last = dateParts(props.lastDay)
  const firstMonthIndex = first.year * 12 + first.month - 1
  const lastMonthIndex = last.year * 12 + last.month - 1
  const result: CalendarMonth[] = []

  for (let monthIndex = firstMonthIndex; monthIndex <= lastMonthIndex; monthIndex += 1) {
    const year = Math.floor(monthIndex / 12)
    const month = monthIndex % 12 + 1
    const monthStartIso = `${year}-${String(month).padStart(2, '0')}-01`
    const monthDayCount = daysInMonth(year, month)
    const monthEndIso = `${year}-${String(month).padStart(2, '0')}-${monthDayCount}`
    const mondayOffset = (sundayBasedWeekday(year, month, 1) + 6) % 7
    const cells: Array<CalendarDayCell | null> = Array.from({ length: mondayOffset }, () => null)

    for (let day = 1; day <= monthDayCount; day += 1) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const dayEvents = eventsByDate.value.get(date) || []
      const weekday = sundayBasedWeekday(year, month, day)
      const weekend = weekday === 0 || weekday === 6
      const tone = eventTone(dayEvents)
      cells.push({
        date,
        day,
        weekend,
        schoolDay: !weekend
          && !dayEvents.some(isConditionalAttendance)
          && !dayEvents.some(event => ['conditional-attendance', 'program-not-scheduled', 'unknown'].includes(event.schoolStatus))
          && date >= props.firstDay
          && date <= props.lastDay
          && tone !== 'break'
          && tone !== 'holiday',
        tone,
        events: dayEvents,
      })
    }

    while (cells.length < 42) cells.push(null)
    const weeks = Array.from(
      { length: cells.length / 7 },
      (_, index) => cells.slice(index * 7, index * 7 + 7),
    )
    result.push({
      key: `${year}-${String(month).padStart(2, '0')}`,
      label: monthFormatter.value.format(parseDate(monthStartIso)),
      weeks,
      events: calendarEvents.value
        .filter(event =>
          isMonthListEvent(event)
          && event.dateStart >= monthStartIso
          && event.dateStart <= monthEndIso,
        )
        .sort((a, b) =>
          a.dateStart.localeCompare(b.dateStart)
          || (a.dateEnd || a.dateStart).localeCompare(b.dateEnd || b.dateStart)
          || displayEventName(a).localeCompare(displayEventName(b)),
        ),
    })
  }

  return result
})
</script>

<template>
  <div v-if="months.length" id="monthly-calendar" aria-labelledby="monthly-calendar-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Month by month</p>
        <h2 id="monthly-calendar-heading">{{ heading || 'Monthly calendar' }}</h2>
      </div>
      <p>
        Highlighted dates follow the published calendar; grouped or inferred entries are labelled.
        Today is determined in {{ timeZoneLabel }} ({{ timeZone }}).
      </p>
    </div>

    <ul class="calendar-legend" aria-label="Calendar legend">
      <li><span class="legend-swatch legend-swatch--school-day" />School Day</li>
      <li><span class="legend-swatch legend-swatch--weekend" />Weekend</li>
      <li><span class="legend-swatch legend-swatch--holiday" />Holiday (No School)</li>
      <li><span class="legend-swatch legend-swatch--break" />School Break</li>
      <li><span class="legend-swatch legend-swatch--boundary" />First / Last Day</li>
      <li><span class="legend-swatch legend-swatch--important" />Important Date</li>
      <li v-if="calendarEvents.some(isConditionalAttendance)"><span class="legend-swatch legend-swatch--conditional" />Conditional attendance</li>
      <li v-if="todayInCalendar" class="calendar-today-legend">
        <span class="legend-swatch legend-swatch--today" />
        Today
        <a class="current-month-jump" href="#current-calendar-month">Jump to current month</a>
      </li>
    </ul>

    <div class="monthly-calendar-grid">
      <article
        v-for="month in months"
        :key="month.key"
        :id="month.key === currentMonthKey ? 'current-calendar-month' : undefined"
        class="month-calendar"
        :class="{
          'month-calendar--without-events': !month.events.length,
          'month-calendar--current': month.key === currentMonthKey,
        }"
      >
        <div class="month-calendar-heading">
          <h3>{{ month.label }}</h3>
          <span v-if="month.key === currentMonthKey" class="current-month-badge">Current month</span>
        </div>
        <table class="month-calendar-table">
          <caption class="sr-only">{{ districtName }} calendar for {{ month.label }}</caption>
          <thead>
            <tr>
              <th v-for="label in weekdayLabels" :key="label" scope="col">{{ label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(week, weekIndex) in month.weeks" :key="weekIndex">
              <td
                v-for="(cell, dayIndex) in week"
                :key="dayIndex"
                :class="[
                  cell?.schoolDay && 'month-day--school-day',
                  cell?.weekend && 'month-day--weekend',
                  cell?.tone === 'conditional' && 'month-day--important',
                  cell?.tone && 'month-day--' + cell.tone,
                  cell?.date === todayInCalendar && 'month-day--today',
                ]"
              >
                <time
                  v-if="cell"
                  :class="{ 'month-day-has-events': cell.events.length > 0 }"
                  :datetime="cell.date"
                  :tabindex="cell.events.length ? 0 : undefined"
                  :aria-label="formatCellAriaLabel(cell)"
                  :aria-current="cell.date === todayInCalendar ? 'date' : undefined"
                  :aria-describedby="cell.events.length ? 'month-day-tooltip-' + cell.date : undefined"
                >
                  <span class="month-day-number">{{ cell.day }}</span>
                  <span v-if="cell.events.length" class="month-day-marker" aria-hidden="true" />
                  <span
                    v-if="cell.events.length"
                    :id="'month-day-tooltip-' + cell.date"
                    class="month-day-tooltip"
                    role="tooltip"
                  >
                    {{ formatCellTooltip(cell.events) }}
                  </span>
                </time>
              </td>
            </tr>
          </tbody>
        </table>
        <ul
          v-if="month.events.length"
          class="month-event-list"
          :aria-label="month.label + ' holidays, breaks, and exam periods'"
        >
          <li
            v-for="event in month.events"
            :key="event.id"
            :class="'month-event--' + (eventTone([event]) || 'important')"
          >
            <span class="month-event-marker" aria-hidden="true" />
            <span>
              <time :datetime="event.dateStart || undefined">{{ formatMonthEventDate(event) }}</time>
              <span aria-hidden="true"> — </span>
              {{ displayEventName(event) }}
              <span v-if="isConditionalAttendance(event)" class="month-event-context">{{ conditionalAttendanceDescription(event) }}{{ /[.!?]$/.test(conditionalAttendanceDescription(event)) ? '' : '.' }}</span>
              <span v-if="isCalculatedScheduleEntry(event)" class="month-event-context">Calculated from calendar</span>
              <span
                v-if="event.eventType === 'REGENTS' && event.schoolStatus === 'exam-day'"
                class="month-event-context"
              >Exam period; not a districtwide closure.</span>
            </span>
          </li>
        </ul>
      </article>
    </div>
  </div>
</template>
