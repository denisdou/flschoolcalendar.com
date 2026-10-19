import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DistrictCalendar, DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/gulf-county-school-district.json'
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

describe('Gulf student calendar, separate March closures and local bell times', () => {
  it('uses the current matching v2 source without treating stale PDF metadata as identity or approval', () => {
    expect(record.district).toMatchObject({ id: 'FL-23', name: 'Gulf District Schools', timeZone: 'America/New_York' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027'])
    expect(calendar).toMatchObject({ firstDay: '2026-08-10', lastDay: '2027-05-28', approvedAt: null, publishedAt: null, lastOfficialRevisionAt: null })
    expect(calendar.actions.officialPdfUrl).toBe('https://gulfschools-media.s3.amazonaws.com/uploads/2026/04/09091133/2026-2027-SCHOOL-CALENDAR-v2.pdf')
    expect(calendar.sources[0]!.contentHash).toBe('sha256:fe9ef83212a8f9e2f35dfd5156b8eb09582ccd06472faba0bf5d092f2295f026')
    expect(calendar.sources.find(item => item.id === 'gulf-calendar-page')?.publishedAt).toBe('2026-03-10')
    expect(auditRecords([{ filename: record.district.slug + '.json', record }])).toEqual([])
  })

  it('reconciles 180 student dates and the printed 84/96 semester totals', () => {
    const off = offDates(calendar.confirmedNoSchoolDayEventIds!)
    expect(calendar.confirmedNoSchoolDayEventIds).toHaveLength(12)
    expect(calendar.conditionalNoSchoolDayEventIds).toEqual([])
    expect(weekdays(calendar.firstDay!, calendar.lastDay!)).toHaveLength(210)
    expect(off.size).toBe(30)
    expect(weekdays(calendar.firstDay!, calendar.lastDay!).filter(day => !off.has(day))).toHaveLength(180)
    expect(weekdays('2026-08-10', '2026-12-18').filter(day => !off.has(day))).toHaveLength(84)
    expect(weekdays('2027-01-05', '2027-05-28').filter(day => !off.has(day))).toHaveLength(96)
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
    expect(calendar.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value: '180 days', basis: 'official' })
    expect(calendar.events.some(item => hasEventType(item, 'MAKEUP_DAY') || item.mayBecomeAttendanceDay)).toBe(false)
  })

  it('validates every weekday in each continuous span and derives the actual return dates', () => {
    expect(calendar.breaks.map(item => [item.dateStart, item.dateEnd, item.nextStudentAttendanceDate, item.schoolWeekdaysOff])).toEqual([
      ['2026-10-10', '2026-10-13', '2026-10-14', 2],
      ['2026-11-21', '2026-11-29', '2026-11-30', 5],
      ['2026-12-19', '2027-01-04', '2027-01-05', 11],
      ['2027-03-13', '2027-03-21', '2027-03-22', 5],
    ])
    const off = offDates(calendar.confirmedNoSchoolDayEventIds!)
    for (const span of calendar.breaks) {
      expect([...offDates(span.componentEventIds!)].sort()).toEqual(weekdays(span.dateStart, span.dateEnd))
      expect(off.has(span.lastStudentAttendanceDate!)).toBe(false)
      expect(off.has(span.nextStudentAttendanceDate!)).toBe(false)
      expect(span.nextStudentAttendanceDateBasis).toBe('derived')
    }
    expect(on('2026-10-12').dateEnd).toBe('2026-10-13')
    expect(on('2026-12-21').dateEnd).toBe('2027-01-01')
    expect(on('2027-01-04')).toMatchObject({ eventType: 'NON_STUDENT_DAY', schoolStatus: 'no-classes' })
    expect(calendar.breaks[2]!.componentEventIds).toEqual([on('2026-12-21').id, on('2027-01-04').id])
  })

  it('does not bridge the four class days between spring break and Good Friday', () => {
    const off = offDates(calendar.confirmedNoSchoolDayEventIds!)
    expect(on('2027-03-15').dateEnd).toBe('2027-03-19')
    for (const day of weekdays('2027-03-22', '2027-03-25')) expect(off.has(day)).toBe(false)
    expect(on('2027-03-26')).toMatchObject({ name: 'Good Friday', eventType: 'HOLIDAY', schoolStatus: 'no-classes' })
    expect(off.has('2027-03-29')).toBe(false)
    expect(calendar.breaks[3]!.componentEventIds).not.toContain(on('2027-03-26').id)
  })

  it('preserves both no-lunch early dismissals as single attendance occurrences with grading meanings', () => {
    expect(calendar.events.filter(item => hasEventType(item, 'EARLY_RELEASE')).map(item => item.dateStart)).toEqual(['2026-12-18', '2027-05-28'])
    expect(on('2026-12-18')).toMatchObject({ eventTypes: ['EARLY_RELEASE', 'GRADING_PERIOD_END'], schoolStatus: 'early-dismissal', countsAsStudentAttendanceDay: true })
    expect(on('2027-05-28')).toMatchObject({ eventTypes: ['LAST_DAY', 'EARLY_RELEASE', 'GRADING_PERIOD_END'], schoolStatus: 'early-dismissal', countsAsStudentAttendanceDay: true })
    for (const day of ['2026-12-18', '2027-05-28']) {
      expect(calendar.events.filter(item => item.dateStart === day)).toHaveLength(1)
      expect(on(day).note).toContain('no lunch')
      expect(calendar.confirmedNoSchoolDayEventIds).not.toContain(on(day).id)
    }
    for (const day of ['2026-10-09', '2027-03-12']) expect(on(day)).toMatchObject({ eventType: 'GRADING_PERIOD_END', schoolStatus: 'not-applicable' })
    expect(calendar.events.some(item => hasEventType(item, 'SEMESTER_END'))).toBe(false)
  })

  it('keeps reporting milestones and only the three in-year student-free staff dates', () => {
    expect(calendar.events.filter(item => hasEventType(item, 'PROGRESS_REPORT')).map(item => item.dateStart)).toEqual(['2026-09-09', '2026-11-13', '2027-02-05', '2027-04-23'])
    expect(calendar.events.filter(item => hasEventType(item, 'REPORT_CARD')).map(item => item.dateStart)).toEqual(['2026-10-22', '2027-01-13', '2027-03-31'])
    expect(calendar.events.filter(item => hasEventType(item, 'NON_STUDENT_DAY')).map(item => item.dateStart)).toEqual(['2026-09-25', '2026-10-30', '2027-01-04'])
    expect(calendar.events.every(item => item.dateStart! >= calendar.firstDay! && item.dateStart! <= calendar.lastDay!)).toBe(true)
    expect(calendar.events.some(item => /Teachers’ (First|Last)|Memorial|payroll|graduation|Hurricane Isaias/i.test(item.name))).toBe(false)
  })

  it('scopes undated posted bell times to the named schools and both local time zones', () => {
    expect(Array.isArray(calendar.schoolHours)).toBe(true)
    const rows = calendar.schoolHours as Array<{ scope: string; regularHours: string; earlyReleaseTime: string; note: string; sourceId: string; effectiveThrough: null }>
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ scope: 'Port St. Joe Jr./Sr. High School - Eastern Time', regularHours: '8:25 a.m.-3:00 p.m. Eastern Time', earlyReleaseTime: '12:00 noon Eastern Time (BNL)' })
    expect(rows[1]).toMatchObject({ scope: 'Wewahitchka Jr./Sr. High School - Central Time', regularHours: '8:20 a.m.-3:00 p.m. Central Time', earlyReleaseTime: '12:00 noon Central Time (BNL)' })
    for (const row of rows) {
      expect(row.note).toContain('undated')
      expect(row.note).toContain('elementary schedules may differ')
      expect(row.effectiveThrough).toBeNull()
      expect(calendar.sources.find(item => item.id === row.sourceId)?.type).toBe('campus-website')
    }
    expect(new Set(calendar.faqs.map(item => item.question)).size).toBe(calendar.faqs.length)
    expect(calendar.faqs.find(item => item.question.startsWith('Do Port St. Joe'))?.answer).toContain('one hour behind')
    expect(calendar.faqs.find(item => item.question.startsWith('What does BNL'))?.answer).toContain('Breakfast, No Lunch')
  })

  it('exports 24 occurrences, with exclusive break endpoints and no duplicate final-day entry', () => {
    const ics = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
    const entries = ics.split('BEGIN:VEVENT').slice(1)
    expect(entries).toHaveLength(24)
    const entry = (day: string) => entries.find(text => text.includes('UID:' + on(day).id + '@'))!
    expect(entry('2026-10-12')).toContain('DTEND;VALUE=DATE:20261014')
    expect(entry('2026-11-23')).toContain('DTEND;VALUE=DATE:20261128')
    expect(entry('2026-12-21')).toContain('DTEND;VALUE=DATE:20270102')
    expect(entry('2027-03-15')).toContain('DTEND;VALUE=DATE:20270320')
    expect(entry('2027-05-28')).toContain('CATEGORIES:LAST_DAY,EARLY_RELEASE,GRADING_PERIOD_END')
    expect(entry('2026-12-18')).toContain('no lunch')
    expect(ics).not.toContain('DTSTART;VALUE=DATE:20270531')
  })
})
