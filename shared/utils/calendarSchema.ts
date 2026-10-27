import type {
  CalendarDiscovery,
  DistrictCalendar,
  DistrictIdentity,
  DistrictRecord,
} from '../types/content'
import { absoluteUrl, calendarRouteSlug, formatCalendarLabel, formatSchoolYear } from './content'
import { selectCalendarFaqs } from './calendarFaqSelection'
import { calendarPdfDownloadUrl } from './calendarPdf'

type JsonLdNode = Record<string, unknown>

interface DistrictCalendarSchemaOptions {
  siteUrl: string
  path: string
  district: DistrictIdentity
  calendar: DistrictCalendar
  discovery: CalendarDiscovery
  includeFaq?: boolean
}

function compactNode(node: JsonLdNode): JsonLdNode {
  return Object.fromEntries(
    Object.entries(node).filter(([, value]) =>
      value !== null
      && value !== undefined
      && value !== ''
      && (!Array.isArray(value) || value.length > 0),
    ),
  )
}

export function buildDistrictHubSchema(record: DistrictRecord, siteUrl: string): JsonLdNode {
  const canonical = absoluteUrl(siteUrl, `/${record.district.slug}/`)
  const calendars = Object.values(record.schoolYears)
    .filter(calendar => calendar.indexable)
    .sort((a, b) => a.schoolYear.localeCompare(b.schoolYear))
  const faqs = record.page.faqs || []
  const graph: JsonLdNode[] = [
    compactNode({
      '@type': 'CollectionPage',
      '@id': canonical + '#webpage',
      url: canonical,
      name: record.page.seo.title,
      description: record.page.seo.description,
      mainEntity: { '@id': canonical + '#calendars' },
      hasPart: faqs.length ? [{ '@id': canonical + '#faq' }] : [],
      isBasedOn: record.calendarDiscovery.calendarPageUrl,
    }),
    {
      '@type': 'ItemList',
      '@id': canonical + '#calendars',
      itemListElement: calendars.map((calendar, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: record.district.shortName + ' ' + formatCalendarLabel(calendar),
        url: absoluteUrl(siteUrl, `/${record.district.slug}/${calendarRouteSlug(calendar)}/`),
      })),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: absoluteUrl(siteUrl, '/') },
        { '@type': 'ListItem', position: 2, name: record.page.heading, item: canonical },
      ],
    },
  ]
  if (faqs.length) graph.push({
    '@type': 'FAQPage',
    '@id': canonical + '#faq',
    mainEntity: faqs.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  })
  return { '@context': 'https://schema.org', '@graph': graph }
}

export function buildDistrictCalendarSchema({
  siteUrl,
  path,
  district,
  calendar,
  discovery,
  includeFaq = true,
}: DistrictCalendarSchemaOptions): JsonLdNode {
  const canonical = absoluteUrl(siteUrl, path)
  const siteRoot = absoluteUrl(siteUrl, '/')
  const termsUrl = absoluteUrl(siteUrl, '/terms/')
  const pageId = canonical + '#webpage'
  const datasetId = canonical + '#dataset'
  const faqId = canonical + '#faq'
  const faqs = includeFaq ? selectCalendarFaqs(calendar.faqs) : []
  const sourceUrls = [...new Set(calendar.sources.map(source => source.url))]
  const latestRevision = calendar.revisions.reduce(
    (latest, revision) => Math.max(latest, revision.version),
    0,
  )
  const distribution = calendar.actions.staticIcsUrl
    ? [
        {
          '@type': 'DataDownload',
          name: district.shortName + ' ' + formatCalendarLabel(calendar) + ' calendar (ICS)',
          contentUrl: absoluteUrl(siteUrl, calendar.actions.staticIcsUrl),
          encodingFormat: 'text/calendar',
        },
      ]
    : []

  distribution.unshift({
    '@type': 'DataDownload',
    name: district.shortName + ' ' + formatCalendarLabel(calendar) + ' printable calendar (PDF)',
    contentUrl: absoluteUrl(siteUrl, calendarPdfDownloadUrl(district, calendar)),
    encodingFormat: 'application/pdf',
  })

  const faqPage = compactNode({
    '@type': 'FAQPage',
    '@id': faqId,
    mainEntity: faqs.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  })

  const dataset = compactNode({
    '@type': 'Dataset',
    '@id': datasetId,
    name: district.name + ' ' + formatCalendarLabel(calendar) + ' school calendar dataset',
    description: calendar.seo.description,
    url: canonical,
    dateCreated: calendar.createdAt,
    datePublished: calendar.createdAt,
    dateModified: calendar.contentUpdatedAt,
    version: latestRevision > 0 ? String(latestRevision) : undefined,
    temporalCoverage: calendar.firstDay && calendar.lastDay
      ? calendar.firstDay + '/' + calendar.lastDay
      : undefined,
    spatialCoverage: district.county + ', Florida, United States',
    about: compactNode({
      '@type': 'EducationalOrganization',
      name: district.name,
      url: discovery.officialWebsiteUrl,
    }),
    creator: {
      '@type': 'Organization',
      '@id': siteRoot + '#organization',
      name: 'FL School Calendar',
      url: siteRoot,
    },
    license: {
      '@type': 'CreativeWork',
      name: 'FL School Calendar Terms of Use',
      url: termsUrl,
    },
    isBasedOn: sourceUrls,
    isAccessibleForFree: true,
    keywords: [
      district.shortName + ' school calendar',
      calendar.schoolYear + ' school calendar',
      'school holidays',
      'school breaks',
    ],
    variableMeasured: [
      'Calendar event name',
      'Start date',
      'End date',
      'Student attendance status',
    ],
    measurementTechnique: calendar.about.processing,
    distribution,
  })

  const webPage = compactNode({
    '@type': 'WebPage',
    '@id': pageId,
    url: canonical,
    name: calendar.seo.title,
    description: calendar.seo.description,
    dateCreated: calendar.createdAt,
    datePublished: calendar.createdAt,
    dateModified: calendar.contentUpdatedAt,
    mainEntity: { '@id': datasetId },
    hasPart: faqs.length ? [{ '@id': faqId }] : [],
  })

  const graph: JsonLdNode[] = [
    webPage,
    {
      '@type': 'BreadcrumbList',
      '@id': canonical + '#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: siteRoot },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Districts',
          item: siteRoot + '#districts',
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: district.name + ' ' + formatCalendarLabel(calendar),
          item: canonical,
        },
      ],
    },
    dataset,
  ]

  if (faqs.length) {
    graph.push(faqPage)
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  }
}
