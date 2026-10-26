<script setup lang="ts">
import type {
  DistrictCalendar,
  DistrictIdentity,
  CalendarEvent,
  DistrictCatalogEntry,
  LinkItem,
} from '~~/shared/types/content'
import { formatCalendarLabel } from '~~/shared/utils/content'
import { hasEventType } from '~~/shared/utils/eventTypes.mjs'

const props = defineProps<{
  district: DistrictIdentity
  calendar: DistrictCalendar
  calendars: DistrictCalendar[]
  relatedResources: LinkItem[]
  officialWebsite?: string | null
  otherDistricts: DistrictCatalogEntry[]
  nearbyDistricts: DistrictCatalogEntry[]
}>()

const keyEvents = computed<CalendarEvent[]>(() => {
  const officialLastDayDates = new Set(
    props.calendar.events
      .filter(event => event.dateStart !== null && hasEventType(event, 'LAST_DAY'))
      .map(event => event.dateStart),
  )

  return props.calendar.events.filter(event =>
    event.dateStart !== null
    && event.isDateConfirmed !== false
    && (
      hasEventType(event, 'FIRST_DAY')
      || hasEventType(event, 'LAST_DAY')
      || hasEventType(event, 'CALENDAR_START')
      || hasEventType(event, 'CALENDAR_END')
      || (hasEventType(event, 'EARLY_RELEASE') && !officialLastDayDates.has(event.dateStart))
      || hasEventType(event, 'HALF_DAY')
      || event.schoolStatus === 'schools-closed'
      || event.schoolStatus === 'no-classes'
      || event.schoolStatus === 'no-regular-classes'
      || event.schoolStatus === 'conditional-attendance'
      || event.schoolStatus === 'program-not-scheduled'
    ),
  )
})
</script>

<template>
  <section class="page-intro-section calendar-detail-page">
    <div class="site-container">
      <AppBreadcrumbs :items="[
        { label: 'Home', href: '/' },
        { label: district.shortName, href: '/#districts' },
        { label: formatCalendarLabel(calendar) },
      ]" />
      <CalendarPageHero :district="district" :calendar="calendar" :calendars="calendars" />
    </div>
  </section>

  <section class="page-section calendar-section">
    <div class="site-container">
      <CalendarEventsTable :events="keyEvents" :event-display-groups="calendar.eventDisplayGroups"
        :district-name="district.name" :school-year="calendar.schoolYear" heading="Key Dates" eyebrow="" />
      <CalendarCorrection :district="district" :calendar="calendar" />
    </div>
  </section>

  <section class="page-section calendar-section">
    <div class="site-container">
      <CalendarExtendedTimeOff :calendar="calendar" :district-name="district.name" />
    </div>
  </section>

  <section class="page-section calendar-section calendar-section--surface">
    <div class="site-container">
      <LazyMonthlyCalendar hydrate-on-visible :district-name="district.name" :events="calendar.events"
        :event-display-groups="calendar.eventDisplayGroups" :first-day="calendar.firstDay"
        :last-day="calendar.lastDay" :time-zone="district.timeZone" heading="Monthly Calendar" />
    </div>
  </section>

  <section class="page-section calendar-section">
    <div class="site-container">
      <CalendarEditorialSummary :summary="calendar.editorialSummary" :heading="district.shortName + ' Calendar Notes'" collapsible />
    </div>
  </section>

  <section class="page-section calendar-section calendar-section--surface">
    <div class="site-container">
      <CalendarRelatedLinks :district="district" :calendar="calendar" :districts="[...nearbyDistricts, ...otherDistricts]" :official-website="officialWebsite" />
    </div>
  </section>

  <section class="page-section calendar-section">
    <div class="site-container">
      <CalendarDetailAbout :district="district" :calendar="calendar" :official-website="officialWebsite" />
    </div>
  </section>
</template>
