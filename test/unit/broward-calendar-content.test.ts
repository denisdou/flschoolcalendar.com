import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DistrictCalendar, DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/broward-county-public-schools.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore Dependency-free publication checker.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord
const current = record.schoolYears['2026-2027']!
const next = record.schoolYears['2027-2028']!
const event = (calendar: DistrictCalendar, key: string) => calendar.events.find(item => item.id === `bcps-${calendar.schoolYear}-${key}`)!

function weekdays(start: string, end: string) {
  const result: string[] = []
  for (const cursor = new Date(start + 'T00:00:00Z'); cursor <= new Date(end + 'T00:00:00Z'); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (![0, 6].includes(cursor.getUTCDay())) result.push(cursor.toISOString().slice(0, 10))
  }
  return result
}

function closedDates(calendar: DistrictCalendar, ids = calendar.confirmedNoSchoolDayEventIds!) {
  return new Set(ids.flatMap(id => {
    const item = calendar.events.find(item => item.id === id)!
    return weekdays(item.dateStart!, item.dateEnd || item.dateStart!)
  }))
}

describe('Broward published two-year student calendars', () => {
  it('uses the matching official files without turning the announcement date into a Board vote date', () => {
    expect(record.district).toMatchObject({ id: 'FL-06', name: 'Broward County Public Schools', timeZone: 'America/New_York' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027', '2027-2028'])
    expect(current.sources[0]?.contentHash).toBe('sha256:f77ec18cf6af630ad1cdfa7ccb816aceb634aa98f4232c46c7559edbf540eebd')
    expect(next.sources[0]?.contentHash).toBe('sha256:df3e7b4ac34f1822b52120e4194aeb2c54c8a83a42eaf34cc99e30ff39a83a0a')
    for (const calendar of [current, next]) {
      expect(calendar.status).toBe('official')
      expect(calendar.approvedAt).toBeNull()
      expect(calendar.sources.find(item => item.id === 'bcps-calendar-approval-news')?.publishedAt).toBe('2025-12-18')
      expect(calendar.sourceDiscrepancies?.find(item => item.field === 'approvedAt')?.effect).toContain('does not identify the Board vote date')
    }
    expect(next.faqs.find(item => item.question.includes('Option #1'))?.answer).toMatch(/^Yes\./)
    expect(auditRecords([{ filename: record.district.slug + '.json', record }])).toEqual([])
  })

  it('counts six shortened attendance days and keeps the five weather candidates out of holiday lists', () => {
    for (const [calendar, expected] of [
      [current, ['2026-10-09', '2026-12-18', '2027-02-12', '2027-03-18', '2027-04-30', '2027-05-28']],
      [next, ['2027-10-08', '2027-12-17', '2028-02-14', '2028-03-10', '2028-04-13', '2028-05-31']],
    ] as Array<[DistrictCalendar, string[]]>) {
      const shortened = calendar.events.filter(item => hasEventType(item, 'EARLY_RELEASE'))
      expect(shortened.map(item => item.dateStart)).toEqual(expected)
      expect(shortened.every(item => item.schoolStatus === 'early-dismissal' && item.countsAsStudentAttendanceDay === true)).toBe(true)
      expect(shortened.filter(item => /weather/i.test(item.note || ''))).toHaveLength(5)
      expect(calendar.conditionalNoSchoolDayEventIds).toEqual([])
      expect(calendar.events.some(item => item.mayBecomeAttendanceDay || hasEventType(item, 'MAKEUP_DAY'))).toBe(false)
      for (const date of expected) expect(closedDates(calendar).has(date)).toBe(false)
      expect(calendar.schoolHours).toEqual([])
    }
    expect(event(next, 'early-release-2028-02-14').name).toContain('A Day of Service and Love')
  })

  it('joins named breaks with only the adjacent verified planning days', () => {
    expect(event(current, 'winter-break')).toMatchObject({ dateStart: '2026-12-21', dateEnd: '2027-01-01', dateBasis: 'derived' })
    expect(event(next, 'winter-break')).toMatchObject({ dateStart: '2027-12-20', dateEnd: '2027-12-31', dateBasis: 'official' })
    expect(current.breaks[1]).toMatchObject({ dateEnd: '2027-01-04', nextStudentAttendanceDate: '2027-01-05', schoolWeekdaysOff: 11 })
    expect(next.breaks[1]).toMatchObject({ dateEnd: '2028-01-03', nextStudentAttendanceDate: '2028-01-04', schoolWeekdaysOff: 11 })
    expect(current.breaks[2]).toMatchObject({ dateStart: '2027-03-19', dateEnd: '2027-03-26', nextStudentAttendanceDate: '2027-03-29', schoolWeekdaysOff: 6 })
    expect(next.breaks[2]).toMatchObject({ dateStart: '2028-03-13', dateEnd: '2028-03-20', nextStudentAttendanceDate: '2028-03-21', schoolWeekdaysOff: 6 })
    for (const calendar of [current, next]) for (const span of calendar.breaks) {
      expect([...closedDates(calendar, span.componentEventIds!)].sort()).toEqual(weekdays(span.dateStart, span.dateEnd))
      expect(weekdays(span.dateStart, span.dateEnd)).toHaveLength(span.schoolWeekdaysOff!)
      expect(closedDates(calendar).has(span.nextStudentAttendanceDate!)).toBe(false)
      expect(closedDates(calendar).has(span.lastStudentAttendanceDate!)).toBe(false)
    }
  })

  it('does not bridge the isolated March 10 closure or the separate April break', () => {
    const currentClosed = closedDates(current)
    expect(currentClosed.has('2027-03-10')).toBe(true)
    for (const date of ['2027-03-11', '2027-03-12', '2027-03-15', '2027-03-16', '2027-03-17', '2027-03-18']) expect(currentClosed.has(date)).toBe(false)
    expect(next.breaks.find(item => item.name === 'October student break')).toMatchObject({ dateStart: '2027-10-11', dateEnd: '2027-10-12', nextStudentAttendanceDate: '2027-10-13', schoolWeekdaysOff: 2 })
    expect(next.breaks.find(item => item.name === 'April student break')).toMatchObject({ dateStart: '2028-04-14', dateEnd: '2028-04-17', nextStudentAttendanceDate: '2028-04-18', schoolWeekdaysOff: 2 })
    expect(next.breaks.some(item => item.dateStart <= '2028-03-21' && item.dateEnd >= '2028-04-13')).toBe(false)
    expect(closedDates(next).has('2028-05-29')).toBe(true)
    expect(closedDates(next).has('2028-05-30')).toBe(false)
  })

  it('reconciles each year and its published term counts without claiming a printed annual total', () => {
    for (const [calendar, count, termRanges, terms] of [
      [current, 30, [['2026-08-10', '2026-10-09'], ['2026-10-13', '2026-12-18'], ['2027-01-05', '2027-03-18'], ['2027-03-29', '2027-05-28']], [43, 42, 50, 45]],
      [next, 32, [['2027-08-10', '2027-12-17'], ['2028-01-04', '2028-05-31']], [84, 96]],
    ] as Array<[DistrictCalendar, number, string[][], number[]]>) {
      const closed = closedDates(calendar)
      expect(closed.size).toBe(count)
      expect(weekdays(calendar.firstDay!, calendar.lastDay!).filter(date => !closed.has(date))).toHaveLength(180)
      expect(termRanges.map(([start, end]) => weekdays(start!, end!).filter(date => !closed.has(date)).length)).toEqual(terms)
      expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
      expect(calendar.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value: '180 days', basis: 'derived' })
      expect(calendar.statistics.find(item => item.id === 'early-release-days')?.value).toBe('6 dates')
    }
  })

  it('preserves the final report-card symbols and grade scopes after the student year', () => {
    expect(event(current, 'grade-12-final-cards')).toMatchObject({ dateStart: '2027-05-24', gradeScope: 'Grade 12', schoolStatus: 'not-applicable' })
    expect(event(current, 'k-11-final-cards')).toMatchObject({ dateStart: '2027-06-10', gradeScope: 'Kindergarten through Grade 11', schoolStatus: 'not-applicable' })
    expect(current.events.filter(item => hasEventType(item, 'REPORT_CARD'))).toHaveLength(5)
    expect(current.events.filter(item => hasEventType(item, 'PROGRESS_REPORT'))).toHaveLength(4)
    expect(current.events.filter(item => item.dateStart! > current.lastDay!)).toEqual([event(current, 'k-11-final-cards')])
    expect(next.events.some(item => hasEventType(item, 'REPORT_CARD') || hasEventType(item, 'PROGRESS_REPORT'))).toBe(false)
    expect(next.faqs.find(item => item.question.includes('report-card and interim'))?.answer).toContain('not listed')
  })

  it('exports each last-day occurrence once and uses the day after each inclusive break endpoint', () => {
    for (const [calendar, expectedCount, winterEnd, springEnd, lastStart] of [
      [current, 32, '20270102', '20270327', '20270528'],
      [next, 22, '20280101', '20280318', '20280531'],
    ] as Array<[DistrictCalendar, number, string, string, string]>) {
      const ics = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
      const entries = ics.split('BEGIN:VEVENT').slice(1)
      expect(entries).toHaveLength(expectedCount)
      const find = (key: string) => entries.find(item => item.includes('UID:' + event(calendar, key).id + '@'))!
      expect(find('winter-break')).toContain('DTEND;VALUE=DATE:' + winterEnd)
      expect(find('spring-break')).toContain('DTEND;VALUE=DATE:' + springEnd)
      expect(find('last-day')).toContain('CATEGORIES:LAST_DAY,EARLY_RELEASE,GRADING_PERIOD_END,SEMESTER_END')
      expect(entries.filter(item => item.includes('DTSTART;VALUE=DATE:' + lastStart))).toHaveLength(1)
      expect(calendar.events.filter(item => hasEventType(item, 'LAST_DAY'))).toEqual([event(calendar, 'last-day')])
      expect(calendar.events.some(item => /FTE|first day teachers|last day teachers|preplanning|postplanning/i.test(item.name))).toBe(false)
      expect(calendar.events.every(item => item.dateStart! >= calendar.firstDay!)).toBe(true)
    }
  })
})
