import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dateInCalendarTimeZone, calendarTimeZoneLabel } from '../../shared/utils/calendarDate'
import { buildDistrictCatalog } from '../../shared/utils/districts'

describe('Florida publication data', () => {
  const backlog = readFileSync('docs/fl-school-districts-top1000.md', 'utf8')
  const rows = backlog.split('\n')
    .filter(line => /^\|\s*\d+\s*\|/.test(line))
    .map(line => line.slice(1, -1).split('|').map(cell => cell.trim()))

  it('covers each county district identifier once with unique proposed routes', () => {
    const counties = rows.filter(row => row[4] === 'COUNTY SCHOOL DISTRICT')
    expect(counties).toHaveLength(67)
    expect(counties.map(row => row[3])).toEqual(
      Array.from({ length: 67 }, (_, index) => String(index + 1).padStart(2, '0')),
    )
    expect(new Set(counties.map(row => row[6])).size).toBe(67)
    expect(new Set(rows.map(row => row[8])).size).toBe(rows.length)
    expect(new Set(rows.map(row => row[3])).size).toBe(rows.length)
    expect(rows.find(row => row[3] === '13')?.[6]).toBe('Miami-Dade')
  })

  it('includes verified non-county agencies without counting campuses or operators twice', () => {
    const agencies = rows.filter(row => row[4] !== 'COUNTY SCHOOL DISTRICT')
    expect(agencies.map(row => row[3])).toEqual([
      '68', '71', '72', '73', '74', '75', '80', '81', '82', '83', '84', '85', '86', '87',
    ])
    const djj = agencies.filter(row => row[3] === '83')
    expect(djj).toHaveLength(1)
    expect(djj[0]?.[5]).toContain('Florida Scholars Academy')
    expect(agencies.find(row => row[3] === '71')?.[5]).toBe('Florida Virtual School')
    expect(agencies.find(row => row[3] === '73')?.[6]).toBe('Leon / Broward')
    for (const row of agencies) {
      expect(backlog).toContain(`https://web03.fldoe.org/Schools/schoolreport.asp?id=${row[3]}`)
    }
  })

  it('keeps unpublished and historical records out of the published catalog', () => {
    const records = readdirSync('server/data/districts/records')
      .filter(name => name.endsWith('.json'))
      .map(name => JSON.parse(readFileSync(`server/data/districts/records/${name}`, 'utf8')))
    const catalog = buildDistrictCatalog(records)
    expect(catalog.districts.every(district => !Object.hasOwn(district, 'hubHref'))).toBe(true)
    expect(catalog.districts.flatMap(district => district.calendarPages).filter(page => page.indexable))
      .toHaveLength(records.reduce((count, record) => count + Object.values(record.schoolYears).filter((calendar: any) => calendar.indexable).length, 0))
    const publishedSlugs = new Set(catalog.districts.map(district => district.slug))
    for (const row of rows) {
      if (row[7] === '待建') expect(publishedSlugs.has(row[8]!)).toBe(false)
      if (row[7] === '已建') expect(records.some(record => record.district.slug === row[8])).toBe(true)
    }
    for (const record of records) {
      expect(rows.some(row => row[8] === record.district.slug)).toBe(true)
    }
    expect(buildDistrictCatalog([]).counts.indexableCalendars).toBe(0)
  })

  it('defaults to Eastern Time and preserves Central Time overrides in western Florida', () => {
    const instant = new Date('2026-09-01T04:30:00Z')
    expect(dateInCalendarTimeZone(instant)).toBe('2026-09-01')
    expect(dateInCalendarTimeZone(instant, 'America/Chicago')).toBe('2026-08-31')
    expect(calendarTimeZoneLabel('America/New_York')).toBe('Eastern Time')
    expect(calendarTimeZoneLabel('America/Chicago')).toBe('Central Time')
  })
})
