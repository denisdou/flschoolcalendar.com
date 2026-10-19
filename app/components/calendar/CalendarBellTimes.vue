<script setup lang="ts">
import type { CalendarSchoolHours, CalendarSource, DistrictCalendar } from '~~/shared/types/content'
import { formatLongDate } from '~~/shared/utils/content'
import { getSchoolHoursRows } from '~~/shared/utils/schoolHours'

const props = defineProps<{
  hours?: DistrictCalendar['schoolHours']
  sources: CalendarSource[]
  heading: string
}>()

const rows = computed(() => getSchoolHoursRows(props.hours))

// Only lift a note when it applies to every displayed row; campus-specific
// caveats must remain attached to their own schedule.
const sharedNote = computed(() => {
  const note = rows.value[0]?.note?.trim()
  return rows.value.length > 1 && note && rows.value.every(row => row.note?.trim() === note)
    ? note
    : null
})

const sourceGroups = computed(() => {
  const groups = new Map<string, {
    key: string
    basis?: CalendarSchoolHours['basis']
    source?: CalendarSource
    scopes: string[]
    rowCount: number
  }>()

  for (const row of rows.value) {
    const source = props.sources.find(source => source.id === row.sourceId && /^https?:\/\//i.test(source.url))
    const basis = row.basis === 'official' || row.basis === 'derived' ? row.basis : undefined
    if (!basis && !source) continue

    const key = JSON.stringify([basis, source?.id])
    const scope = row.effectiveFrom || row.effectiveThrough
      ? `${row.scope} (${effectiveDates(row)})`
      : row.scope
    const group = groups.get(key)
    if (group) {
      if (!group.scopes.includes(scope)) group.scopes.push(scope)
      group.rowCount++
    } else {
      groups.set(key, { key, basis, source, scopes: [scope], rowCount: 1 })
    }
  }

  return [...groups.values()]
})

function effectiveDates(row: CalendarSchoolHours) {
  if (row.effectiveFrom && row.effectiveThrough) {
    return `${formatLongDate(row.effectiveFrom)} through ${formatLongDate(row.effectiveThrough)}`
  }
  if (row.effectiveFrom) return `from ${formatLongDate(row.effectiveFrom)}`
  if (row.effectiveThrough) return `through ${formatLongDate(row.effectiveThrough)}`
  return ''
}

function schedules(row: CalendarSchoolHours) {
  return [
    { label: 'Regular hours', value: row.regularHours },
    { label: 'Early release', value: row.earlyReleaseHours || row.earlyReleaseTime },
    { label: 'Late arrival', value: row.lateArrivalHours },
    { label: 'Exam dismissal', value: row.examDismissalHours },
  ].filter(item => typeof item.value === 'string' && item.value.trim())
}
</script>

<template>
  <div v-if="rows.length" id="bell-times" aria-labelledby="bell-times-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">School schedules</p>
        <h2 id="bell-times-heading">{{ heading }}</h2>
      </div>
    </div>

    <div class="calendar-bell-times-card">
      <p v-if="sharedNote" class="calendar-bell-times-note calendar-bell-times-shared-note">{{ sharedNote }}</p>
      <ul class="calendar-bell-times-list">
        <li v-for="(row, index) in rows" :key="row.scope + index" class="calendar-bell-times-row">
          <div>
            <h3>{{ row.scope }}</h3>
            <p v-if="row.effectiveFrom || row.effectiveThrough" class="calendar-bell-times-effective">
              School dates: {{ effectiveDates(row) }}
            </p>
          </div>
          <div class="calendar-bell-times-details">
            <dl>
              <div v-for="schedule in schedules(row)" :key="schedule.label">
                <dt>{{ schedule.label }}</dt>
                <dd>{{ schedule.value }}</dd>
              </div>
            </dl>
            <p v-if="row.note && !sharedNote" class="calendar-bell-times-note">{{ row.note }}</p>
          </div>
        </li>
      </ul>
      <div v-if="sourceGroups.length" class="calendar-bell-times-sources">
        <p v-for="group in sourceGroups" :key="group.key" class="calendar-bell-times-source">
          <span v-if="group.rowCount < rows.length" class="calendar-bell-times-source-scope">{{ group.scopes.join('; ') }}</span>
          <span v-if="group.basis === 'official'">Official schedule</span>
          <span v-else-if="group.basis === 'derived'">Derived from official information</span>
          <a v-if="group.source" :href="group.source.url" target="_blank" rel="noopener noreferrer">
            {{ group.source.label }}<span class="sr-only"> (opens in a new tab)</span>
          </a>
          <span v-if="group.source?.publishedAt">
            Published <time :datetime="group.source.publishedAt">{{ formatLongDate(group.source.publishedAt) }}</time>
          </span>
        </p>
      </div>
    </div>
  </div>
</template>
