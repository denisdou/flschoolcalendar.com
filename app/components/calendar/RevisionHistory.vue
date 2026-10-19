<script setup lang="ts">
import type { CalendarRevision } from '~~/shared/types/content'
import { formatDateRange } from '~~/shared/utils/content'

defineProps<{
  revisions: CalendarRevision[]
  publishedAt: string | null
}>()
</script>

<template>
  <div id="revision-history" aria-labelledby="revision-history-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Version history</p>
        <h2 id="revision-history-heading">Calendar revision history</h2>
      </div>
    </div>

    <ol v-if="revisions.length" class="timeline">
      <li v-for="revision in revisions" :key="revision.version" class="timeline-item">
        <p class="text-data">{{ formatDateRange(revision.changedAt, null) }}</p>
        <h3>Revision {{ revision.version }} · {{ revision.field }}</h3>
        <p>
          <span v-if="revision.oldValue">Previous: {{ revision.oldValue }}. </span>
          Updated: {{ revision.newValue }}.
        </p>
        <p v-if="revision.reason" class="text-muted">{{ revision.reason }}</p>
        <a class="text-link" :href="revision.sourceUrl" target="_blank" rel="noopener noreferrer">
          Official revision source
        </a>
      </li>
    </ol>

    <div v-else class="notice">
      No official calendar revisions recorded.
      <span v-if="publishedAt">
        Original calendar published {{ formatDateRange(publishedAt, null) }}.
      </span>
    </div>
  </div>
</template>
