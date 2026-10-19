<script setup lang="ts">
import type { DistrictCatalogEntry } from '~~/shared/types/content'
import { districtCalendarHref, formatDistrictSearchName, formatSchoolYear, searchCurrentYearDistricts } from '~~/shared/utils/content'

const props = defineProps<{
  districts: DistrictCatalogEntry[]
  schoolYear: string
  label?: string
  hideLabel?: boolean
}>()

const query = ref('')
const results = computed(() => {
  return searchCurrentYearDistricts(props.districts, query.value, props.schoolYear)
})
</script>

<template>
  <div class="search-panel" @keydown.esc="query = ''">
    <label class="control-label">
      <span :class="{ 'sr-only': hideLabel }">{{ label || 'Search school districts' }}</span>
      <span class="search-input-wrap">
        <input
          v-model="query"
          class="search-input"
          type="search"
          name="district-search"
          autocomplete="off"
          placeholder="Search districts"
          aria-label="Search current-year district calendars"
        >
      </span>
    </label>

    <div
      v-if="query.trim().length >= 2"
      class="search-results"
      role="region"
      aria-live="polite"
      aria-label="District search results"
    >
      <NuxtLink
        v-for="district in results"
        :key="district.slug"
        class="search-result"
        :to="districtCalendarHref(district, schoolYear)"
      >
        <strong>{{ formatDistrictSearchName(district) }}</strong>
        <small>{{ district.county }} · {{ district.region }} · {{ formatSchoolYear(schoolYear) }} calendar</small>
      </NuxtLink>
      <div v-if="!results.length" class="search-result">
        <strong>No matching {{ formatSchoolYear(schoolYear) }} district calendars</strong>
        <small>Try a district name, abbreviation, county, or region.</small>
      </div>
    </div>
  </div>
</template>
