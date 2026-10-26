<script setup lang="ts">
import type { DistrictCalendar } from '~~/shared/types/content'
import { buildExtendedTimeOff, type DateSpan } from '~~/shared/utils/extendedTimeOff'
import { formatDateRange } from '~~/shared/utils/content'

const props = defineProps<{ calendar: DistrictCalendar; districtName: string }>()
const windows = computed(() => buildExtendedTimeOff(props.calendar))
const ranges = (items: DateSpan[]) => items.map(item => formatDateRange(item.start, item.end === item.start ? null : item.end)).join('; ')
</script>

<template>
  <div v-if="windows.length" id="extended-time-off" aria-labelledby="extended-time-off-heading">
    <div class="section-heading"><h2 id="extended-time-off-heading">Extended Time Off</h2></div>
    <div class="calendar-events-table-wrap">
      <table class="calendar-events-table extended-time-off-table">
        <caption class="sr-only">Extended no-school periods for {{ districtName }} {{ calendar.schoolYear }}</caption>
        <thead><tr><th scope="col">Period</th><th scope="col">Date(s)</th><th scope="col">Length</th></tr></thead>
        <tbody>
          <tr v-for="item in windows" :key="item.start">
            <th scope="row">{{ item.name }}</th>
            <td>
              <span class="text-data">{{ formatDateRange(item.start, item.end) }}</span>
              <span class="time-off-detail">Scheduled no school: {{ ranges(item.noSchool) }}</span>
              <span v-if="item.weekends.length" class="time-off-detail">Adjacent weekends: {{ ranges(item.weekends) }}</span>
              <span v-if="item.conditional.length" class="time-off-caution">Possible make-up days: {{ ranges(item.conditional) }}. Attendance may change; confirm district updates.</span>
            </td>
            <td class="text-data">{{ item.days }} days</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
