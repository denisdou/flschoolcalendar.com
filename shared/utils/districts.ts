import type {
  DistrictCatalog,
  DistrictCatalogEntry,
  DistrictRecord,
} from '../types/content'

export interface DistrictGroup {
  name: string
  slug: string
  districts: DistrictCatalogEntry[]
}

const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 } as const

const contentJsonFields = [
  'district',
  'calendarDiscovery',
  'page',
  'schoolYears',
] as const

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function unwrapQueryRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (!isObject(value)) {
    throw new TypeError('District content query did not return an array')
  }

  for (const key of ['results', 'rows', 'data'] as const) {
    const candidate = value[key]
    if (Array.isArray(candidate)) return candidate
  }

  throw new TypeError('District content query result does not contain rows')
}

function parseContentJson(value: unknown, field: string, rowIndex: number): unknown {
  if (typeof value !== 'string') return value

  try {
    return JSON.parse(value)
  }
  catch {
    throw new TypeError(`District content row ${rowIndex} has invalid JSON in ${field}`)
  }
}

export function normalizeDistrictRecords(value: unknown): DistrictRecord[] {
  return unwrapQueryRows(value).map((row, rowIndex) => {
    if (!isObject(row)) {
      throw new TypeError(`District content row ${rowIndex} is not an object`)
    }

    const record = { ...row }
    for (const field of contentJsonFields) {
      record[field] = parseContentJson(record[field], field, rowIndex)
    }

    if (
      !isObject(record.district)
      || !isObject(record.page)
      || !isObject(record.schoolYears)
    ) {
      throw new TypeError(`District content row ${rowIndex} is missing required record fields`)
    }

    return record as unknown as DistrictRecord
  })
}

export function buildDistrictCatalog(records: DistrictRecord[]): DistrictCatalog {
  const districts = records
    .filter(record => Object.values(record.schoolYears).some(calendar => calendar.indexable))
    .sort((a, b) =>
      priorityOrder[a.district.priority] - priorityOrder[b.district.priority]
      || b.district.schoolAgePopulation - a.district.schoolAgePopulation
      || a.district.name.localeCompare(b.district.name),
    )
    .map<DistrictCatalogEntry>((record) => {
      const { priority: _priority, schoolAgePopulation: _population, ...district } = record.district
      return {
        ...district,
        summary: record.page.summary,
        calendarPages: Object.values(record.schoolYears)
          .map(calendar => ({
            schoolYear: calendar.schoolYear,
            routeSlug: calendar.routeSlug || calendar.schoolYear,
            calendarLabel: calendar.calendarLabel || null,
            href: `/${record.district.slug}/${calendar.routeSlug || calendar.schoolYear}/`,
            status: calendar.status,
            indexable: calendar.indexable,
            createdAt: calendar.createdAt,
            verifiedAt: calendar.verifiedAt,
            contentUpdatedAt: calendar.contentUpdatedAt,
            firstDay: calendar.firstDay,
            lastDay: calendar.lastDay,
            lastDayConditional: calendar.lastDayConditional,
            lastDayCondition: calendar.lastDayCondition,
            keyDates: calendar.keyDates || [],
          }))
          .sort((a, b) => b.schoolYear.localeCompare(a.schoolYear)),
      }
    })

  return {
    schemaVersion: '1.0',
    counts: {
      districts: districts.length,
      counties: new Set(districts.map(district => district.countySlug)).size,
      regions: new Set(districts.map(district => district.regionSlug)).size,
      indexableCalendars: districts.reduce(
        (total, district) => total + district.calendarPages.filter(page => page.indexable).length,
        0,
      ),
    },
    districts,
  }
}

export function groupDistricts(
  districts: DistrictCatalogEntry[],
  dimension: 'county' | 'region',
): DistrictGroup[] {
  const groups = new Map<string, DistrictGroup>()
  const nameKey = dimension
  const slugKey = dimension === 'county' ? 'countySlug' : 'regionSlug'

  for (const district of districts) {
    const slug = district[slugKey]
    const existing = groups.get(slug)
    if (existing) {
      existing.districts.push(district)
    }
    else {
      groups.set(slug, {
        name: district[nameKey],
        slug,
        districts: [district],
      })
    }
  }

  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
}
