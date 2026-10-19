<script setup lang="ts">
import type { CalendarHighlight } from '~~/shared/types/content'

defineProps<{
  highlights: CalendarHighlight[]
}>()
</script>

<template>
  <div v-if="highlights.length" id="calendar-notes" aria-labelledby="calendar-notes-heading">
    <div class="panel">
      <div class="panel-header">
        <h2 id="calendar-notes-heading" class="panel-title">Calendar notes</h2>
        <span class="text-dim">From the official calendar</span>
      </div>
      <div class="highlights-grid">
        <div v-for="item in highlights" :key="item.label" class="highlight-item">
          <span class="metadata-label">{{ item.label }}</span>
          <data class="highlight-value">{{ item.value }}</data>
          <span v-if="item.note" class="highlight-note">{{ item.note }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
