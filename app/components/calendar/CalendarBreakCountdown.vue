<script setup lang="ts">
import type { CalendarEvent } from '~~/shared/types/content'
import {
  calendarDayDifference,
  calendarTimeZoneLabel,
  dateInCalendarTimeZone,
  defaultCalendarTimeZone,
} from '~~/shared/utils/calendarDate'
import { formatDateRange } from '~~/shared/utils/content'
import { isConditionalAttendance } from '~~/shared/utils/calendarAttendance.mjs'

const props = defineProps<{
  events: CalendarEvent[]
  timeZone?: string
}>()

const timeZone = computed(() => props.timeZone || defaultCalendarTimeZone)
const timeZoneLabel = computed(() => calendarTimeZoneLabel(timeZone.value))

const today = ref<string | null>(null)
let dateRefreshTimer: ReturnType<typeof setInterval> | undefined

function refreshToday() {
  today.value = dateInCalendarTimeZone(new Date(), timeZone.value)
}

function refreshWhenVisible() {
  if (document.visibilityState === 'visible') refreshToday()
}

onMounted(() => {
  refreshToday()
  dateRefreshTimer = setInterval(refreshToday, 60_000)
  window.addEventListener('focus', refreshToday)
  window.addEventListener('pageshow', refreshToday)
  document.addEventListener('visibilitychange', refreshWhenVisible)
})

onBeforeUnmount(() => {
  if (dateRefreshTimer) clearInterval(dateRefreshTimer)
  window.removeEventListener('focus', refreshToday)
  window.removeEventListener('pageshow', refreshToday)
  document.removeEventListener('visibilitychange', refreshWhenVisible)
})

function isDistrictwideNoSchoolDate(event: CalendarEvent): boolean {
  if (isConditionalAttendance(event) || event.coveredByBreakEventId) return false
  return event.schoolStatus === 'schools-closed'
    || event.schoolStatus === 'no-classes'
    || event.schoolStatus === 'no-students'
}

type DatedCalendarEvent = CalendarEvent & { dateStart: string }

function eventEnd(event: DatedCalendarEvent): string {
  return event.dateEnd || event.dateStart
}

const currentOrNextEvent = computed(() => {
  if (!today.value) return null
  return props.events
    .filter((event): event is DatedCalendarEvent =>
      event.dateStart !== null
      && event.isDateConfirmed !== false
      && isDistrictwideNoSchoolDate(event)
      && (event.dateEnd || event.dateStart) >= today.value!,
    )
    .sort((a, b) => a.dateStart.localeCompare(b.dateStart))[0] || null
})

const isBreak = computed(() => Boolean(
  currentOrNextEvent.value?.eventType.endsWith('_BREAK'),
))

const isCurrentEvent = computed(() => Boolean(
  today.value
  && currentOrNextEvent.value
  && currentOrNextEvent.value.dateStart <= today.value
  && eventEnd(currentOrNextEvent.value) >= today.value,
))

const countdownLabel = computed(() => {
  if (!today.value || !currentOrNextEvent.value) return null

  if (isCurrentEvent.value) {
    if (!isBreak.value) return 'No school today'
    const daysUntilEnd = calendarDayDifference(today.value, eventEnd(currentOrNextEvent.value))
    if (daysUntilEnd === 0) return 'Happening now · ends today'
    if (daysUntilEnd === 1) return 'Happening now · ends tomorrow'
    return `Happening now · ends in ${daysUntilEnd} calendar days`
  }

  const daysUntilStart = calendarDayDifference(today.value, currentOrNextEvent.value.dateStart)
  if (daysUntilStart === 1) return isBreak.value ? 'Starts tomorrow' : 'Tomorrow'
  return isBreak.value
    ? `Starts in ${daysUntilStart} calendar days`
    : `In ${daysUntilStart} calendar days`
})
</script>

<template>
  <aside
    class="calendar-break-countdown"
    aria-live="polite"
    aria-label="Next listed no-school day or break"
    data-nosnippet
  >
    <div>
      <p class="calendar-break-countdown-label">
        {{ isCurrentEvent ? (isBreak ? 'Current school break' : 'Today · no school') : 'Next no-school day or break' }}
      </p>
      <template v-if="currentOrNextEvent">
        <strong>{{ currentOrNextEvent.displayName || currentOrNextEvent.name }}</strong>
        <time :datetime="currentOrNextEvent.dateStart">
          {{ formatDateRange(currentOrNextEvent.dateStart, currentOrNextEvent.dateEnd) }}
        </time>
      </template>
      <span v-else-if="today">No more no-school days or breaks are listed for this school year.</span>
      <span v-else>Checking the current school calendar…</span>
    </div>

    <strong
      class="calendar-break-countdown-value"
      :class="!countdownLabel && 'calendar-break-countdown-value--placeholder'"
      :aria-hidden="!countdownLabel ? 'true' : undefined"
    >
      {{ countdownLabel || '\u00A0' }}
    </strong>

    <small>Calculated using {{ timeZoneLabel }} ({{ timeZone }}).</small>
  </aside>
</template>
