<script setup lang="ts">
import type { DistrictCalendar, DistrictIdentity } from '~~/shared/types/content'
import { formatCalendarLabel, formatDateRange } from '~~/shared/utils/content'

defineProps<{
  district: DistrictIdentity
  calendar: DistrictCalendar
}>()
</script>

<template>
  <div id="calendar-notes" aria-labelledby="calendar-notes-heading">
    <div class="section-heading">
      <div>
        <h2 id="calendar-notes-heading">
          About {{ district.name }}
        </h2>
      </div>
    </div>

    <div class="calendar-notes-grid">
      <article class="calendar-notes-card">
        <h3>School calendar overview</h3>
        <p class="calendar-notes-summary">
          <template v-if="calendar.firstDayBasis === 'derived' || calendar.lastDayBasis === 'derived'">
            The {{ formatCalendarLabel(calendar) }} calendar shows scheduled dates from
            <strong>{{ formatDateRange(calendar.firstDay, null) }}</strong>
            through
            <strong>{{ formatDateRange(calendar.lastDay, null) }}</strong>.
          </template>
          <template v-else>
            The {{ formatCalendarLabel(calendar) }} school calendar begins
            <strong v-if="calendar.firstDay">{{ formatDateRange(calendar.firstDay, null) }}</strong>
            <span v-else>on a date not yet reported</span>
            and ends
            <strong v-if="calendar.lastDay">{{ formatDateRange(calendar.lastDay, null) }}</strong>
            <span v-else>on a date not yet reported</span><span v-if="calendar.lastDayConditional"> ({{ calendar.lastDayCondition }})</span>.
          </template>
        </p>
        <CalendarPlanningNotice :disclaimer="calendar.about.disclaimer" />
      </article>

      <article v-if="calendar.breaks.length" class="calendar-notes-card">
        <h3>Major school breaks</h3>
        <ul class="calendar-note-list">
          <li v-for="item in calendar.breaks" :key="item.name">
            <strong>{{ item.name }}</strong>
            <span>{{ formatDateRange(item.dateStart, item.dateEnd) }}</span>
          </li>
        </ul>
      </article>

      <CalendarYearStatistics :calendar="calendar" />

      <article
        v-if="calendar.comparativeInsights.length"
        class="calendar-notes-card calendar-notes-card--insights"
      >
        <h3>What to know</h3>
        <ul class="calendar-note-insight-list">
          <li v-for="insight in calendar.comparativeInsights" :key="insight">
            {{ insight }}
          </li>
        </ul>
      </article>
    </div>
  </div>
</template>
