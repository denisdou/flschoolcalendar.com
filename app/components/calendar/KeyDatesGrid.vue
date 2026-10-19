<script setup lang="ts">
import type { KeyDate } from '~~/shared/types/content'
import { formatDateRange } from '~~/shared/utils/content'

const props = defineProps<{
  dates: KeyDate[]
}>()

const preferredTypes: KeyDate['eventType'][] = [
  'FIRST_DAY',
  'WINTER_BREAK',
  'SPRING_BREAK',
  'LAST_DAY',
]

const featuredDates = computed(() => {
  const selected = preferredTypes
    .map(type => props.dates.find(item => item.eventType === type))
    .filter((item): item is KeyDate => Boolean(item))

  for (const item of props.dates) {
    if (selected.length >= 4) break
    if (!selected.includes(item)) selected.push(item)
  }

  return selected.slice(0, 4)
})
</script>

<template>
  <div id="key-dates" aria-labelledby="key-dates-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">At a glance</p>
        <h2 id="key-dates-heading">School calendar at a glance</h2>
      </div>
      <p>The four dates families look for most often.</p>
    </div>
    <div class="key-dates-grid">
      <div v-for="item in featuredDates" :key="item.label" class="key-date">
        <span class="key-date-label">{{ item.label }}</span>
        <time class="key-date-value" :datetime="item.dateStart">
          {{ formatDateRange(item.dateStart, item.dateEnd) }}
        </time>
      </div>
    </div>
  </div>
</template>
