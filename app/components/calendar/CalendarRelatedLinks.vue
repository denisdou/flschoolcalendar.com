<script setup lang="ts">
import type { DistrictCalendar, DistrictCatalogEntry, DistrictIdentity } from '~~/shared/types/content'
import { formatCalendarLabel } from '~~/shared/utils/content'
const props = defineProps<{ district: DistrictIdentity; calendar: DistrictCalendar; districts: DistrictCatalogEntry[]; officialWebsite?: string | null }>()
const links = computed(() => {
  const seen = new Set<string>([props.district.slug])
  return props.districts.flatMap((district) => {
    if (seen.has(district.slug)) return []
    seen.add(district.slug)
    const calendar = district.calendarPages.find(item => item.indexable && item.schoolYear === props.calendar.schoolYear)
    return calendar ? [{ name: district.shortName + ' Calendar ' + formatCalendarLabel({ schoolYear: calendar.schoolYear, calendarLabel: calendar.calendarLabel || undefined }), href: calendar.href }] : []
  }).slice(0, 3)
})
</script>

<template>
  <div v-if="officialWebsite || links.length" id="related-calendars" aria-labelledby="related-calendars-heading">
    <div class="section-heading"><h2 id="related-calendars-heading">Related Calendars</h2></div>
    <div class="detail-related-grid">
      <a v-if="officialWebsite" class="detail-related-link" :href="officialWebsite" target="_blank" rel="noopener noreferrer">{{ district.shortName }} Official Website <span aria-hidden="true">↗</span></a>
      <NuxtLink v-for="link in links" :key="link.href" class="detail-related-link" :to="link.href">{{ link.name }} <span aria-hidden="true">→</span></NuxtLink>
    </div>
  </div>
</template>
