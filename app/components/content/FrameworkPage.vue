<script setup lang="ts">
import type { EditorialSection } from './EditorialSections.vue'
import type { InfoCardItem } from './InfoCardGrid.vue'

defineProps<{
  breadcrumbLabel: string
  eyebrow: string
  title: string
  lead: string
  cards?: InfoCardItem[]
  sections: EditorialSection[]
  notice?: string
}>()
</script>

<template>
  <PageIntroSection
    :breadcrumbs="[{ label: 'Home', href: '/' }, { label: breadcrumbLabel }]"
    :eyebrow="eyebrow"
    :title="title"
    :lead="lead"
  />
  <InfoCardsSection v-if="cards?.length" :items="cards" />
  <EditorialContentSection :notice="notice" :sections="sections" />
</template>
