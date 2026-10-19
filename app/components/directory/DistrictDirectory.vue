<script setup lang="ts">
import type { DistrictCatalogEntry } from '~~/shared/types/content'
import { districtMatchesSearch } from '~~/shared/utils/content'

const props = defineProps<{
  districts: DistrictCatalogEntry[]
  syncQuery?: boolean
}>()

const route = useRoute()
const router = useRouter()
const query = ref(typeof route.query.q === 'string' ? route.query.q : '')
const county = ref(typeof route.query.county === 'string' ? route.query.county : '')
const region = ref(typeof route.query.region === 'string' ? route.query.region : '')

const counties = computed(() =>
  [...new Set(props.districts.map(district => district.county))].sort(),
)
const regions = computed(() =>
  [...new Set(props.districts.map(district => district.region))].sort(),
)
const filteredDistricts = computed(() => {
  const term = query.value.trim().toLowerCase()
  return props.districts.filter((district) => {
    const matchesText = !term
      || districtMatchesSearch(district, term)
    const matchesCounty = !county.value || district.county === county.value
    const matchesRegion = !region.value || district.region === region.value
    return matchesText && matchesCounty && matchesRegion
  })
})

watch([query, county, region], () => {
  if (!props.syncQuery || !import.meta.client) {
    return
  }

  const nextQuery: Record<string, string> = {}
  if (query.value) nextQuery.q = query.value
  if (county.value) nextQuery.county = county.value
  if (region.value) nextQuery.region = region.value
  router.replace({ path: route.path, query: nextQuery })
})
</script>

<template>
  <div>
    <div class="directory-toolbar">
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
        <span>County</span>
        <select v-model="county" class="select-control">
          <option value="">All counties</option>
          <option v-for="item in counties" :key="item" :value="item">{{ item }}</option>
        </select>
      </label>
      <label class="control-label">
        <span>Region</span>
        <select v-model="region" class="select-control">
          <option value="">All regions</option>
          <option v-for="item in regions" :key="item" :value="item">{{ item }}</option>
        </select>
      </label>
    </div>

    <p class="result-summary" aria-live="polite">
      Showing {{ filteredDistricts.length }} of {{ districts.length }} districts.
    </p>

    <div v-if="filteredDistricts.length" class="directory-grid">
      <DistrictDirectoryCard
        v-for="district in filteredDistricts"
        :key="district.slug"
        :district="district"
      />
    </div>

    <EmptyState
      v-else
      title="No districts match these filters"
      description="Clear one or more filters, or search by a shorter district name."
    />
  </div>
</template>
