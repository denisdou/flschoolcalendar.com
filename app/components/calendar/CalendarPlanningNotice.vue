<script setup lang="ts">
defineProps<{
  disclaimer: string
}>()
</script>

<template>
  <div class="calendar-planning-notice">
    <h3>Before you plan</h3>
    <p>{{ disclaimer }}</p>
  </div>
</template>
