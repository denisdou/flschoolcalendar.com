<script setup lang="ts">
import type { CalendarBreak } from '~~/shared/types/content'
import { formatDateRange } from '~~/shared/utils/content'

defineProps<{
  breaks: CalendarBreak[]
}>()
</script>

<template>
  <div v-if="breaks.length" id="school-breaks" aria-labelledby="school-breaks-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Breaks &amp; planning windows</p>
        <h2 id="school-breaks-heading">School breaks</h2>
      </div>
    </div>
    <ul class="break-list">
      <li v-for="item in breaks" :key="item.name" class="break-item">
        <div>
          <h3>{{ item.name }}</h3>
          <p class="text-data">{{ formatDateRange(item.dateStart, item.dateEnd) }}</p>
          <p v-if="item.note">{{ item.note }}</p>
        </div>
        <dl class="source-list">
          <div v-if="item.nextStudentAttendanceDate" class="source-item">
            <dt class="source-label">Students return</dt>
            <dd>{{ formatDateRange(item.nextStudentAttendanceDate, null) }}</dd>
          </div>
          <div v-if="item.schoolWeekdaysOff != null" class="source-item">
            <dt class="source-label">School weekdays off</dt>
            <dd class="text-data">{{ item.schoolWeekdaysOff }}</dd>
          </div>
        </dl>
      </li>
    </ul>
  </div>
</template>
