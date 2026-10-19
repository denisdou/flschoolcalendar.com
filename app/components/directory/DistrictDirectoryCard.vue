<script setup lang="ts">
import type { DistrictCatalogEntry } from '~~/shared/types/content'
import { districtCalendarHref, formatDistrictSearchName } from '~~/shared/utils/content'

defineProps<{
  district: DistrictCatalogEntry
}>()
</script>

<template>
  <NuxtLink
    class="directory-card"
    :to="districtCalendarHref(district)"
  >
    <div>
      <h3>{{ formatDistrictSearchName(district) }}</h3>
      <p>{{ district.summary }}</p>
    </div>
    <div class="directory-meta">
      <span>{{ district.county }}</span>
      <span>{{ district.region }}</span>
      <span>{{ district.calendarPages.filter(page => page.indexable).length }} school calendars</span>
    </div>
  </NuxtLink>
</template>
