import { describe, expect, it } from 'vitest'
import type { DistrictCatalogEntry } from '../types/content'
import {
  absoluteUrl,
  districtCalendarHref,
  resolveCurrentSchoolYear,
  searchCurrentYearDistricts,
  withTrailingSlash,
} from './content'

function district(name: string, years: string[]): DistrictCatalogEntry {
  const slug = name.toLowerCase().replaceAll(' ', '-')
  return {
    id: slug,
    districtNumber: null,
    timeZone: 'America/Chicago',
    name,
    shortName: name.split(' ')[0] || name,
    slug,
    county: 'Travis County',
    countySlug: 'travis-county',
    region: 'Central Texas',
    regionSlug: 'central-texas',
    districtType: 'Independent school district',
    summary: '',
    calendarPages: years.map(schoolYear => ({
      schoolYear,
      routeSlug: schoolYear,
      calendarLabel: null,
      href: `/${slug}/${schoolYear}/`,
      status: 'official',
      indexable: true,
      createdAt: null,
      verifiedAt: null,
      contentUpdatedAt: null,
      firstDay: null,
      lastDay: null,
      keyDates: [],
    })),
  }
}

describe('current-year district search', () => {
  it('uses the Eastern Time date at the July school-year boundary', () => {
    expect(resolveCurrentSchoolYear(new Date('2027-07-01T03:59:00Z'))).toBe('2026-2027')
    expect(resolveCurrentSchoolYear(new Date('2027-07-01T04:00:00Z'))).toBe('2027-2028')
  })

  it('selects the current-year page when future pages are listed first', () => {
    const currentAndFuture = district('Austin ISD', ['2027-2028', '2026-2027'])
    const futureOnly = district('Round Rock ISD', ['2027-2028'])
    const results = searchCurrentYearDistricts(
      [currentAndFuture, futureOnly],
      'Austin',
      '2026-2027',
    )

    expect(results.map(item => item.name)).toEqual(['Austin ISD'])
    expect(districtCalendarHref(results[0]!, '2026-2027')).toBe('/austin-isd/2026-2027/')
  })
})

describe('canonical URL path formatting', () => {
  it('adds the slash to the path, not the query or fragment', () => {
    expect(absoluteUrl('https://flschoolcalendar.com', '/compare/?left=prosper-isd&right=dallas-isd'))
      .toBe('https://flschoolcalendar.com/compare/?left=prosper-isd&right=dallas-isd')
    expect(withTrailingSlash('/compare?left=prosper-isd&right=dallas-isd#results'))
      .toBe('/compare/?left=prosper-isd&right=dallas-isd#results')
    expect(withTrailingSlash('/compare?utm_source=example.com')).toBe('/compare/?utm_source=example.com')
  })

  it('preserves root and static-file URLs', () => {
    expect(withTrailingSlash('/?left=prosper-isd')).toBe('/?left=prosper-isd')
    expect(withTrailingSlash('/sitemap.xml?version=1')).toBe('/sitemap.xml?version=1')
    expect(absoluteUrl('https://flschoolcalendar.com/', '/compare/')).toBe('https://flschoolcalendar.com/compare/')
  })
})
