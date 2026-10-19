<script setup lang="ts">
import type { CatalogGroupItem } from './CatalogGroupDirectory.vue'

defineProps<{
  items: CatalogGroupItem[]
  itemLabel: string
}>()
</script>

<template>
  <section class="page-section page-section--tight">
    <div class="site-container">
      <CatalogGroupDirectory :items="items" :item-label="itemLabel" />
    </div>
  </section>
</template>
