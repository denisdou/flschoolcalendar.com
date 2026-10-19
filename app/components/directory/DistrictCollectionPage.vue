<script setup lang="ts">
import type { DistrictCatalogEntry } from '~~/shared/types/content'

defineProps<{
  collectionLabel: string
  title: string
  lead: string
  parentLabel: string
  parentHref: string
  districts: DistrictCatalogEntry[]
}>()
</script>

<template>
  <PageIntroSection
    :breadcrumbs="[
      { label: 'Home', href: '/' },
      { label: parentLabel, href: parentHref },
      { label: title },
    ]"
    :eyebrow="collectionLabel"
    :title="title"
    :lead="lead"
  >
    <div class="metadata-strip metadata-strip--compact">
      <div class="metadata-item">
        <span class="metadata-label">District records</span>
        <data class="metadata-value">{{ districts.length }}</data>
      </div>
      <div class="metadata-item">
        <span class="metadata-label">Published calendars</span>
        <data class="metadata-value">
          {{ districts.reduce((total, district) => total + district.calendarPages.filter(page => page.indexable).length, 0) }}
        </data>
      </div>
    </div>
  </PageIntroSection>
  <DistrictDirectorySection :districts="districts" />
</template>
