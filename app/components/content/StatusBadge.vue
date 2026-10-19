<script setup lang="ts">
const props = defineProps<{
  status: 'official' | 'revised' | 'historical' | 'draft'
}>()

const labels = {
  official: 'Official source verified',
  revised: 'Revised source verified',
  historical: 'Historical calendar',
  draft: 'Source collection pending',
}

const label = computed(() => labels[props.status])
</script>

<template>
  <span class="badge" :class="'badge--' + status">{{ label }}</span>
</template>
