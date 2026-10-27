<script setup lang="ts">
defineProps<{
  hasFaq: boolean
  hasRelatedCalendars: boolean
  hasBellTimes?: boolean
}>()
</script>

<template>
  <nav class="calendar-section-nav" aria-label="On this page">
    <span class="calendar-section-nav-label">On this page</span>
    <ul>
      <li><a href="#key-dates-table">Key dates</a></li>
      <li><a href="#monthly-calendar">Monthly calendar</a></li>
      <li><a href="#calendar-notes">About</a></li>
      <li v-if="hasBellTimes"><a href="#bell-times">Bell times</a></li>
      <li v-if="hasFaq"><a href="#faq">FAQs</a></li>
      <li v-if="hasRelatedCalendars"><a href="#related-calendars">Related calendars</a></li>
      <li><a href="#official-sources">Official sources</a></li>
    </ul>
  </nav>
</template>
