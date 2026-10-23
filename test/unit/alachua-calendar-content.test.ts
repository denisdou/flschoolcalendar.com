import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/alachua-county-school-district.json'
import { buildDistrictCatalog } from '../../shared/utils/districts'
// @ts-ignore Dependency-free publication checker.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord
const calendar = record.schoolYears['2026-2027']!
const events = calendar.events
const byId = new Map(events.map(event => [event.id, event]))

function weekdays(start: string, end: string) {
  const result: string[] = []
  for (const cursor = new Date(start + 'T00:00:00Z'); cursor <= new Date(end + 'T00:00:00Z'); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (![0, 6].includes(cursor.getUTCDay())) result.push(cursor.toISOString().slice(0, 10))
  }
  return result
}

function closureDates(ids: string[]) {
  return new Set(ids.flatMap(id => {
    const event = byId.get(id)!
    return weekdays(event.dateStart!, event.dateEnd || event.dateStart!)
  }))
}

describe('Alachua County 2026-2027 source boundaries', () => {
  it('publishes the verified student year with its original official source', () => {
    expect(record.district).toMatchObject({ districtNumber: '01', name: 'Alachua County Public Schools', timeZone: 'America/New_York' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027'])
    expect(calendar).toMatchObject({ firstDay: '2026-08-10', lastDay: '2027-05-28', sourceDocumentUpdatedAt: '2026-01-27', approvedAt: null })
    expect(calendar.sources[0]).toMatchObject({
      url: 'https://aptg.co/p2VftP',
      contentHash: 'sha256:af72602f22adad8d5dea0adeca04aa967d77dfe440594eae2b3d2a8d98a20cf9',
    })
    expect(buildDistrictCatalog([record]).counts).toMatchObject({ districts: 1, indexableCalendars: 1 })
    expect(auditRecords([{ filename: record.district.slug + '.json', record }])).toEqual([])
  })

  it('omits staff-only planning and the holiday after the last student day', () => {
    expect(events).toHaveLength(27)
    expect(events.every(event => event.dateStart! >= calendar.firstDay! && (event.dateEnd || event.dateStart)! <= calendar.lastDay!)).toBe(true)
    expect(events.some(event => /pre-planning|post-planning|memorial/i.test(event.name))).toBe(false)
    expect(events.filter(event => event.eventType === 'PROGRESS_REPORT').map(event => event.dateStart)).toEqual(['2026-09-15', '2026-11-19', '2027-02-18', '2027-05-04'])
    expect(events.filter(event => event.eventType === 'REPORT_CARD').map(event => event.dateStart)).toEqual(['2026-10-22', '2027-01-21', '2027-04-06'])
  })

  it('uses the later school confirmation while retaining the differing Homecoming PDF labels', () => {
    const event = byId.get('acps-2026-2027-uf-homecoming')!
    expect(event).toMatchObject({
      dateStart: '2026-10-09',
      name: 'UF Homecoming Holiday',
      officialLabel: 'Holiday - UF Homecoming',
      schoolStatus: 'no-classes',
      sourceId: 'acps-2026-2027-10-month-calendar',
      nameSourceId: 'acps-2026-2027-10-month-calendar',
      noteBasis: 'derived',
    })
    expect(event.noteSourceIds).toEqual(['acps-2026-2027-indexed-tentative-calendar', 'acps-2026-2027-uf-homecoming-confirmation'])
    const alternate = calendar.sources.find(source => source.id === event.noteSourceIds![0])!
    expect(alternate.url).toContain('/c3763616-ad08-4a86-946b-ddbdf8193884/')
    expect(alternate.contentHash).toBeUndefined()
    expect(calendar.sources.find(source => source.id === event.noteSourceIds![1])).toMatchObject({
      url: 'https://www.alachuaschools.net/o/newberry-high/article/3150112',
      publishedAt: '2026-10-05',
      retrievedAt: '2026-10-20',
    })
    const discrepancy = calendar.sourceDiscrepancies?.find(item => item.field === 'homecomingTentativeLabel')!
    expect(discrepancy.resolution).toBe('unresolved')
    expect(discrepancy.sourceIds).toContain(event.noteSourceIds![1])
    expect(discrepancy.effect).toContain('revision order remains unknown')
    expect(calendar.about.processing).not.toContain('display name and note retain that qualifier')
    expect(calendar.confirmedNoSchoolDayEventIds).toContain(event.id)
    expect(calendar.conditionalNoSchoolDayEventIds).not.toContain(event.id)
    expect(event.mayBecomeAttendanceDay).toBeUndefined()
  })

  it('joins Thanksgiving only in the planning summary and covers every weekday', () => {
    const thanksgiving = calendar.breaks[0]!
    expect(thanksgiving).toMatchObject({ dateStart: '2026-11-23', dateEnd: '2026-11-27', basis: 'derived', schoolWeekdaysOff: 5, nextStudentAttendanceDate: '2026-11-30' })
    expect(thanksgiving.componentEventIds!.map(id => byId.get(id))).toMatchObject([
      { dateStart: '2026-11-23', dateEnd: '2026-11-24', name: 'Student/Teacher Holiday' },
      { dateStart: '2026-11-25', dateEnd: '2026-11-27', name: 'Thanksgiving Holiday' },
    ])
    expect([...closureDates(thanksgiving.componentEventIds!)]).toEqual(weekdays(thanksgiving.dateStart, thanksgiving.dateEnd))
    expect(events.some(event => event.dateStart === '2026-11-23' && event.dateEnd === '2026-11-27')).toBe(false)
  })

  it('does not extend winter or spring holidays across conditional or school days', () => {
    const winter = calendar.breaks.find(span => span.name === 'Winter holiday')!
    const spring = calendar.breaks.find(span => span.name === 'Spring holiday')!
    expect(winter).toMatchObject({ dateStart: '2026-12-21', dateEnd: '2027-01-01', schoolWeekdaysOff: 10, nextStudentAttendanceDate: null })
    expect(spring).toMatchObject({ dateStart: '2027-03-15', dateEnd: '2027-03-19', nextStudentAttendanceDate: '2027-03-22', schoolWeekdaysOff: 5 })
    for (const span of calendar.breaks) {
      expect([...closureDates(span.componentEventIds!)]).toEqual(weekdays(span.dateStart, span.dateEnd))
    }
    expect(byId.get('acps-2026-2027-quarter-3-end')?.dateStart).toBe('2027-03-26')
    expect(byId.get('acps-2026-2027-march-teacher-workday')?.dateStart).toBe('2027-03-29')
  })

  it('separates two possible make-up dates from 28 confirmed closed weekdays', () => {
    const conditional = calendar.conditionalNoSchoolDayEventIds!.map(id => byId.get(id)!)
    expect(conditional.map(event => event.dateStart)).toEqual(['2026-12-18', '2027-01-04'])
    for (const event of conditional) {
      expect(event).toMatchObject({ schoolStatus: 'no-classes', scheduledAsNoSchool: true, mayBecomeAttendanceDay: true, countsAsStudentAttendanceDayUnderPublishedSchedule: false })
      expect(event).not.toHaveProperty('countsAsStudentAttendanceDay')
      expect(calendar.confirmedNoSchoolDayEventIds).not.toContain(event.id)
    }
    const closed = closureDates(calendar.confirmedNoSchoolDayEventIds!)
    expect(closed.size).toBe(28)
    expect(weekdays(calendar.firstDay!, calendar.lastDay!).length - closed.size - conditional.length).toBe(180)
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
    expect(calendar.statistics.find(stat => stat.id === 'student-attendance-days')).toMatchObject({ value: '180 days', basis: 'derived' })
    expect(calendar.statistics.find(stat => stat.id === 'total-no-school-weekdays')?.value).toBe('28 weekdays')
  })

  it('records the unequal period counts without changing dates to force 45 days', () => {
    const closed = closureDates([...calendar.confirmedNoSchoolDayEventIds!, ...calendar.conditionalNoSchoolDayEventIds!])
    const periods = [['2026-08-10', '2026-10-13'], ['2026-10-14', '2027-01-11'], ['2027-01-12', '2027-03-26'], ['2027-03-29', '2027-05-28']]
    expect(periods.map(([start, end]) => weekdays(start!, end!).filter(date => !closed.has(date)).length)).toEqual([45, 45, 46, 44])
    expect(calendar.sourceDiscrepancies?.some(item => item.field === 'nineWeekPeriodDayCounts' && item.resolution === 'unresolved')).toBe(true)
    expect(calendar.statistics.some(stat => /quarter|nine.week|semester/i.test(stat.id))).toBe(false)
  })

  it('keeps the 16-day fixed winter stretch distinct from the conditional 18-day plan after regeneration', () => {
    const fixedStart = new Date('2026-12-19T00:00:00Z')
    const fixedEnd = new Date('2027-01-03T00:00:00Z')
    const plannedStart = new Date('2026-12-18T00:00:00Z')
    const plannedEnd = new Date('2027-01-04T00:00:00Z')
    expect((fixedEnd.valueOf() - fixedStart.valueOf()) / 86400000 + 1).toBe(16)
    expect((plannedEnd.valueOf() - plannedStart.valueOf()) / 86400000 + 1).toBe(18)
    const regenerated = calculateCalendarStatistics(calendar)
    const longest = regenerated.find((item: { id: string }) => item.id === 'longest-no-school-stretch')
    expect(longest).toMatchObject({ label: 'Longest break excluding Flex Days', value: '16 consecutive days', basis: 'derived' })
    expect(longest.explanation).toContain('If both remain holidays')
    expect(longest.explanation).toContain('18 consecutive calendar days')
    expect(calendar.statistics).toEqual(regenerated)
    const defaults = calculateCalendarStatistics({ ...calendar, longestBreakStatisticLabel: undefined, longestBreakStatisticExplanation: undefined })
    expect(defaults.find((item: { id: string }) => item.id === 'longest-no-school-stretch')).toMatchObject({ label: 'Longest listed break', value: '16 consecutive days' })
    expect(defaults.filter((item: { id: string }) => item.id !== 'longest-no-school-stretch')).toEqual(regenerated.filter((item: { id: string }) => item.id !== 'longest-no-school-stretch'))
  })

  it('exports each official occurrence once and preserves inclusive holiday ranges', () => {
    const ics = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
    const entries = ics.split('BEGIN:VEVENT').slice(1)
    expect(entries).toHaveLength(events.length)
    const homecoming = entries.find(entry => entry.includes('UID:acps-2026-2027-uf-homecoming@'))!
    expect(homecoming).toContain('SUMMARY:UF Homecoming Holiday\r\n')
    expect(homecoming).toContain('Official calendar label: Holiday - UF Homecoming')
    expect(homecoming).not.toContain('SUMMARY:UF Homecoming Holiday (Tentative)')
    expect(homecoming).toContain('An October 5\\, 2026 school notice confirmed no classes on October 9')
    expect(homecoming).toContain('https://www.alachuaschools.net/o/newberry-high/article/3150112')
    const winter = entries.find(entry => entry.includes('UID:acps-2026-2027-winter-break@'))!
    expect(winter).toContain('DTSTART;VALUE=DATE:20261221')
    expect(winter).toContain('DTEND;VALUE=DATE:20270102')
    const spring = entries.find(entry => entry.includes('UID:acps-2026-2027-spring-break@'))!
    expect(spring).toContain('DTEND;VALUE=DATE:20270320')
    for (const event of calendar.conditionalNoSchoolDayEventIds!) {
      const entry = entries.find(item => item.includes('UID:' + event + '@'))!
      expect(entry).toContain('may become a school day')
      expect(entry).not.toContain('School status: no classes')
    }
    expect(ics).not.toMatch(/Pre-Planning|Post-Planning|SUMMARY:Memorial/)
  })
})
