import { defineCollection, defineContentConfig, z } from '@nuxt/content'
import { fileURLToPath } from 'node:url'

const districtRecordsRoot = fileURLToPath(
  new URL('./server/data/districts/records/', import.meta.url),
)

const districtIdentity = z.object({
  id: z.string(),
  districtNumber: z.string().nullable(),
  timeZone: z.string(),
  name: z.string(),
  shortName: z.string(),
  slug: z.string(),
  county: z.string(),
  countySlug: z.string(),
  region: z.string(),
  regionSlug: z.string(),
  districtType: z.string(),
  priority: z.enum(['P0', 'P1', 'P2', 'P3']),
  schoolAgePopulation: z.number(),
})

const calendarDiscovery = z.object({
  officialWebsiteUrl: z.string().nullable(),
  calendarPageUrl: z.string().nullable(),
  documentsPageUrl: z.string().nullable(),
  crawlEnabled: z.boolean(),
  discoveryStrategy: z.enum(['manual', 'html-links', 'sitemap', 'custom']),
  linkTextPatterns: z.array(z.string()),
  pdfUrlPatterns: z.array(z.string()),
  crawlerNotes: z.string().nullable(),
  lastCheckedAt: z.string().nullable(),
})

const linkItem = z.object({
  label: z.string(),
  href: z.string(),
  description: z.string().nullable().optional(),
  external: z.boolean().optional(),
})

export default defineContentConfig({
  collections: {
    districtRecords: defineCollection({
      type: 'data',
      source: {
        cwd: districtRecordsRoot,
        include: '*.json',
      },
      schema: z.object({
        schemaVersion: z.string(),
        district: districtIdentity,
        calendarDiscovery,
        page: z.object({
          eyebrow: z.string(),
          heading: z.string(),
          summary: z.string(),
          seo: z.object({ title: z.string(), description: z.string() }),
          faqs: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
          relatedResources: z.array(linkItem),
        }),
        schoolYears: z.record(z.string(), z.any()),
      }),
    }),
  },
})
