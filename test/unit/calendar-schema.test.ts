import { describe, expect, it } from 'vitest'
import type { DistrictRecord } from '../../shared/types/content'
import { buildDistrictCalendarSchema } from '../../shared/utils/calendarSchema'

const record: DistrictRecord = {
  schemaVersion: '1.0',
  district: {
    id: '227901',
    districtNumber: '227901',
    timeZone: 'America/Chicago',
    name: 'Austin Independent School District',
    shortName: 'Austin ISD',
    slug: 'austin-isd',
    county: 'Travis County',
    countySlug: 'travis-county',
    region: 'Central Texas',
    regionSlug: 'central-texas',
    districtType: 'Independent school district',
    priority: 'P0',
    schoolAgePopulation: 0,
  },
  calendarDiscovery: {
    officialWebsiteUrl: 'https://www.austinisd.org/',
    calendarPageUrl: 'https://www.austinisd.org/calendar',
    documentsPageUrl: null,
    crawlEnabled: false,
    discoveryStrategy: 'manual',
    linkTextPatterns: [],
    pdfUrlPatterns: [],
    crawlerNotes: null,
    lastCheckedAt: '2026-09-30',
  },
  page: {
    eyebrow: 'Travis County school calendars',
    heading: 'Austin Independent School District',
    summary: 'Austin ISD calendar archive.',
    seo: { title: 'Austin ISD Calendars', description: 'Austin ISD school calendars.' },
    relatedResources: [],
  },
  schoolYears: {
    '2026-2027': {
      schoolYear: '2026-2027',
      status: 'official',
      indexable: true,
      createdAt: '2026-08-25',
      publishedAt: '2026-08-25',
      verifiedAt: '2026-09-09',
      contentUpdatedAt: '2026-08-30',
      lastOfficialRevisionAt: null,
      firstDay: '2026-08-17',
      lastDay: '2027-05-27',
      seo: { title: 'Austin ISD Calendar 2026–2027', description: 'Austin ISD school dates and official calendar sources.' },
      hero: { heading: 'Austin ISD Calendar', mobileDescription: 'Calendar summary.', desktopDescription: 'Calendar summary.' },
      editorialSummary: { heading: 'What families should know', paragraphs: [], highlights: [] },
      keyDates: [],
      actions: { staticIcsUrl: null, googleCalendarUrl: null, appleCalendarUrl: null, officialPdfUrl: null, officialCalendarUrl: null },
      highlights: [],
      statistics: [],
      comparativeInsights: [],
      events: [],
      breaks: [],
      noSchoolDayEventIds: [],
      nearbyComparison: null,
      revisions: [],
      about: { dataSource: '', processing: '', updates: '', disclaimer: '' },
      faqs: [],
      sources: [],
      relatedResources: [],
    },
  },
}

describe('district calendar schema dates', () => {
  it('uses the content update date instead of the source verification date', () => {
    const calendar = structuredClone(record.schoolYears['2026-2027'])

    calendar.createdAt = '2026-08-25'
    calendar.publishedAt = '2024-09-25'
    calendar.contentUpdatedAt = '2026-08-30'
    calendar.verifiedAt = '2026-09-09'

    const schema = buildDistrictCalendarSchema({
      siteUrl: 'https://www.flschoolcalendar.com',
      path: '/austin-isd/2026-2027/',
      district: record.district,
      calendar,
      discovery: record.calendarDiscovery,
    }) as { '@graph': Array<Record<string, unknown>> }
    const webPage = schema['@graph'].find(node => node['@type'] === 'WebPage')
    const dataset = schema['@graph'].find(node => node['@type'] === 'Dataset')

    expect(webPage?.dateModified).toBe('2026-08-30')
    expect(dataset?.dateModified).toBe('2026-08-30')
    expect(webPage?.dateCreated).toBe('2026-08-25')
    expect(webPage?.datePublished).toBe('2026-08-25')
    expect(dataset?.dateCreated).toBe('2026-08-25')
    expect(dataset?.datePublished).toBe('2026-08-25')
  })
})
