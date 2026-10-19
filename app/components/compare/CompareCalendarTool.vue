<script setup lang="ts">
import type { DistrictCatalogEntry } from '~~/shared/types/content'
import { buildCalendarComparison } from '~~/shared/utils/calendarComparison'
import { formatDateRange, formatSchoolYear } from '~~/shared/utils/content'

const props = defineProps<{
  districts: DistrictCatalogEntry[]
  schoolYear: string
}>()

type DistrictChoice = {
  district: DistrictCatalogEntry
  calendar: DistrictCatalogEntry['calendarPages'][number]
}

const route = useRoute()
const router = useRouter()
const choices = computed<DistrictChoice[]>(() => props.districts
  .flatMap((district) => {
    const calendar = district.calendarPages.find(page =>
      page.indexable && page.schoolYear === props.schoolYear,
    )
    return calendar ? [{ district, calendar }] : []
  })
  .sort((a, b) => a.district.name.localeCompare(b.district.name)))

function validQuerySlug(value: unknown): string {
  return typeof value === 'string' && choices.value.some(choice => choice.district.slug === value)
    ? value
    : ''
}

// The prerendered route temporarily has no query during hydration. Read it
// without writing it back: only an explicit selector change should update URL.
const leftSlug = computed({
  get: () => validQuerySlug(route.query.left),
  set: value => updateDistrictSelection('left', value),
})
const rightSlug = computed({
  get: () => {
    const slug = validQuerySlug(route.query.right)
    return slug === leftSlug.value ? '' : slug
  },
  set: value => updateDistrictSelection('right', value),
})

function updateDistrictSelection(side: 'left' | 'right', value: string) {
  const left = side === 'left' ? validQuerySlug(value) : leftSlug.value
  const selectedRight = side === 'right' ? validQuerySlug(value) : rightSlug.value
  const right = selectedRight === left ? '' : selectedRight
  if (route.query.left === (left || undefined) && route.query.right === (right || undefined)) return

  const query = { ...route.query }
  if (left) query.left = left
  else delete query.left
  if (right) query.right = right
  else delete query.right
  void router.replace({ path: route.path, query, hash: route.hash })
}

const leftChoice = computed(() => choices.value.find(choice => choice.district.slug === leftSlug.value) || null)
const rightChoice = computed(() => choices.value.find(choice => choice.district.slug === rightSlug.value) || null)
const comparisonRows = computed(() => leftChoice.value && rightChoice.value
  ? buildCalendarComparison(
      leftChoice.value.district.shortName,
      leftChoice.value.calendar,
      rightChoice.value.district.shortName,
      rightChoice.value.calendar,
    )
  : [])
const differentCount = computed(() => comparisonRows.value.filter(row => row.state === 'different').length)
const sameCount = computed(() => comparisonRows.value.filter(row => row.state === 'same').length)
const missingCount = computed(() => comparisonRows.value.filter(row => row.state === 'missing').length)
</script>

<template>
  <section class="page-section page-section--tight">
    <div class="site-container">
      <div class="comparison-builder" aria-labelledby="comparison-builder-heading">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Build a comparison</p>
            <h2 id="comparison-builder-heading">Search for two districts</h2>
          </div>
          <span class="section-heading-meta">{{ formatSchoolYear(schoolYear) }}</span>
        </div>

        <div class="comparison-select-grid">
          <CompareDistrictSearch
            v-model="leftSlug"
            input-id="compare-first-district"
            label="First district"
            :districts="choices.map(choice => choice.district)"
            :excluded-slug="rightSlug"
          />
          <span class="comparison-versus" aria-hidden="true">VS</span>
          <CompareDistrictSearch
            v-model="rightSlug"
            input-id="compare-second-district"
            label="Second district"
            :districts="choices.map(choice => choice.district)"
            :excluded-slug="leftSlug"
          />
        </div>
      </div>

      <template v-if="leftChoice && rightChoice">
        <div class="comparison-summary" aria-label="Selected calendars">
          <article v-for="choice in [leftChoice, rightChoice]" :key="choice.district.slug">
            <span class="metadata-label">{{ choice.district.county }} · {{ choice.district.region }}</span>
            <h3><NuxtLink :to="choice.calendar.href">{{ choice.district.name }}</NuxtLink></h3>
            <p>
              {{ choice.calendar.status === 'revised' ? 'Revised official' : choice.calendar.status.charAt(0).toUpperCase() + choice.calendar.status.slice(1) }} calendar
              <template v-if="choice.calendar.verifiedAt">
                · checked <time :datetime="choice.calendar.verifiedAt">{{ formatDateRange(choice.calendar.verifiedAt, null) }}</time>
              </template>
            </p>
          </article>
        </div>

        <p class="comparison-counts" aria-live="polite">
          <strong>{{ differentCount }} different</strong>
          <span>{{ sameCount }} same</span>
          <span v-if="missingCount">{{ missingCount }} missing</span>
        </p>

        <div class="comparison-table-wrap" tabindex="0" aria-label="Scrollable district calendar comparison">
          <table class="comparison-table">
            <caption class="sr-only">
              {{ leftChoice.district.name }} and {{ rightChoice.district.name }} calendar comparison
            </caption>
            <thead>
              <tr>
                <th scope="col">Comparison item</th>
                <th scope="col">{{ leftChoice.district.shortName }}</th>
                <th scope="col">{{ rightChoice.district.shortName }}</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in comparisonRows" :key="row.id" :class="'comparison-row--' + row.state">
                <th scope="row">{{ row.label }}</th>
                <td>
                  <strong>{{ row.leftValue }}</strong>
                  <small v-if="row.leftMeta">{{ row.leftMeta }}</small>
                </td>
                <td>
                  <strong>{{ row.rightValue }}</strong>
                  <small v-if="row.rightMeta">{{ row.rightMeta }}</small>
                </td>
                <td>
                  <span class="comparison-result" :class="'comparison-result--' + row.state">
                    {{ row.state === 'same' ? 'Same' : row.state === 'different' ? 'Different' : 'Missing data' }}
                  </span>
                  <small>{{ row.result }}</small>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <div v-else class="comparison-empty">
        <p class="eyebrow">Comparison waiting</p>
        <h2>{{ leftChoice || rightChoice ? 'Choose the other district' : 'Start with two district calendars' }}</h2>
        <p>The table appears after two different districts are selected. Only published current-year records are available.</p>
      </div>
    </div>
  </section>
</template>
