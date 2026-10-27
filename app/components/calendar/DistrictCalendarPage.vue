<script setup lang="ts">
import type {
  DistrictCalendar,
  DistrictIdentity,
  DistrictCatalogEntry,
  LinkItem,
} from '~~/shared/types/content'
import { formatCalendarLabel } from '~~/shared/utils/content'
import { splitCalendarDetailEvents } from '~~/shared/utils/calendarDetailSections'
import { selectCalendarFaqs } from '~~/shared/utils/calendarFaqSelection'

const props = defineProps<{
  district: DistrictIdentity
  calendar: DistrictCalendar
  calendars: DistrictCalendar[]
  relatedResources: LinkItem[]
  officialWebsite?: string | null
  otherDistricts: DistrictCatalogEntry[]
  nearbyDistricts: DistrictCatalogEntry[]
}>()

const eventSections = computed(() => splitCalendarDetailEvents(props.calendar.events))
const featuredFaqs = computed(() => selectCalendarFaqs(props.calendar.faqs))
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
      <CalendarEventsTable :events="eventSections.keyDates" :event-display-groups="calendar.eventDisplayGroups"
        :district-name="district.name" :school-year="calendar.schoolYear" heading="Key Dates" eyebrow="" />
      <CalendarCorrection :district="district" :calendar="calendar" />
    </div>
  </section>

  <section v-if="eventSections.earlyRelease.length" class="page-section calendar-section">
    <div class="site-container">
      <CalendarEventsTable :events="eventSections.earlyRelease" :district-name="district.name"
        :school-year="calendar.schoolYear" section-id="early-release-dates" heading="Early Release" eyebrow=""
        :caption="'Early-release dates for ' + district.name + ' ' + calendar.schoolYear" show-details />
    </div>
  </section>

  <section class="page-section calendar-section">
    <div class="site-container">
      <CalendarExtendedTimeOff :calendar="calendar" :district-name="district.name" />
    </div>
  </section>

  <section v-if="eventSections.otherImportant.length" class="page-section calendar-section">
    <div class="site-container">
      <CalendarEventsTable :events="eventSections.otherImportant" :district-name="district.name"
        :school-year="calendar.schoolYear" section-id="other-important-dates" heading="Other Important Dates" eyebrow=""
        :caption="'Other important dates for ' + district.name + ' ' + calendar.schoolYear" :show-status="false" show-details />
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
      <CalendarEditorialSummary :summary="calendar.editorialSummary" :heading="'About ' + district.name" collapsible />
    </div>
  </section>

  <section v-if="featuredFaqs.length" class="page-section calendar-section calendar-section--surface">
    <div class="site-container">
      <CalendarFaq :items="featuredFaqs" heading="FAQs" />
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
