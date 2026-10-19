import type { DistrictCalendar, DistrictCatalogEntry } from '../types/content'
import { dateInCalendarTimeZone } from './calendarDate'

const genericDistrictWords = new Set([
  'central',
  'city',
  'district',
  'free',
  'public',
  'school',
  'schools',
  'union',
])

function districtSearchTokens(value: string): string[] {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .match(/[a-z0-9]+/g) || []
}

function districtInitialisms(value: string): string[] {
  const tokens = districtSearchTokens(value)
  const allWords = tokens.map(token => token[0]).join('')
  const identifyingWords = tokens
    .filter(token => !genericDistrictWords.has(token))
    .map(token => token[0])
    .join('')

  return [...new Set([allWords, identifyingWords].filter(Boolean))]
}

export function districtMatchesSearch(
  district: Pick<DistrictCatalogEntry, 'name' | 'shortName' | 'slug' | 'county' | 'region'>,
  rawTerm: string,
): boolean {
  const termTokens = districtSearchTokens(rawTerm)
  if (!termTokens.length) return true

  const phraseTerm = termTokens.join(' ')
  const compactTerm = termTokens.join('')
  const searchableValues = [
    district.name,
    district.shortName,
    district.slug,
    district.county,
    district.region,
  ]

  const matchesText = searchableValues.some((value) => {
    const tokens = districtSearchTokens(value)
    const matchesCompactedWords = termTokens.length === 1
      && tokens.some((_, index) => tokens.slice(index).join('').startsWith(compactTerm))

    return tokens.join(' ').includes(phraseTerm)
      || matchesCompactedWords
  })
  if (matchesText) return true

  return [district.name, district.shortName]
    .flatMap(districtInitialisms)
    .some(initialism => initialism.includes(compactTerm))
}

export function formatDistrictSearchName(
  district: Pick<DistrictCatalogEntry, 'name' | 'shortName'>,
): string {
  const name = district.name.trim()
  const shortName = district.shortName?.trim()
  if (!shortName || name.toLowerCase().includes(shortName.toLowerCase())) return name
  return `${name} (${shortName})`
}

export function withTrailingSlash(path: string): string {
  const suffixIndex = path.search(/[?#]/)
  if (suffixIndex !== -1) {
    return withTrailingSlash(path.slice(0, suffixIndex)) + path.slice(suffixIndex)
  }

  if (path === '/' || path.endsWith('/') || path.includes('.')) {
    return path
  }

  return path + '/'
}

export function absoluteUrl(siteUrl: string, path: string): string {
  return siteUrl.replace(/\/$/, '') + withTrailingSlash(path)
}

export function appleCalendarSubscriptionUrl(
  siteUrl: string,
  icsPath: string,
): string {
  return absoluteUrl(siteUrl, icsPath).replace(/^https?:\/\//, 'webcal://')
}

export function googleCalendarSubscriptionUrl(
  siteUrl: string,
  icsPath: string,
): string {
  const subscriptionUrl = appleCalendarSubscriptionUrl(siteUrl, icsPath)
  return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(subscriptionUrl)}`
}

export function formatSchoolYear(value: string): string {
  return value.replace('-', '–')
}

export function formatLongDate(
  value: string,
  locale = 'en-US',
): string {
  return normalizeIntlSpacing(new Intl.DateTimeFormat(locale, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value + 'T00:00:00Z')))
}

export function calendarRouteSlug(
  calendar: Pick<DistrictCalendar, 'schoolYear' | 'routeSlug'>,
): string {
  return calendar.routeSlug || calendar.schoolYear
}

export function formatCalendarLabel(
  calendar: Pick<DistrictCalendar, 'schoolYear' | 'calendarLabel'>,
): string {
  const year = formatSchoolYear(calendar.schoolYear)
  return calendar.calendarLabel ? `${year} ${calendar.calendarLabel}` : year
}

export function resolveCurrentSchoolYear(
  date = new Date(),
): string {
  const centralDate = dateInCalendarTimeZone(date)
  const calendarYear = Number(centralDate.slice(0, 4))
  const startYear = centralDate.slice(5, 7) >= '07' ? calendarYear : calendarYear - 1
  return `${startYear}-${startYear + 1}`
}

export function searchCurrentYearDistricts(
  districts: DistrictCatalogEntry[],
  term: string,
  schoolYear: string,
  limit = 6,
): DistrictCatalogEntry[] {
  const normalizedTerm = term.trim()
  if (normalizedTerm.length < 2) return []

  return districts
    .filter(district =>
      district.calendarPages.some(page => page.indexable && page.schoolYear === schoolYear)
      && districtMatchesSearch(district, normalizedTerm),
    )
    .slice(0, limit)
}

function normalizeIntlSpacing(value: string): string {
  return value.replace(/[\u00A0\u2007\u2009\u202F]/g, ' ')
}

export function formatDateRange(
  start: string | null,
  end: string | null,
  locale = 'en-US',
): string {
  if (!start) {
    return 'Not published'
  }

  const formatter = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const startDate = new Date(start + 'T00:00:00Z')
  if (!end || end === start) {
    return normalizeIntlSpacing(formatter.format(startDate))
  }

  return normalizeIntlSpacing(
    formatter.formatRange(startDate, new Date(end + 'T00:00:00Z')),
  )
}

export function calendarRoute(districtSlug: string, schoolYear: string): string {
  return '/' + districtSlug + '/' + schoolYear + '/'
}

export function districtCalendarHref(
  district: DistrictCatalogEntry,
  preferredSchoolYear?: string,
): string {
  const preferred = preferredSchoolYear
    ? district.calendarPages.find(page => page.indexable && page.schoolYear === preferredSchoolYear)
    : null
  const latest = district.calendarPages.find(page => page.indexable)
  return preferred?.href || latest?.href || '/#districts'
}

export function selectDistrictDiscoveryLists(
  districts: DistrictCatalogEntry[],
  current: Pick<DistrictCatalogEntry, 'slug' | 'countySlug' | 'regionSlug'>,
  schoolYear: string,
): {
  related: DistrictCatalogEntry[]
  nearby: DistrictCatalogEntry[]
} {
  const eligible = districts.filter(district =>
    district.slug !== current.slug
    && district.calendarPages.some(page =>
      page.indexable && page.schoolYear === schoolYear,
    ),
  )
  const nearbyCandidates = eligible
    .filter(district =>
      district.countySlug === current.countySlug
      || district.regionSlug === current.regionSlug,
    )
    .sort((a, b) => {
      const aCounty = a.countySlug === current.countySlug ? 0 : 1
      const bCounty = b.countySlug === current.countySlug ? 0 : 1
      return aCounty - bCounty || a.name.localeCompare(b.name)
  })
  const nearbySlugs = new Set(nearbyCandidates.map(district => district.slug))
  const otherCandidates = eligible.filter(district => !nearbySlugs.has(district.slug))

  return {
    related: otherCandidates.slice(0, 6),
    nearby: nearbyCandidates.slice(0, 6),
  }
}
