<script setup lang="ts">
import type { CalendarDiscovery } from '~~/shared/types/content'

defineProps<{
  discovery: CalendarDiscovery
}>()
</script>

<template>
  <div class="page-section">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Source tracking</p>
        <h2>Official calendar discovery</h2>
      </div>
      <p>These fields are stored in the district JSON record for future PDF monitoring.</p>
    </div>
    <div class="panel">
      <div class="panel-body">
        <dl class="source-list">
          <div class="source-item">
            <dt class="source-label">Official district website</dt>
            <dd>
              <a
                v-if="discovery.officialWebsiteUrl"
                class="text-link"
                :href="discovery.officialWebsiteUrl"
                rel="noopener noreferrer"
              >View website</a>
              <span v-else class="text-dim">Not researched yet</span>
            </dd>
          </div>
          <div class="source-item">
            <dt class="source-label">Official calendar page</dt>
            <dd>
              <a
                v-if="discovery.calendarPageUrl"
                class="text-link"
                :href="discovery.calendarPageUrl"
                rel="noopener noreferrer"
              >View calendar page</a>
              <span v-else class="text-dim">Not researched yet</span>
            </dd>
          </div>
          <div class="source-item">
            <dt class="source-label">Documents page</dt>
            <dd>
              <a
                v-if="discovery.documentsPageUrl"
                class="text-link"
                :href="discovery.documentsPageUrl"
                rel="noopener noreferrer"
              >View documents</a>
              <span v-else class="text-dim">Not researched yet</span>
            </dd>
          </div>
          <div class="source-item">
            <dt class="source-label">Crawler status</dt>
            <dd>{{ discovery.crawlEnabled ? 'Enabled' : 'Disabled pending source setup' }}</dd>
          </div>
        </dl>
      </div>
    </div>
  </div>
</template>
