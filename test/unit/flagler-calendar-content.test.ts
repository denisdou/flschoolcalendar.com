import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/flagler-county-school-district.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord
const calendar = record.schoolYears['2026-2027']!
const event = (key: string) => calendar.events.find(item => item.id === 'flagler-2026-2027-' + key)!

function weekdays(start: string, end: string) {
  const dates: string[] = []
  for (const cursor = new Date(start + 'T00:00:00Z'); cursor <= new Date(end + 'T00:00:00Z'); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (![0, 6].includes(cursor.getUTCDay())) dates.push(cursor.toISOString().slice(0, 10))
  }
  return dates
}

function datesFor(ids: string[]) {
  return new Set(ids.flatMap(id => {
    const item = calendar.events.find(item => item.id === id)!
    return weekdays(item.dateStart!, item.dateEnd || item.dateStart!)
  }))
}

describe('Flagler Florida 2026-2027 calendar interpretation', () => {
  it('uses the matching district-published file without inventing Board adoption from metadata', () => {
    expect(record.district).toMatchObject({ id: 'FL-18', districtNumber: '18', timeZone: 'America/New_York', name: 'Flagler Schools' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027'])
    expect(calendar.status).toBe('official')
    expect(calendar.approvedAt).toBeNull()
    expect(calendar.publishedAt).toBeNull()
    expect(calendar.sources[0]?.contentHash).toBe('sha256:53fcc382c5f9a97f032c7d4bcc1fa1d2b33aa6d52b78c27129a71ae4885a07da')
    expect(calendar.sourceDiscrepancies?.find(item => item.field === 'approvedAt')?.effect).toContain('DRAFT')
  })

  it('reads open circles as progress reports and triangles as report cards, including June 8', () => {
    expect(calendar.events.filter(item => hasEventType(item, 'PROGRESS_REPORT')).map(item => item.dateStart)).toEqual(['2026-09-09', '2026-11-12', '2027-02-05', '2027-04-22'])
    expect(calendar.events.filter(item => hasEventType(item, 'REPORT_CARD')).map(item => item.dateStart)).toEqual(['2026-10-16', '2027-01-07', '2027-03-24', '2027-06-08'])
    expect(event('final-report-cards').schoolStatus).toBe('not-applicable')
    expect(event('final-report-cards').countsAsStudentAttendanceDay).toBeUndefined()
    expect(calendar.lastDay).toBe('2027-05-27')
  })

  it('separates eight ordered hurricane reserves from fixed no-school weekdays', () => {
    const confirmed = datesFor(calendar.confirmedNoSchoolDayEventIds!)
    const conditional = datesFor(calendar.conditionalNoSchoolDayEventIds!)
    expect([...conditional]).toEqual(['2026-10-12', '2026-11-23', '2026-11-24', '2026-12-21', '2026-12-22', '2027-01-04', '2027-01-05', '2027-03-12'])
    expect(confirmed.size).toBe(22)
    expect([...conditional].some(date => confirmed.has(date))).toBe(false)
    calendar.conditionalNoSchoolDayEventIds!.forEach((id, index) => {
      const item = calendar.events.find(item => item.id === id)!
      expect(item).toMatchObject({ schoolStatus: 'no-classes', scheduledAsNoSchool: true, mayBecomeAttendanceDay: true, countsAsStudentAttendanceDayUnderPublishedSchedule: false })
      expect(item.countsAsStudentAttendanceDay).toBeUndefined()
      expect(item.note).toContain('Number ' + (index + 1) + ' in the published hurricane make-up list')
      expect(hasEventType(item, 'MAKEUP_DAY')).toBe(true)
    })
    expect(event('thanksgiving-fixed')).toMatchObject({ dateStart: '2026-11-25', dateEnd: '2026-11-27', dateBasis: 'derived' })
    expect(event('holiday-fixed')).toMatchObject({ dateStart: '2026-12-23', dateEnd: '2027-01-01', dateBasis: 'derived' })
    expect(confirmed.has('2026-08-18')).toBe(true)
    expect(confirmed.has('2026-11-03')).toBe(true)
  })

  it('preserves the official named ranges and staff-day boundaries without guaranteeing conditional breaks', () => {
    expect(calendar.breaks.map(item => [item.dateStart, item.dateEnd, item.schoolWeekdaysOff])).toEqual([
      ['2026-11-23', '2026-11-27', null],
      ['2026-12-21', '2027-01-01', null],
      ['2027-03-15', '2027-03-19', 5],
    ])
    for (const span of calendar.breaks) {
      expect([...datesFor(span.componentEventIds!)].sort()).toEqual(weekdays(span.dateStart, span.dateEnd))
    }
    expect(calendar.breaks[1]).toMatchObject({ nextStudentAttendanceDate: '2027-01-06', nextStudentAttendanceDateBasis: 'official' })
    expect(event('january-workday').dateStart).toBe('2027-01-04')
    expect(event('january-learning-day').dateStart).toBe('2027-01-05')
    expect(event('winter-return')).toMatchObject({ dateStart: '2027-01-06', dateBasis: 'official' })
    expect(calendar.breaks[2]).toMatchObject({ lastStudentAttendanceDate: '2027-03-11', nextStudentAttendanceDate: '2027-03-22', nextStudentAttendanceDateBasis: 'derived' })
    expect(calendar.breaks[2]?.componentEventIds).not.toContain(event('march-workday').id)
  })

  it('reconciles 179 planned attendance days and counts the May 27 meanings once', () => {
    const off = datesFor([...calendar.confirmedNoSchoolDayEventIds!, ...calendar.conditionalNoSchoolDayEventIds!])
    const schoolDays = weekdays(calendar.firstDay!, calendar.lastDay!).filter(date => !off.has(date))
    expect(weekdays(calendar.firstDay!, calendar.lastDay!)).toHaveLength(209)
    expect(schoolDays).toHaveLength(179)
    const quarterEnds = ['2026-10-09', '2026-12-18', '2027-03-11', '2027-05-27']
    expect(quarterEnds.map((end, index) => schoolDays.filter(date => date <= end && (index === 0 || date > quarterEnds[index - 1]!)).length)).toEqual([43, 42, 45, 49])
    expect(calendar.events.filter(item => hasEventType(item, 'EARLY_RELEASE')).map(item => item.dateStart)).toEqual(['2027-05-26', '2027-05-27'])
    expect(event('last-day').eventTypes).toEqual(['LAST_DAY', 'EARLY_RELEASE', 'GRADING_PERIOD_END', 'SEMESTER_END'])
    expect(calendar.events.filter(item => item.dateStart === '2027-05-27')).toHaveLength(1)
    expect(calendar.schoolHours).toEqual([])
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
    expect(calendar.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value: '179 days', basis: 'derived' })
    expect(calendar.highlights.some(item => item.label === 'Student days' && item.basis === 'official')).toBe(false)
  })

  it('exports conditional single dates and fixed inclusive ranges without adding employee events', () => {
    expect(calendar.events.some(item => item.schoolStatus === 'staff-only' || ['2026-08-03', '2027-05-28', '2027-05-31'].includes(item.dateStart!))).toBe(false)
    const ics = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
    const entries = ics.split('BEGIN:VEVENT').slice(1)
    const find = (key: string) => entries.find(item => item.includes('UID:' + event(key).id + '@'))!
    expect(entries).toHaveLength(32)
    expect(find('thanksgiving-reserve-23')).toContain('DTEND;VALUE=DATE:20261124')
    expect(find('thanksgiving-reserve-23')).toContain('attendance may change')
    expect(find('thanksgiving-fixed')).toContain('DTEND;VALUE=DATE:20261128')
    expect(find('holiday-fixed')).toContain('DTEND;VALUE=DATE:20270102')
    expect(find('spring-break')).toContain('DTEND;VALUE=DATE:20270320')
    expect(find('last-day')).toContain('CATEGORIES:LAST_DAY,EARLY_RELEASE,GRADING_PERIOD_END,SEMESTER_END')
    expect(find('final-report-cards')).toContain('DTSTART;VALUE=DATE:20270608')
  })
})
