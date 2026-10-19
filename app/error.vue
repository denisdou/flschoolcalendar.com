<script setup lang="ts">
defineProps<{
  error: {
    statusCode?: number
    statusMessage?: string
    message?: string
  }
}>()

</script>

<template>
  <NuxtLayout name="default">
    <ErrorPageSection
      :status-code="error.statusCode || 500"
      :message="error.statusMessage || error.message || 'The requested page could not be loaded.'"
    />
  </NuxtLayout>
</template>
