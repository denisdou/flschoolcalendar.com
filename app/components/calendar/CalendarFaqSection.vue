<script setup lang="ts">
import type { CalendarFaqItem } from '~~/shared/types/content'

defineProps<{
  items: CalendarFaqItem[]
  surface?: boolean
}>()
</script>

<template>
  <section class="page-section calendar-section" :class="{ 'calendar-section--surface': surface }">
    <div class="site-container">
      <CalendarFaq :items="items" />
    </div>
  </section>
</template>
