<script setup lang="ts">
import type {
  DistrictCalendar,
  DistrictIdentity,
  CalendarEvent,
  DistrictCatalogEntry,
  LinkItem,
} from '~~/shared/types/content'
import { formatCalendarLabel, formatDateRange } from '~~/shared/utils/content'
import { getSchoolHoursRows } from '~~/shared/utils/schoolHours'
import { hasEventType } from '~~/shared/utils/eventTypes.mjs'

const props = defineProps<{
  district: DistrictIdentity
  calendar: DistrictCalendar
  calendars: DistrictCalendar[]
  relatedResources: LinkItem[]
  otherDistricts: DistrictCatalogEntry[]
  nearbyDistricts: DistrictCatalogEntry[]
}>()

const hasBellTimes = computed(() => getSchoolHoursRows(props.calendar.schoolHours).length > 0)

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
      <AppBreadcrumbs
        :items="[
          { label: 'Home', href: '/' },
          { label: 'Districts', href: '/#districts' },
          { label: district.shortName + ' ' + formatCalendarLabel(calendar) },
        ]"
      />

      <CalendarPageHero
        :district="district"
        :calendar="calendar"
        :calendars="calendars"
      />
    </div>
  </section>

  <section class="page-section calendar-section calendar-section--surface calendar-section--nav">
    <div class="site-container">
      <CalendarSectionNav
        :has-faq="calendar.faqs.length > 0"
        :has-bell-times="hasBellTimes"
        :has-related-calendars="nearbyDistricts.length > 0 || otherDistricts.length > 0"
      />
    </div>
  </section>

  <section class="page-section calendar-section">
    <div class="site-container">
      <CalendarBreakCountdown :events="calendar.events" :time-zone="district.timeZone" />
      <CalendarEventsTable
        :events="keyEvents"
        :district-name="district.name"
        :school-year="calendar.schoolYear"
        section-id="key-dates-table"
        :heading="district.shortName + ' ' + formatCalendarLabel(calendar) + ' key dates'"
      />
    </div>
  </section>

  <section class="page-section calendar-section calendar-section--surface">
    <div class="site-container">
      <LazyMonthlyCalendar
        hydrate-on-visible
        :district-name="district.name"
        :events="calendar.events"
        :first-day="calendar.firstDay"
        :last-day="calendar.lastDay"
        :time-zone="district.timeZone"
        :heading="district.shortName + ' ' + formatCalendarLabel(calendar) + ' monthly calendar'"
      />
    </div>
  </section>

  <section class="page-section calendar-section">
    <div class="site-container">
      <CalendarNotes :district="district" :calendar="calendar" />
    </div>
  </section>

  <section v-if="hasBellTimes" class="page-section calendar-section">
    <div class="site-container">
      <CalendarBellTimes
        :hours="calendar.schoolHours"
        :sources="calendar.sources"
        :heading="district.shortName + ' ' + formatCalendarLabel(calendar) + ' school hours & bell times'"
      />
    </div>
  </section>

  <section class="page-section calendar-section">
    <div class="site-container">
      <CalendarEditorialSummary :summary="calendar.editorialSummary" />
    </div>
  </section>

  <section v-if="calendar.faqs.length" class="page-section calendar-section">
    <div class="site-container">
      <CalendarFaq
        :items="calendar.faqs"
        :heading="district.shortName + ' ' + formatCalendarLabel(calendar) + ' calendar FAQs'"
      />
    </div>
  </section>

  <section
    v-if="nearbyDistricts.length || otherDistricts.length"
    class="page-section calendar-section calendar-section--surface"
  >
    <div class="site-container">
      <RelatedCalendarGroups
        :district="district"
        :calendar="calendar"
        :nearby-districts="nearbyDistricts"
        :other-districts="otherDistricts"
      />
    </div>
  </section>

  <section
    v-if="relatedResources.length"
    class="page-section calendar-section calendar-section--surface"
  >
    <div class="site-container">
      <RelatedResources
        section-id="calendar-resources"
        eyebrow="Reference"
        :title="district.shortName + ' ' + formatCalendarLabel(calendar) + ' resources'"
        :links="relatedResources"
      />
    </div>
  </section>

  <section class="page-section calendar-section">
    <div class="site-container">
      <CalendarAbout
        :about="calendar.about"
        :heading="'About the ' + district.shortName + ' ' + formatCalendarLabel(calendar) + ' calendar'"
      />
      <div class="calendar-about-support">
        <OfficialSources
          :district="district"
          :sources="calendar.sources"
          :published-at="calendar.publishedAt"
          :verified-at="calendar.verifiedAt"
          :revision-count="calendar.revisions.length"
          :heading="district.shortName + ' ' + formatCalendarLabel(calendar) + ' sources & verification'"
        />
      </div>
    </div>
  </section>

  <section
    v-if="calendar.createdAt || calendar.contentUpdatedAt || calendar.verifiedAt"
    class="calendar-timestamps-section"
  >
    <div class="site-container">
      <footer class="calendar-page-timestamps" aria-label="Page history">
        <span v-if="calendar.createdAt">
          Page created
          <time :datetime="calendar.createdAt">
            {{ formatDateRange(calendar.createdAt, null) }}
          </time>
        </span>
        <span v-if="calendar.verifiedAt">
          Official calendar checked
          <time :datetime="calendar.verifiedAt">
            {{ formatDateRange(calendar.verifiedAt, null) }}
          </time>
        </span>
        <span v-if="calendar.contentUpdatedAt">
          Page content updated
          <time :datetime="calendar.contentUpdatedAt">
            {{ formatDateRange(calendar.contentUpdatedAt, null) }}
          </time>
        </span>
      </footer>
    </div>
  </section>
</template>
