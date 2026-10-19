import type {
  DistrictCatalog,
  DistrictRecord,
  HomepageFeaturedCalendar,
} from '~~/shared/types/content'

export function useDistrictCatalog() {
  return useAsyncData<DistrictCatalog>(
    'district-catalog',
    () => $fetch('/api/districts.json'),
  )
}

export function useDistrictRecord(slug: MaybeRefOrGetter<string>) {
  const resolvedSlug = toValue(slug)
  return useAsyncData<DistrictRecord>(
    'district-record-' + resolvedSlug,
    () => $fetch('/api/districts/' + resolvedSlug + '.json'),
  )
}

export function useHomepageFeaturedCalendar() {
  return useAsyncData<HomepageFeaturedCalendar | null>(
    'homepage-featured-calendar',
    () => $fetch('/api/homepage-featured.json'),
  )
}
