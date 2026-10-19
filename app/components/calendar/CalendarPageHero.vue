<script setup lang="ts">
import type { DistrictCalendar, DistrictIdentity } from '~~/shared/types/content'
import { calendarRouteSlug, formatDateRange } from '~~/shared/utils/content'

const props = defineProps<{
  district: DistrictIdentity
  calendar: DistrictCalendar
  calendars: DistrictCalendar[]
}>()

const hasMultiplePublishedCalendars = computed(() =>
  props.calendars.filter(calendar => calendar.indexable).length > 1,
)

const officialSourceUrl = computed(() =>
  props.calendar.actions.officialCalendarUrl
  || props.calendar.actions.officialPdfUrl
  || props.calendar.sources[0]?.url
  || null,
)
</script>

<template>
  <header class="calendar-page-hero">
    <div class="calendar-hero-context">
      <StatusBadge :status="calendar.status" />
      <span>{{ district.county }} · {{ district.districtType }}</span>
    </div>

    <div class="calendar-hero-split">
      <div class="calendar-hero-copy">
        <h1>{{ calendar.hero.heading }}</h1>

        <p class="calendar-hero-description calendar-hero-description--mobile">
          {{ calendar.hero.mobileDescription }}
        </p>
        <p class="calendar-hero-description calendar-hero-description--desktop">
          {{ calendar.hero.desktopDescription }}
        </p>
        <p
          v-if="calendar.verifiedAt || officialSourceUrl"
          class="calendar-hero-verified"
        >
          <template v-if="calendar.verifiedAt">
            Official calendar checked
            <time :datetime="calendar.verifiedAt">
              {{ formatDateRange(calendar.verifiedAt, null) }}
            </time>
          </template>
          <span v-if="calendar.verifiedAt && officialSourceUrl" aria-hidden="true">·</span>
          <a
            v-if="officialSourceUrl"
            class="text-link"
            :href="officialSourceUrl"
            target="_blank"
            rel="noopener noreferrer"
          >Official district source</a>
        </p>

        <div v-if="hasMultiplePublishedCalendars" class="calendar-hero-year">
          <SchoolYearTabs
            :district="district"
            :calendars="calendars"
            :current-calendar-route="calendarRouteSlug(calendar)"
          />
        </div>
      </div>

      <CalendarQuickLook :dates="calendar.keyDates" :last-day-conditional="calendar.lastDayConditional" />
    </div>

    <div class="calendar-hero-action-row">
      <CalendarActions :district="district" :calendar="calendar" />
    </div>
  </header>
</template>
