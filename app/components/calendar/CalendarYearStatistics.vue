<script setup lang="ts">
import type { DistrictCalendar } from '~~/shared/types/content'

const props = defineProps<{
  calendar: DistrictCalendar
}>()

const statistics = computed(() => (props.calendar.statistics || []).filter(item =>
  !(props.calendar.publishStandaloneNoSchoolStatistic === false && item.id === 'student-no-school-days'),
))
</script>

<template>
  <article v-if="statistics.length" class="calendar-notes-card calendar-year-statistics">
    <h3>School year by the numbers</h3>
    <dl class="calendar-year-statistics-grid">
      <div v-for="item in statistics" :key="item.id" class="calendar-year-statistic">
        <dt>{{ item.label }}</dt>
        <dd class="calendar-year-statistic-value">{{ item.value }}</dd>
        <dd class="calendar-year-statistic-source">
          <strong class="calendar-year-statistic-basis">
            {{ item.basis === 'official' ? 'Official figure' : 'Calculated from official dates' }}
          </strong>
          <span v-if="item.explanation" class="calendar-year-statistic-explanation">
            {{ item.explanation }}
          </span>
        </dd>
      </div>
    </dl>
  </article>
</template>
