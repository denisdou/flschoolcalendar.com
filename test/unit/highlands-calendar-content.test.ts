import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CalendarSchoolHours, DistrictCalendar, DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/highlands-county-school-district.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore Dependency-free content audit.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord
const calendar = record.schoolYears['2026-2027'] as DistrictCalendar
const on = (day: string) => calendar.events.find(event => event.dateStart === day)!
function weekdays(start: string, end: string) {
  const dates: string[] = []
  for (const day = new Date(start + 'T00:00:00Z'); day <= new Date(end + 'T00:00:00Z'); day.setUTCDate(day.getUTCDate() + 1)) {
    if (![0, 6].includes(day.getUTCDay())) dates.push(day.toISOString().slice(0, 10))
  }
  return dates
}
const offDates = (ids: string[]) => new Set(ids.flatMap(id => {
  const event = calendar.events.find(item => item.id === id)!
  return weekdays(event.dateStart!, event.dateEnd || event.dateStart!)
}))

describe('Highlands hurricane rules, reporting windows and continuous time off', () => {
  it('retains the printed approval and honest local-versus-remote source evidence', () => {
    expect(record.district).toMatchObject({ id: 'FL-28', timeZone: 'America/New_York', name: 'School Board of Highlands County' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027'])
    expect(calendar).toMatchObject({ firstDay: '2026-08-11', lastDay: '2027-05-27', approvedAt: '2025-10-07', printedBoardApprovalDate: '2025-10-07', lastOfficialRevisionAt: null, publishedAt: null })
    expect(calendar.actions.officialPdfUrl).toContain('1JMnBU0HjwDWWGjetZOlIEVc7M4cxFIKN')
    expect(calendar.sources[0]!.contentHash).toBe('sha256:9b8372397389e63442d6654e32bd521e8fe4f90eb25956ac41a4c17b537f2906')
    expect(calendar.sourceDiscrepancies?.map(item => item.field)).toEqual(['remotePdfByteIdentity'])
    expect(calendar.sources.find(item => item.id === 'highlands-posted-calendar')?.contentHash).toBe('sha256:b98c13ecd974be102c53acb4c2d724caae17a5fed366f5b3cc4cbb87bc14393d')
    expect(auditRecords([{ filename: record.district.slug + '.json', record }])).toEqual([])
  })

  it('separates four possible contact dates from fixed holidays and 179 baseline attendance dates', () => {
    const fixed = offDates(calendar.confirmedNoSchoolDayEventIds!)
    const reserve = offDates(calendar.conditionalNoSchoolDayEventIds!)
    const all = new Set([...fixed, ...reserve])
    expect([...reserve].sort()).toEqual(['2026-10-16', '2027-01-07', '2027-01-08', '2027-04-23'])
    expect(fixed.size).toBe(25)
    expect(weekdays(calendar.firstDay!, calendar.lastDay!)).toHaveLength(208)
    expect(weekdays(calendar.firstDay!, calendar.lastDay!).filter(day => !all.has(day))).toHaveLength(179)
    for (const id of calendar.conditionalNoSchoolDayEventIds!) {
      const event = calendar.events.find(item => item.id === id)!
      expect(event).toMatchObject({ schoolStatus: 'no-classes', scheduledAsNoSchool: true, mayBecomeAttendanceDay: true, countsAsStudentAttendanceDayUnderPublishedSchedule: false })
      expect(event.countsAsStudentAttendanceDay).toBeUndefined()
      expect(calendar.confirmedNoSchoolDayEventIds).not.toContain(id)
    }
    expect(on('2027-02-12')).toMatchObject({ schoolStatus: 'no-classes', countsAsStudentAttendanceDay: false })
    expect(on('2027-02-12').mayBecomeAttendanceDay).toBeUndefined()
    expect(calendar.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value: '179 days', basis: 'derived' })
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
  })

  it('keeps six attendance-day early releases distinct from no-school reserves and protects the two full-day exceptions', () => {
    const early = calendar.events.filter(item => hasEventType(item, 'EARLY_RELEASE'))
    expect(early.map(item => item.dateStart)).toEqual(['2026-08-26', '2026-09-23', '2026-10-15', '2026-12-22', '2027-02-11', '2027-05-27'])
    for (const event of early) {
      expect(event.schoolStatus).toBe('early-dismissal')
      expect(event.countsAsStudentAttendanceDay).toBe(true)
      expect(event.mayBecomeAttendanceDay).toBeUndefined()
      expect(calendar.conditionalNoSchoolDayEventIds).not.toContain(event.id)
    }
    for (const day of ['2026-12-22', '2027-05-27']) expect(on(day).note).toMatch(/exempt/i)
    expect(on('2026-12-22')).toMatchObject({ eventTypes: ['EARLY_RELEASE', 'GRADING_PERIOD_END', 'SEMESTER_END'] })
    expect(on('2027-05-27')).toMatchObject({ eventTypes: ['LAST_DAY', 'EARLY_RELEASE', 'GRADING_PERIOD_END'] })
    expect(on('2027-02-11')).toMatchObject({ eventTypes: ['EARLY_RELEASE', 'PROGRESS_REPORT'] })
    expect(calendar.events.filter(item => item.dateStart === '2027-02-11')).toHaveLength(1)
    expect(on('2026-10-16').note).toContain('second printed make-up step')
    expect(on('2027-04-23').note).toContain('before the January 7-8 pair')
    expect(on('2027-01-08').note).toContain('does not give a separate activation order')
  })

  it('validates every planning-span weekday while withholding fixed counts for conditional spans', () => {
    expect(calendar.breaks.map(item => [item.dateStart, item.dateEnd, item.nextStudentAttendanceDate, item.schoolWeekdaysOff])).toEqual([
      ['2026-10-16', '2026-10-18', '2026-10-19', null],
      ['2026-11-21', '2026-11-29', '2026-11-30', 5],
      ['2026-12-23', '2027-01-10', '2027-01-11', null],
      ['2027-02-12', '2027-02-14', '2027-02-15', 1],
      ['2027-03-13', '2027-03-21', '2027-03-22', 5],
      ['2027-04-23', '2027-04-25', '2027-04-26', null],
    ])
    const all = offDates([...calendar.confirmedNoSchoolDayEventIds!, ...calendar.conditionalNoSchoolDayEventIds!])
    for (const span of calendar.breaks) {
      expect([...offDates(span.componentEventIds!)].sort()).toEqual(weekdays(span.dateStart, span.dateEnd))
      expect(all.has(span.lastStudentAttendanceDate!)).toBe(false)
      expect(all.has(span.nextStudentAttendanceDate!)).toBe(false)
      expect(span.nextStudentAttendanceDateBasis).toBe('derived')
    }
    expect(on('2026-12-23').dateEnd).toBe('2026-12-31')
    expect(on('2027-01-01').dateEnd).toBe('2027-01-06')
    expect(calendar.breaks[2]!.note).toContain('If they stay student-free')
    expect(calendar.comparativeInsights[0]).toContain('15-day break statistic')
    expect(calendar.comparativeInsights[0]).toContain('planned 19-day')
  })

  it('does not extend winter backward over December classes or spring across March 22-25', () => {
    const all = offDates([...calendar.confirmedNoSchoolDayEventIds!, ...calendar.conditionalNoSchoolDayEventIds!])
    for (const day of ['2026-12-21', '2026-12-22', '2027-02-15', ...weekdays('2027-03-22', '2027-03-25')]) expect(all.has(day)).toBe(false)
    expect(on('2027-03-26')).toMatchObject({ eventType: 'HOLIDAY', schoolStatus: 'no-classes' })
    expect(all.has('2027-03-29')).toBe(false)
    expect(calendar.events.every(item => item.dateStart! >= calendar.firstDay! && item.dateStart! <= calendar.lastDay!)).toBe(true)
    expect(calendar.events.some(item => /staff-only|May 28|Memorial|payroll|professional orientation/i.test(item.name))).toBe(false)
  })

  it('treats report-card ranges as windows, preserving the January holiday and derived March-April adjacency', () => {
    const reports = calendar.events.filter(item => hasEventType(item, 'REPORT_CARD'))
    expect(reports.map(item => [item.dateStart, item.dateEnd, item.dateBasis])).toEqual([
      ['2026-10-19', '2026-10-23', 'official'],
      ['2027-01-11', '2027-01-22', 'official'],
      ['2027-03-29', '2027-04-02', 'derived'],
    ])
    expect(on('2027-01-11').note).toContain('January 18 holiday')
    expect(on('2027-03-29').note).toContain('adjacent March 29-31 and April 1-2')
    for (const event of reports) {
      expect(event.schoolStatus).toBe('not-applicable')
      expect(event.countsAsStudentAttendanceDay).toBeUndefined()
      expect(calendar.confirmedNoSchoolDayEventIds).not.toContain(event.id)
    }
    expect(calendar.events.filter(item => hasEventType(item, 'PROGRESS_REPORT')).map(item => item.dateStart)).toEqual(['2026-09-11', '2026-11-13', '2027-02-11', '2027-04-22'])
    expect(calendar.faqs).toHaveLength(21)
    expect(new Set(calendar.faqs.map(item => item.question)).size).toBe(21)
    expect(calendar.faqs.find(item => item.question.startsWith('When is winter break'))?.answer).toContain('If those dates stay student-free')
  })

  it('scopes regular Lake Placid hours and date-specific releases without inferring a countywide clock', () => {
    const rows = calendar.schoolHours as CalendarSchoolHours[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ scope: 'Lake Placid High School - 2026-2027 A/B days and C days', regularHours: '8:34 a.m.-3:30 p.m. Eastern Time', sourceId: 'highlands-lph-bells', effectiveThrough: null })
    expect(rows[0]!.note).toContain('exemption rules apply')
    expect(rows[0]!.earlyReleaseTime).toBeUndefined()
    expect(on('2026-09-23').note).toContain('1:30 p.m.')
    expect(on('2026-10-15').note).toContain('Sebring High')
    expect(on('2026-10-15').note).toContain('October 15 only')
    expect(calendar.sources.find(item => item.id === 'highlands-lph-bells')?.publishedAt).toBe('2026-04-27')
  })

  it('exports 27 unique occurrences and preserves inclusive ranges as next-day exclusive endpoints', () => {
    const ics = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
    const entries = ics.split('BEGIN:VEVENT').slice(1)
    expect(entries).toHaveLength(27)
    const entry = (day: string) => entries.find(text => text.includes('UID:' + on(day).id + '@'))!
    expect(entry('2026-11-21')).toContain('DTEND;VALUE=DATE:20261130')
    expect(entry('2026-12-23')).toContain('DTEND;VALUE=DATE:20270101')
    expect(entry('2027-01-01')).toContain('DTEND;VALUE=DATE:20270107')
    expect(entry('2027-01-11')).toContain('DTEND;VALUE=DATE:20270123')
    expect(entry('2027-03-29')).toContain('DTEND;VALUE=DATE:20270403')
    expect(entry('2027-04-23')).toContain('CATEGORIES:HOLIDAY,MAKEUP_DAY')
    expect(entry('2027-05-27')).toContain('CATEGORIES:LAST_DAY,EARLY_RELEASE,GRADING_PERIOD_END')
    expect(ics).not.toContain('DTSTART;VALUE=DATE:20270528')
  })
})
