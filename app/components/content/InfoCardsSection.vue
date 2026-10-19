<script setup lang="ts">
import type { InfoCardItem } from './InfoCardGrid.vue'

defineProps<{ items: InfoCardItem[] }>()
</script>

<template>
  <section class="page-section page-section--tight">
    <div class="site-container">
      <InfoCardGrid :items="items" />
    </div>
  </section>
</template>
