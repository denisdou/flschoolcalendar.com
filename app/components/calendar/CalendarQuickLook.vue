<script setup lang="ts">
import type { KeyDate } from '~~/shared/types/content'
import { formatDateRange } from '~~/shared/utils/content'

const props = defineProps<{
  dates: KeyDate[]
  lastDayConditional?: boolean
}>()

const preferredTypeGroups: KeyDate['eventType'][][] = [
  ['FIRST_DAY', 'CALENDAR_START'],
  ['WINTER_BREAK'],
  ['SPRING_BREAK'],
  ['LAST_DAY', 'CALENDAR_END'],
]

const featuredDates = computed(() => {
  const selected = preferredTypeGroups
    .map(types => props.dates.find(item => types.includes(item.eventType)))
    .filter((item): item is KeyDate => Boolean(item))

  for (const item of props.dates) {
    if (selected.length >= 4) break
    if (!selected.includes(item)) selected.push(item)
  }

  return selected.slice(0, 4)
})

function displayLabel(item: KeyDate): string {
  if (item.basis === 'derived') return item.label
  if (item.eventType === 'FIRST_DAY') return 'First day'
  if (item.eventType === 'LAST_DAY') return props.lastDayConditional ? item.label : 'Last day'
  return item.label
}
</script>

<template>
  <aside class="calendar-quick-look" aria-label="Calendar highlights">
    <dl class="calendar-quick-grid">
      <div v-for="item in featuredDates" :key="item.label" class="calendar-quick-item">
        <dt>
          <span class="calendar-quick-icon" aria-hidden="true">
            <svg
              v-if="item.eventType === 'FIRST_DAY' || item.eventType === 'CALENDAR_START'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
            </svg>
            <svg
              v-else-if="item.eventType === 'WINTER_BREAK'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9 4.9 19.1" />
            </svg>
            <svg
              v-else-if="item.eventType === 'SPRING_BREAK'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          {{ displayLabel(item) }}
        </dt>
        <dd>
          <time :datetime="item.dateStart">
            {{ formatDateRange(item.dateStart, item.dateEnd) }}
          </time>
        </dd>
      </div>
    </dl>

  </aside>
</template>
