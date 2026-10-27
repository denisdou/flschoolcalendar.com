import type { H3Event } from 'h3'
import { queryCollection } from '@nuxt/content/server'
import type {
  DistrictCatalog,
  DistrictRecord,
  HomepageFeaturedCalendar,
} from '../../shared/types/content'
import { HOMEPAGE_FEATURED_DISTRICT_SLUG } from '../../shared/config/site'
import {
  buildDistrictCatalog,
  normalizeDistrictRecords,
} from '../../shared/utils/districts'
import { resolveCurrentSchoolYear } from '../../shared/utils/content'

export async function getDistrictCatalog(event: H3Event): Promise<DistrictCatalog> {
  const result: unknown = await queryCollection(event, 'districtRecords').all()
  return buildDistrictCatalog(normalizeDistrictRecords(result))
}

export async function getDistrictRecord(
  event: H3Event,
  slug: string,
): Promise<DistrictRecord | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return null
  }

  const result: unknown = await queryCollection(event, 'districtRecords')
    .where('stem', '=', slug)
    .all()
  return normalizeDistrictRecords(result)[0] || null
}

export async function getHomepageFeaturedCalendar(
  event: H3Event,
): Promise<HomepageFeaturedCalendar | null> {
  const catalog = await getDistrictCatalog(event)
  const schoolYear = resolveCurrentSchoolYear()
  const featuredDistrict = catalog.districts.find(district =>
    district.slug === HOMEPAGE_FEATURED_DISTRICT_SLUG
    && district.calendarPages.some(page => page.indexable && page.schoolYear === schoolYear),
  )
  if (!featuredDistrict) return null

  const featuredPage = featuredDistrict.calendarPages.find(page =>
    page.indexable && page.schoolYear === schoolYear,
  )
  if (!featuredPage) return null

  const record = await getDistrictRecord(event, featuredDistrict.slug)
  if (!record) return null

  const calendar = record.schoolYears[featuredPage.routeSlug]
  if (!calendar?.indexable) return null

  const { name, shortName, slug, county, region } = record.district
  return {
    district: { name, shortName, slug, county, region },
    summary: record.page.summary,
    calendar: {
      schoolYear: calendar.schoolYear,
      routeSlug: calendar.routeSlug,
      calendarLabel: calendar.calendarLabel,
      status: calendar.status,
      verifiedAt: calendar.verifiedAt,
      contentUpdatedAt: calendar.contentUpdatedAt,
      firstDay: calendar.firstDay,
      lastDay: calendar.lastDay,
      keyDates: calendar.keyDates,
      actions: calendar.actions,
    },
  }
}
