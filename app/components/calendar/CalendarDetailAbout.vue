<script setup lang="ts">
import type { DistrictCalendar, DistrictIdentity } from '~~/shared/types/content'
defineProps<{ district: DistrictIdentity; calendar: DistrictCalendar; officialWebsite?: string | null }>()
</script>

<template>
  <div id="about-calendar" aria-labelledby="about-calendar-heading" class="calendar-detail-about">
    <div class="section-heading"><h2 id="about-calendar-heading">About This Calendar</h2></div>
    <p><strong>Data source &amp; handling:</strong> {{ calendar.about.dataSource }} Dates are collected from district materials and organized into key dates, monthly calendars and calendar subscriptions.
      <a v-if="officialWebsite" class="text-link" :href="officialWebsite" target="_blank" rel="noopener noreferrer">Visit {{ district.shortName }}’s official website</a>.
    </p>
    <p><strong>Disclaimer:</strong> {{ calendar.about.disclaimer }}</p>
    <p v-if="calendar.contentUpdatedAt || calendar.verifiedAt" class="calendar-detail-updated">Last updated: <time :datetime="calendar.contentUpdatedAt || calendar.verifiedAt || undefined">{{ calendar.contentUpdatedAt || calendar.verifiedAt }}</time></p>
  </div>
</template>
