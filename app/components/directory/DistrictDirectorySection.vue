<script setup lang="ts">
import type { DistrictCatalogEntry } from '~~/shared/types/content'

defineProps<{ districts: DistrictCatalogEntry[] }>()
</script>

<template>
  <section class="page-section page-section--tight">
    <div class="site-container">
      <DistrictDirectory :districts="districts" />
    </div>
  </section>
</template>
