<script setup lang="ts">
import type { DistrictCalendar, DistrictIdentity } from '~~/shared/types/content'
import { calendarRouteSlug, formatCalendarLabel } from '~~/shared/utils/content'

defineProps<{
  district: DistrictIdentity
  calendars: DistrictCalendar[]
  currentCalendarRoute?: string
}>()
</script>

<template>
  <div id="other-years" aria-labelledby="other-years-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Calendar archive</p>
        <h2 id="other-years-heading">Other school calendars</h2>
      </div>
    </div>
    <ul class="year-list">
      <li v-for="calendar in calendars" :key="calendarRouteSlug(calendar)" class="year-item">
        <strong>{{ formatCalendarLabel(calendar) }}</strong>
        <span v-if="calendarRouteSlug(calendar) === currentCalendarRoute" class="badge">Current page</span>
        <NuxtLink
          v-else-if="calendar.indexable"
          class="text-link"
          :to="'/' + district.slug + '/' + calendarRouteSlug(calendar) + '/'"
        >
          View calendar
        </NuxtLink>
        <span v-else class="text-dim">Awaiting publication review</span>
      </li>
      <li v-if="!calendars.length" class="year-item">
        <strong>Calendar archive</strong>
        <span class="text-dim">No verified school calendars published yet.</span>
      </li>
    </ul>
  </div>
</template>
