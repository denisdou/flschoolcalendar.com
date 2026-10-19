<script setup lang="ts">
import type { DistrictCatalogEntry } from '~~/shared/types/content'
import { districtCalendarHref, formatDistrictSearchName, formatSchoolYear, searchCurrentYearDistricts } from '~~/shared/utils/content'

const props = defineProps<{
  districts: DistrictCatalogEntry[]
  schoolYear: string
  searchId: string
}>()

const route = useRoute()
const router = useRouter()
const query = ref('')
const isFocused = ref(false)

const results = computed(() => {
  return searchCurrentYearDistricts(props.districts, query.value, props.schoolYear)
})

const showResults = computed(() => isFocused.value && query.value.trim().length >= 2)

function openFirstResult() {
  const first = results.value[0]
  if (first) router.push(districtCalendarHref(first, props.schoolYear))
}

watch(() => route.path, () => {
  query.value = ''
  isFocused.value = false
})
</script>

<template>
  <form class="header-search" role="search" @submit.prevent="openFirstResult">
    <label class="sr-only" :for="searchId">Search current-year district calendars</label>
    <span class="header-search-icon" aria-hidden="true">
      <svg viewBox="0 0 20 20" focusable="false">
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path d="m12.5 12.5 4 4" />
      </svg>
    </span>
    <input
      :id="searchId"
      v-model="query"
      type="search"
      name="district"
      autocomplete="off"
      placeholder="Search districts"
      aria-label="Search current-year district calendars"
      :aria-controls="searchId + '-results'"
      :aria-expanded="showResults"
      @focus="isFocused = true"
      @blur="isFocused = false"
    >

    <div
      v-if="showResults"
      :id="searchId + '-results'"
      class="header-search-results"
      aria-live="polite"
    >
      <NuxtLink
        v-for="district in results"
        :key="district.slug"
        class="header-search-result"
        :to="districtCalendarHref(district, schoolYear)"
        @mousedown.prevent
      >
        <strong>{{ formatDistrictSearchName(district) }}</strong>
        <small>{{ district.county }} · {{ district.region }} · {{ formatSchoolYear(schoolYear) }} calendar</small>
      </NuxtLink>
      <p v-if="!results.length" class="header-search-empty">
        No matching {{ formatSchoolYear(schoolYear) }} district calendars
      </p>
    </div>
  </form>
</template>
