<script setup lang="ts">
import { buildDistrictHubSchema } from '~~/shared/utils/calendarSchema'

definePageMeta({ layout: 'default' })

const route = useRoute()
const { data: record } = await useDistrictRecord(String(route.params.district))

// Hubs are opt-in. Do not publish empty pages for other districts or missing years.
if (!record.value?.page.faqs?.length || !Object.values(record.value.schoolYears).some(calendar => calendar.indexable)) {
  throw createError({ statusCode: 404, statusMessage: 'District calendar hub not found' })
}

useSiteSeo({
  title: record.value.page.seo.title,
  description: record.value.page.seo.description,
  path: `/${record.value.district.slug}/`,
  appendSiteName: false,
  schema: buildDistrictHubSchema(record.value, useRuntimeConfig().public.siteUrl),
})
</script>

<template>
  <DistrictCalendarHub v-if="record" :record="record" />
</template>
