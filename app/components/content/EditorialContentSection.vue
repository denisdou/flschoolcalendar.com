<script setup lang="ts">
import type { EditorialSection } from './EditorialSections.vue'

defineProps<{
  sections: EditorialSection[]
  notice?: string
}>()
</script>

<template>
  <section class="page-section page-section--tight">
    <div class="site-container">
      <p v-if="notice" class="notice">{{ notice }}</p>
      <EditorialSections :sections="sections" />
    </div>
  </section>
</template>
