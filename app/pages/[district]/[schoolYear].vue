<script setup lang="ts">
import { buildDistrictCalendarSchema } from '~~/shared/utils/calendarSchema'
import { calendarRouteSlug, selectDistrictDiscoveryLists } from '~~/shared/utils/content'

definePageMeta({ layout: 'default' })

const route = useRoute()
const slug = String(route.params.district)
const schoolYear = String(route.params.schoolYear)
const { data: record } = await useDistrictRecord(slug)
const { data: catalog } = await useDistrictCatalog()

if (!record.value) {
  throw createError({ statusCode: 404, statusMessage: 'District not found' })
}

const calendar = computed(() =>
  record.value?.schoolYears[schoolYear]
  || Object.values(record.value?.schoolYears || {}).find(item =>
    calendarRouteSlug(item) === schoolYear,
  )
  || null,
)
const calendars = computed(() => Object.values(record.value?.schoolYears || {}))
const districtDiscoveryLists = computed(() => {
  const current = record.value?.district
  if (!current) return { related: [], nearby: [] }

  return selectDistrictDiscoveryLists(
    catalog.value?.districts || [],
    current,
    schoolYear,
  )
})
const otherDistricts = computed(() => districtDiscoveryLists.value.related)
const nearbyDistricts = computed(() => districtDiscoveryLists.value.nearby)
const currentCalendarPath = computed(() =>
  `/${record.value!.district.slug}/${calendarRouteSlug(calendar.value!)}/`,
)
function normalizedInternalPath(href: string): string {
  const path = href.split(/[?#]/, 1)[0] || '/'
  return path === '/' ? path : `/${path.replace(/^\/+|\/+$/g, '')}/`
}
const relatedResources = computed(() => [
  ...new Map(
    [...record.value!.page.relatedResources, ...calendar.value!.relatedResources]
      .filter(link => link.external || normalizedInternalPath(link.href) !== currentCalendarPath.value)
      .map(link => [link.href, link]),
  ).values(),
])
if (!calendar.value || !calendar.value.indexable) {
  useResponseHeader('X-Robots-Tag').value = 'noindex, nofollow'
  throw createError({ statusCode: 404, statusMessage: 'Calendar year not found' })
}

useSiteSeo({
  title: calendar.value.seo.title,
  description: calendar.value.seo.description,
  path: '/' + record.value.district.slug + '/' + schoolYear + '/',
  robots: 'index,follow',
  appendSiteName: false,
  schema: buildDistrictCalendarSchema({
    siteUrl: useRuntimeConfig().public.siteUrl,
    path: '/' + record.value.district.slug + '/' + schoolYear + '/',
    district: record.value.district,
    calendar: calendar.value,
    discovery: record.value.calendarDiscovery,
    includeFaq: false,
  }),
})
</script>

<template>
  <DistrictCalendarPage
    v-if="record && calendar"
    :district="record.district"
    :official-website="record.calendarDiscovery.officialWebsiteUrl"
    :calendar="calendar"
    :calendars="calendars"
    :related-resources="relatedResources"
    :other-districts="otherDistricts"
    :nearby-districts="nearbyDistricts"
  />
</template>
