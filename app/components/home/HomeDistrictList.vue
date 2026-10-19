<script setup lang="ts">
import type { CalendarStatus, DistrictCatalogEntry } from '~~/shared/types/content'
import { districtMatchesSearch, formatDateRange, formatDistrictSearchName, formatSchoolYear } from '~~/shared/utils/content'

const props = defineProps<{
  districts: DistrictCatalogEntry[]
  schoolYear: string
}>()

type CalendarPage = DistrictCatalogEntry['calendarPages'][number]

interface DistrictRow {
  district: DistrictCatalogEntry
  calendar: CalendarPage
}

interface RegionGroup {
  name: string
  rows: DistrictRow[]
}

const query = ref('')
const region = ref('')
const county = ref('')

const statusLabels: Record<CalendarStatus, string> = {
  official: 'Official',
  revised: 'Revised official',
  historical: 'Historical official',
  draft: 'Draft',
}

const districtRows = computed<DistrictRow[]>(() => props.districts
  .flatMap((district) => {
    const calendar = district.calendarPages.find(page =>
      page.indexable && page.schoolYear === props.schoolYear,
    )
    return calendar ? [{ district, calendar }] : []
  })
  .sort((a, b) => a.district.name.localeCompare(b.district.name)))

const regionOptions = computed(() => [...new Set(
  districtRows.value.map(row => row.district.region),
)].sort())

const countyOptions = computed(() => [...new Set(
  districtRows.value
    .filter(row => !region.value || row.district.region === region.value)
    .map(row => row.district.county),
)].sort())

const filteredRows = computed(() => {
  const term = query.value.trim().toLowerCase()
  return districtRows.value.filter((row) => {
    const matchesText = !term
      || districtMatchesSearch(row.district, term)
    const matchesRegion = !region.value || row.district.region === region.value
    const matchesCounty = !county.value || row.district.county === county.value
    return matchesText && matchesRegion && matchesCounty
  })
})

const mobileRegionGroups = computed<RegionGroup[]>(() => {
  const groups = new Map<string, DistrictRow[]>()
  for (const row of filteredRows.value) {
    const rows = groups.get(row.district.region) || []
    rows.push(row)
    groups.set(row.district.region, rows)
  }
  return [...groups.entries()]
    .map(([name, rows]) => ({ name, rows }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

const hasActiveFilters = computed(() => Boolean(query.value || region.value || county.value))

watch(region, () => {
  if (county.value && !countyOptions.value.includes(county.value)) {
    county.value = ''
  }
})

function clearFilters() {
  query.value = ''
  region.value = ''
  county.value = ''
}

</script>

<template>
  <section id="districts" class="page-section">
    <div class="site-container home-district-directory" aria-labelledby="districts-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Current school calendar</p>
        <h2 id="districts-heading">All published district calendars</h2>
      </div>
      <span class="section-heading-meta">{{ formatSchoolYear(schoolYear) }}</span>
    </div>

    <p class="home-directory-intro">
      Filter current-year calendars by region or county, then compare location, official status, and school-calendar boundaries.
    </p>

    <div v-if="districtRows.length" class="home-directory-toolbar" role="search" aria-label="Filter district calendars">
      <label class="control-label">
        <span>Search districts</span>
        <input
          v-model="query"
          class="search-input"
          type="search"
          placeholder="District, abbreviation, county, or region"
        >
      </label>
      <label class="control-label">
        <span>Region</span>
        <select v-model="region" class="select-control">
          <option value="">All regions</option>
          <option v-for="item in regionOptions" :key="item" :value="item">{{ item }}</option>
        </select>
      </label>
      <label class="control-label">
        <span>County</span>
        <select v-model="county" class="select-control">
          <option value="">All counties</option>
          <option v-for="item in countyOptions" :key="item" :value="item">{{ item }}</option>
        </select>
      </label>
      <button
        v-if="hasActiveFilters"
        class="button button--secondary home-directory-clear"
        type="button"
        @click="clearFilters"
      >
        Clear filters
      </button>
    </div>

    <p v-if="districtRows.length" class="result-summary" aria-live="polite">
      Showing {{ filteredRows.length }} of {{ districtRows.length }} districts with a published {{ formatSchoolYear(schoolYear) }} calendar.
    </p>

    <div
      v-if="filteredRows.length"
      class="home-district-table-wrap"
      tabindex="0"
      aria-label="Scrollable current-year district calendar comparison"
    >
      <table class="home-district-table">
        <caption class="sr-only">
          Published {{ formatSchoolYear(schoolYear) }} district calendars with location, official status, first day, and last day
        </caption>
        <thead>
          <tr>
            <th scope="col">District</th>
            <th scope="col">County · Region</th>
            <th scope="col">Status</th>
            <th scope="col">First day</th>
            <th scope="col">Last day</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in filteredRows" :key="row.district.slug">
            <th scope="row">
              <NuxtLink class="home-district-link" :to="row.calendar.href">
                <strong>{{ formatDistrictSearchName(row.district) }}</strong>
              </NuxtLink>
            </th>
            <td class="district-location">
              {{ row.district.county }} · {{ row.district.region }}
            </td>
            <td>
              <span class="district-status" :class="'district-status--' + row.calendar.status">
                {{ statusLabels[row.calendar.status] }}
              </span>
            </td>
            <td class="district-date">
              <time v-if="row.calendar.firstDay" :datetime="row.calendar.firstDay">
                {{ formatDateRange(row.calendar.firstDay, null) }}
              </time>
              <span v-else>Not reported</span>
            </td>
            <td class="district-date">
              <time v-if="row.calendar.lastDay" :datetime="row.calendar.lastDay">
                {{ formatDateRange(row.calendar.lastDay, null) }}
              </time>
              <span v-else>Not reported</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="filteredRows.length" class="home-district-mobile">
      <details
        v-for="(group, index) in mobileRegionGroups"
        :key="group.name"
        class="home-mobile-region"
        :open="index === 0"
      >
        <summary>
          <strong>{{ group.name }}</strong>
          <span>{{ group.rows.length }} {{ group.rows.length === 1 ? 'district' : 'districts' }}</span>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true">
            <path d="m5 7.5 5 5 5-5" />
          </svg>
        </summary>

        <div class="home-mobile-region-list">
          <article
            v-for="row in group.rows"
            :key="row.district.slug"
            class="home-mobile-district"
          >
            <div class="home-mobile-district-header">
              <NuxtLink :to="row.calendar.href">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M8 3v4M16 3v4M3 10h18" />
                </svg>
                <strong>{{ formatDistrictSearchName(row.district) }}</strong>
              </NuxtLink>
              <span class="district-status" :class="'district-status--' + row.calendar.status">
                {{ statusLabels[row.calendar.status] }}
              </span>
            </div>

            <dl>
              <div>
                <dt>First Day:</dt>
                <dd>
                  <time v-if="row.calendar.firstDay" :datetime="row.calendar.firstDay">
                    {{ formatDateRange(row.calendar.firstDay, null) }}
                  </time>
                  <span v-else>Not reported</span>
                </dd>
              </div>
              <div>
                <dt>Last Day:</dt>
                <dd>
                  <time v-if="row.calendar.lastDay" :datetime="row.calendar.lastDay">
                    {{ formatDateRange(row.calendar.lastDay, null) }}
                  </time>
                  <span v-else>Not reported</span>
                </dd>
              </div>
            </dl>
          </article>
        </div>
      </details>
    </div>

    <div v-if="!districtRows.length" class="home-directory-empty">
      <h3>Florida district calendars are being verified</h3>
      <p>Source-backed calendars will appear here after their dates, status, and official district links pass review.</p>
    </div>

    <div v-else-if="!filteredRows.length" class="home-directory-empty">
      <h3>No districts match these filters</h3>
      <p>Clear one or more filters to return to all published current-year calendars.</p>
      <button class="button button--secondary" type="button" @click="clearFilters">
        Clear filters
      </button>
    </div>
    </div>
  </section>
</template>
