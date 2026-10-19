<script setup lang="ts">
export interface CatalogGroupItem {
  name: string
  href: string
  count: number
  description: string
}

defineProps<{
  items: CatalogGroupItem[]
  itemLabel: string
}>()
</script>

<template>
  <div>
    <p class="result-summary">{{ items.length }} {{ itemLabel }} groups with published calendars.</p>
    <div class="directory-grid">
      <NuxtLink
        v-for="item in items"
        :key="item.name"
        class="directory-card"
        :to="item.href"
      >
        <div>
          <h3>{{ item.name }}</h3>
          <p>{{ item.description }}</p>
        </div>
        <div class="directory-meta">
          <span>{{ item.count }} district records</span>
          <span>Browse {{ itemLabel }} →</span>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
