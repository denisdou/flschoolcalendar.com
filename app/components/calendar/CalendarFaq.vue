<script setup lang="ts">
import type { CalendarFaqItem } from '~~/shared/types/content'

defineProps<{
  items: CalendarFaqItem[]
  heading?: string
}>()
</script>

<template>
  <div v-if="items.length" id="faq" aria-labelledby="calendar-faq-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Common questions</p>
        <h2 id="calendar-faq-heading">{{ heading || 'Frequently asked questions' }}</h2>
      </div>
    </div>

    <div class="calendar-faq-list">
      <details
        v-for="(item, index) in items"
        :key="item.question"
        class="calendar-faq-item"
        :open="index < 2"
      >
        <summary>
          <span>{{ item.question }}</span>
          <span class="calendar-faq-toggle" aria-hidden="true">+</span>
        </summary>
        <p>{{ item.answer }}</p>
      </details>
    </div>
  </div>
</template>
