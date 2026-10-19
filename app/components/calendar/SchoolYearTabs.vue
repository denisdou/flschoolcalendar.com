<script setup lang="ts">
import type { DistrictCalendar, DistrictIdentity } from '~~/shared/types/content'
import { calendarRouteSlug, formatCalendarLabel } from '~~/shared/utils/content'

const props = defineProps<{
  district: DistrictIdentity
  calendars: DistrictCalendar[]
  currentCalendarRoute: string
}>()

const publishedCalendars = computed(() =>
  props.calendars
    .filter(calendar => calendar.indexable)
    .sort((a, b) => a.schoolYear.localeCompare(b.schoolYear)),
)
</script>

<template>
  <nav class="school-year-nav" aria-label="Published school calendars">
    <span class="school-year-nav-label">School calendar</span>
    <ul class="school-year-tabs">
      <li v-for="item in publishedCalendars" :key="calendarRouteSlug(item)">
        <span
          v-if="calendarRouteSlug(item) === currentCalendarRoute"
          class="school-year-tab school-year-tab--current"
          aria-current="page"
        >
          {{ formatCalendarLabel(item) }}
        </span>
        <NuxtLink
          v-else
          class="school-year-tab"
          :to="'/' + district.slug + '/' + calendarRouteSlug(item) + '/'"
        >
          {{ formatCalendarLabel(item) }}
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
