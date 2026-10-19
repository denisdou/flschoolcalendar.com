import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DistrictCalendar, DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/glades-county-school-district.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore Dependency-free audit.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord
const calendar = record.schoolYears['2026-2027'] as DistrictCalendar
const on = (day: string) => calendar.events.find(event => event.dateStart === day)!
function weekdays(start: string, end: string) {
  const days: string[] = []
  for (const cursor = new Date(start + 'T00:00:00Z'); cursor <= new Date(end + 'T00:00:00Z'); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (![0, 6].includes(cursor.getUTCDay())) days.push(cursor.toISOString().slice(0, 10))
  }
  return days
}
const offDates = (ids: string[]) => new Set(ids.flatMap(id => {
  const event = calendar.events.find(item => item.id === id)!
  return weekdays(event.dateStart!, event.dateEnd || event.dateStart!)
}))

describe('Glades student PDF, conditional Thanksgiving and reporting dates', () => {
  it('keeps the district-linked Drive source and honest approval/download metadata', () => {
    expect(record.district).toMatchObject({ id: 'FL-22', timeZone: 'America/New_York' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027'])
    expect(calendar).toMatchObject({ firstDay: '2026-08-10', lastDay: '2027-05-28', approvedAt: null, publishedAt: null, sourceDocumentUpdatedAt: null })
    expect(calendar.actions.officialPdfUrl).toContain('1rYWsLIbP7ymR8AMRIuDp_mT4q8QpIQz0')
    expect(calendar.sources[0]!.contentHash).toBe('sha256:f9e131098e5cd12eabe69843278c3f7ad0e34739ad11ad052e7904e2ccd17cf5')
    expect(calendar.sourceDiscrepancies?.map(item => item.field)).toEqual(['approvedAt', 'remotePdfByteIdentity'])
    expect(auditRecords([{ filename: record.district.slug + '.json', record }])).toEqual([])
  })

  it('makes only November 23-25 conditional while preserving the fixed Thanksgiving remainder', () => {
    const reserve = on('2026-11-23')
    expect(reserve).toMatchObject({ dateEnd: '2026-11-25', eventTypes: ['THANKSGIVING_BREAK', 'MAKEUP_DAY'], schoolStatus: 'no-classes', scheduledAsNoSchool: true, mayBecomeAttendanceDay: true, countsAsStudentAttendanceDayUnderPublishedSchedule: false })
    expect(reserve.countsAsStudentAttendanceDay).toBeUndefined()
    expect(calendar.conditionalNoSchoolDayEventIds).toEqual([reserve.id])
    expect(calendar.confirmedNoSchoolDayEventIds).not.toContain(reserve.id)
    expect(on('2026-11-26')).toMatchObject({ eventType: 'HOLIDAY', countsAsStudentAttendanceDay: false })
    expect(on('2026-11-27')).toMatchObject({ eventType: 'THANKSGIVING_BREAK', countsAsStudentAttendanceDay: false })
    expect(calendar.events.filter(item => item.mayBecomeAttendanceDay)).toHaveLength(1)
    expect(calendar.breaks[1]).toMatchObject({ schoolWeekdaysOff: null })
    expect(calendar.breaks[1]!.name).toContain('make-up days possible')
    expect(reserve.note).toContain('no activation order')
  })

  it('reconciles the printed 178 students, semesters and four quarter counts', () => {
    const fixed = offDates(calendar.confirmedNoSchoolDayEventIds!)
    const reserve = offDates(calendar.conditionalNoSchoolDayEventIds!)
    const all = new Set([...fixed, ...reserve])
    expect(weekdays(calendar.firstDay!, calendar.lastDay!)).toHaveLength(210)
    expect(fixed.size).toBe(29)
    expect(reserve.size).toBe(3)
    expect(weekdays(calendar.firstDay!, calendar.lastDay!).filter(day => !all.has(day))).toHaveLength(178)
    const quarters = [['2026-08-10', '2026-10-09', 44], ['2026-10-10', '2026-12-18', 39], ['2027-01-05', '2027-03-19', 51], ['2027-03-20', '2027-05-28', 44]] as const
    for (const [start, end, count] of quarters) expect(weekdays(start, end).filter(day => !all.has(day))).toHaveLength(count)
    expect(quarters[0][2] + quarters[1][2]).toBe(83)
    expect(quarters[2][2] + quarters[3][2]).toBe(95)
    expect(calendar.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value: '178 days', basis: 'official' })
    expect(calendar.statistics.find(item => item.id === 'total-no-school-weekdays')?.value).toBe('29 weekdays')
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
  })

  it('verifies continuous spans and official January 5 and March 30 returns', () => {
    expect(calendar.breaks.map(item => [item.dateStart, item.dateEnd, item.nextStudentAttendanceDate, item.schoolWeekdaysOff])).toEqual([
      ['2026-10-10', '2026-10-18', '2026-10-19', 5],
      ['2026-11-21', '2026-11-29', '2026-11-30', null],
      ['2026-12-19', '2027-01-04', '2027-01-05', 11],
      ['2027-03-20', '2027-03-29', '2027-03-30', 6],
    ])
    const all = offDates([...calendar.confirmedNoSchoolDayEventIds!, ...calendar.conditionalNoSchoolDayEventIds!])
    for (const span of calendar.breaks) {
      expect([...offDates(span.componentEventIds!)].sort()).toEqual(weekdays(span.dateStart, span.dateEnd))
      expect(all.has(span.nextStudentAttendanceDate!)).toBe(false)
      expect(all.has(span.lastStudentAttendanceDate!)).toBe(false)
    }
    expect(calendar.breaks[2]!.nextStudentAttendanceDateBasis).toBe('official')
    expect(calendar.breaks[3]!.nextStudentAttendanceDateBasis).toBe('official')
    expect(on('2027-03-29')).toMatchObject({ eventType: 'NON_STUDENT_DAY', schoolStatus: 'no-classes' })
    expect(on('2027-03-30').countsAsStudentAttendanceDay).toBe(true)
  })

  it('reads Chalo Nitka and the sole early-release day from their actual legend colors', () => {
    expect(on('2027-03-05')).toMatchObject({ name: 'Chalo Nitka', eventType: 'NON_STUDENT_DAY', eventTypeBasis: 'derived', schoolStatus: 'no-classes', countsAsStudentAttendanceDay: false })
    expect(on('2026-12-18')).toMatchObject({ eventTypes: ['GRADING_PERIOD_END', 'SEMESTER_END'], schoolStatus: 'not-applicable' })
    expect(hasEventType(on('2026-12-18'), 'EARLY_RELEASE')).toBe(false)
    expect(calendar.events.filter(item => hasEventType(item, 'EARLY_RELEASE'))).toEqual([on('2027-05-28')])
    expect(on('2027-05-28')).toMatchObject({ eventTypes: ['LAST_DAY', 'EARLY_RELEASE', 'GRADING_PERIOD_END', 'SEMESTER_END'], countsAsStudentAttendanceDay: true })
    expect(calendar.schoolHours).toEqual([])
  })

  it('keeps reporting, open-house campus times and senior ceremonies without inferring attendance', () => {
    expect(calendar.events.filter(item => hasEventType(item, 'PROGRESS_REPORT')).map(item => item.dateStart)).toEqual(['2026-09-10', '2026-11-12', '2027-02-05', '2027-04-23'])
    expect(calendar.events.filter(item => hasEventType(item, 'REPORT_CARD')).map(item => item.dateStart)).toEqual(['2026-10-22', '2027-01-08', '2027-04-01'])
    expect(on('2026-08-06')).toMatchObject({ eventType: 'BACK_TO_SCHOOL_NIGHT', schoolStatus: 'not-applicable' })
    expect(on('2026-08-06').note).toContain('5:00-7:00')
    expect(on('2026-08-06').note).toContain('6:00-8:00')
    for (const day of ['2027-05-16', '2027-05-21']) {
      expect(on(day)).toMatchObject({ gradeScope: 'Senior Class', eventType: 'SCHOOL_MILESTONE', schoolStatus: 'not-applicable' })
      expect(on(day).countsAsStudentAttendanceDay).toBeUndefined()
      expect(hasEventType(on(day), 'LAST_DAY')).toBe(false)
    }
    expect(new Date('2027-05-16T00:00:00Z').getUTCDay()).toBe(0)
    expect(calendar.events.filter(item => item.dateStart! < calendar.firstDay!)).toEqual([on('2026-08-06')])
    expect(calendar.events.some(item => item.dateStart! > calendar.lastDay!)).toBe(false)
    expect(calendar.events.some(item => /new teachers|professional learning|Memorial Day|\bFTE\b|payroll/i.test(item.name))).toBe(false)
  })

  it('answers independent parent searches without transferring the prior year’s dismissal notices', () => {
    expect(calendar.faqs).toHaveLength(20)
    expect(new Set(calendar.faqs.map(item => item.question)).size).toBe(calendar.faqs.length)
    expect(calendar.faqs.find(item => item.question.startsWith('Is December 18'))?.answer).toContain('regular school day')
    expect(calendar.faqs.find(item => item.question.startsWith('What time do students'))?.answer).toContain('863-946-3800')
    expect(calendar.faqs.find(item => item.question.startsWith('When are report cards'))?.answer).toContain('does not give a final fourth-quarter')
    expect(calendar.faqs.find(item => item.question.startsWith('When is spring break'))?.answer).toContain('Tuesday, March 30')
  })

  it('exports all 30 distinct occurrences once, with one final-day multi-type event', () => {
    const ics = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
    const entries = ics.split('BEGIN:VEVENT').slice(1)
    expect(entries).toHaveLength(30)
    const entry = (day: string) => entries.find(text => text.includes('UID:' + on(day).id + '@'))!
    expect(entry('2026-11-23')).toContain('DTEND;VALUE=DATE:20261126')
    expect(entry('2026-11-23')).toContain('CATEGORIES:THANKSGIVING_BREAK,MAKEUP_DAY')
    expect(entry('2026-11-23')).toContain('hurricane make-up days if needed')
    expect(entry('2026-12-21')).toContain('DTEND;VALUE=DATE:20270102')
    expect(entry('2027-03-22')).toContain('DTEND;VALUE=DATE:20270327')
    expect(entry('2027-05-16')).toContain('Senior Class')
    expect(entry('2027-05-28')).toContain('CATEGORIES:LAST_DAY,EARLY_RELEASE,GRADING_PERIOD_END,SEMESTER_END')
    expect(ics).not.toContain('DTSTART;VALUE=DATE:20270601')
  })
})
