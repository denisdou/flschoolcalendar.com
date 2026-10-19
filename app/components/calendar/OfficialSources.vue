<script setup lang="ts">
import type { CalendarSource, DistrictIdentity } from '~~/shared/types/content'
import { formatDateRange } from '~~/shared/utils/content'

defineProps<{
  district: DistrictIdentity
  sources: CalendarSource[]
  publishedAt: string | null
  verifiedAt: string | null
  revisionCount: number
  heading?: string
}>()
</script>

<template>
  <div id="official-sources" aria-labelledby="official-sources-heading">
    <div class="panel">
      <div class="panel-header">
        <h2 id="official-sources-heading" class="panel-title">
          {{ heading || 'Official sources & verification' }}
        </h2>
        <span class="badge badge--official">Source confirmed</span>
      </div>
      <div class="panel-body">
        <dl class="source-list">
          <div class="source-item">
            <dt class="source-label">District</dt>
            <dd>{{ district.name }}</dd>
          </div>
          <div v-for="source in sources" :key="source.id" class="source-item">
            <dt class="source-label">{{ source.label }}</dt>
            <dd>
              <a class="text-link" :href="source.url" target="_blank" rel="noopener noreferrer">
                View official source
              </a>
            </dd>
          </div>
          <div v-if="publishedAt" class="source-item">
            <dt class="source-label">Calendar published</dt>
            <dd><time :datetime="publishedAt">{{ formatDateRange(publishedAt, null) }}</time></dd>
          </div>
          <div v-if="verifiedAt" class="source-item">
            <dt class="source-label">Source last checked</dt>
            <dd><time :datetime="verifiedAt">{{ formatDateRange(verifiedAt, null) }}</time></dd>
          </div>
          <div class="source-item">
            <dt class="source-label">Revision count</dt>
            <dd class="text-data">{{ revisionCount }}</dd>
          </div>
        </dl>
        <a
          class="text-link"
          :href="'mailto:corrections@flschoolcalendar.com?subject=Calendar correction for ' + district.name"
        >
          Report an error
        </a>
      </div>
    </div>
  </div>
</template>
