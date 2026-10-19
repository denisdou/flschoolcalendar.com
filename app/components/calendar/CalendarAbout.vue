<script setup lang="ts">
import type { DistrictCalendar } from '~~/shared/types/content'

defineProps<{
  about: DistrictCalendar['about']
  heading?: string
}>()
</script>

<template>
  <div id="about-calendar" aria-labelledby="about-calendar-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Source and scope</p>
        <h2 id="about-calendar-heading">{{ heading || 'About this calendar' }}</h2>
      </div>
    </div>
    <div class="about-calendar-grid">
      <div>
        <h3>Data source</h3>
        <p>{{ about.dataSource }}</p>
      </div>
      <div>
        <h3>How dates are handled</h3>
        <p>{{ about.processing }}</p>
      </div>
      <div>
        <h3>Updates</h3>
        <p>{{ about.updates }}</p>
      </div>
      <div>
        <h3>Disclaimer</h3>
        <p>{{ about.disclaimer }}</p>
      </div>
    </div>
    <p class="calendar-method-link">
      <NuxtLink class="text-link" to="/methodology/">Read the full methodology</NuxtLink>
    </p>
  </div>
</template>
