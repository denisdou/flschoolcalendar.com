import type { DistrictCalendar, DistrictIdentity } from '../types/content'

type PdfCalendar = Pick<DistrictCalendar, 'schoolYear' | 'routeSlug' | 'contentUpdatedAt'>

export function calendarPdfFilename(district: Pick<DistrictIdentity, 'slug'>, calendar: Pick<PdfCalendar, 'schoolYear' | 'routeSlug'>): string {
  const route = calendar.routeSlug || calendar.schoolYear
  if (!/^[a-z0-9][a-z0-9-]*$/.test(district.slug) || !/^[a-z0-9][a-z0-9-]*$/.test(route)) {
    throw new Error('Invalid calendar PDF filename')
  }
  return `${district.slug}-school-calendar-${route}.pdf`
}

export function calendarPdfDownloadUrl(district: Pick<DistrictIdentity, 'slug'>, calendar: PdfCalendar): string {
  const path = '/pdf/' + calendarPdfFilename(district, calendar)
  return calendar.contentUpdatedAt ? path + '?v=' + encodeURIComponent(calendar.contentUpdatedAt) : path
}
