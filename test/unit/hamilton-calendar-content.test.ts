import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/hamilton-county-school-district.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord
const calendar = record.schoolYears['2026-2027']!
const event = (key: string) => calendar.events.find(e => e.id === 'hamilton-2026-2027-' + key)!
function weekdays(start: string, end: string) {
  const dates: string[] = []
  for (const d = new Date(start + 'T00:00:00Z'); d <= new Date(end + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    if (![0, 6].includes(d.getUTCDay())) dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}
function datesFor(ids: string[]) {
  return new Set(ids.flatMap(id => {
    const e = calendar.events.find(e => e.id === id)!
    return weekdays(e.dateStart!, e.dateEnd || e.dateStart!)
  }))
}
const off = () => datesFor(calendar.confirmedNoSchoolDayEventIds!)

describe('Hamilton County Florida 2026-2027 calendar interpretation', () => {
  it('uses the matching district PDF, Eastern Time and the printed HCSB approval date', () => {
    expect(record.district).toMatchObject({ id: 'FL-24', districtNumber: '24', timeZone: 'America/New_York', name: 'Hamilton County School District' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027'])
    expect(calendar.sources[0]).toMatchObject({ contentHash: 'sha256:2b31ecedd641c57f67455288a63f0c19c2fa51d70ee3fb5be102ad31ac2d51bc', printedBoardApprovalDate: '2026-04-14' })
    expect(calendar.approvedAt).toBe('2026-04-14')
    expect(calendar.sourceDocumentUpdatedAt).toBeNull()
    expect(calendar.lastOfficialRevisionAt).toBeNull()
  })

  it('uses seven explicitly labeled early dismissals and does not infer an eighth from the first-day asterisk', () => {
    expect(calendar.events.filter(e => hasEventType(e, 'EARLY_RELEASE')).map(e => e.dateStart)).toEqual([
      '2026-10-09', '2026-11-20', '2026-12-17', '2026-12-18', '2027-03-24', '2027-05-20', '2027-05-21',
    ])
    expect(event('first-day')).toMatchObject({ dateStart: '2026-08-10', schoolStatus: 'schools-open', countsAsStudentAttendanceDay: true })
    expect(hasEventType(event('first-day'), 'EARLY_RELEASE')).toBe(false)
    expect(event('quarter-3-end')).toMatchObject({ dateStart: '2027-03-19', schoolStatus: 'schools-open' })
    expect(event('good-friday')).toMatchObject({ dateStart: '2027-03-26', schoolStatus: 'no-classes' })
    expect(calendar.events.some(e => hasEventType(e, 'EXAM') || hasEventType(e, 'FINAL_EXAM'))).toBe(false)
    expect(calendar.schoolHours).toEqual([])
  })

  it('keeps one occurrence for homecoming, each shortened quarter end and the last student day', () => {
    expect(event('homecoming').eventTypes).toEqual(['EARLY_RELEASE', 'GRADING_PERIOD_END', 'SCHOOL_MILESTONE'])
    expect(event('quarter-2-end').eventTypes).toEqual(['EARLY_RELEASE', 'GRADING_PERIOD_END', 'SEMESTER_END'])
    expect(event('last-day').eventTypes).toEqual(['LAST_DAY', 'EARLY_RELEASE', 'GRADING_PERIOD_END', 'SEMESTER_END', 'SCHOOL_MILESTONE'])
    for (const key of ['homecoming', 'quarter-2-end', 'may-early', 'last-day']) expect(calendar.events.filter(e => e.dateStart === event(key).dateStart)).toHaveLength(1)
    expect(calendar.events.filter(e => hasEventType(e, 'GRADING_PERIOD_END')).map(e => e.dateStart)).toEqual(['2026-10-09', '2026-12-18', '2027-03-19', '2027-05-21'])
  })

  it('preserves exactly six in-year student-free staff days and excludes employee-only calendar entries', () => {
    expect(calendar.events.filter(e => hasEventType(e, 'NON_STUDENT_DAY')).map(e => e.dateStart)).toEqual(['2026-09-08', '2026-10-12', '2027-01-04', '2027-01-05', '2027-02-16', '2027-03-25'])
    expect(calendar.events.filter(e => hasEventType(e, 'NON_STUDENT_DAY')).every(e => e.schoolStatus === 'no-classes' && e.countsAsStudentAttendanceDay === false)).toBe(true)
    expect(calendar.events.some(e => /Preplanning|Post Planning|Health Fair|4-Day Work|Memorial Day/i.test(e.name) || e.schoolStatus === 'staff-only')).toBe(false)
    expect(event('meet-teacher').timeSourceId).toBe('hamilton-senior-calendar')
    expect(event('meet-teacher').note).toContain('HCHS senior calendar gives 4–7 p.m.')
    expect(event('meet-teacher').note).toContain('school and grade')
  })

  it('keeps Christmas Holidays within December 2026 and treats January holidays and staff days separately', () => {
    expect(event('christmas')).toMatchObject({ dateStart: '2026-12-21', dateEnd: '2026-12-31' })
    expect(event('new-year')).toMatchObject({ dateStart: '2027-01-01', dateEnd: null })
    expect(event('winter-return')).toMatchObject({ dateStart: '2027-01-06', dateBasis: 'official', countsAsStudentAttendanceDay: true })
    expect(calendar.breaks.find(b => b.name === 'Christmas Holidays')).toMatchObject({ schoolWeekdaysOff: 9, nextStudentAttendanceDate: '2027-01-06', nextStudentAttendanceDateBasis: 'official' })
    expect(calendar.sourceDiscrepancies?.some(d => d.field === 'christmasHolidayYear' && d.effect.includes('2025'))).toBe(true)
    expect(calendar.events.some(e => e.dateStart?.startsWith('2025'))).toBe(false)
  })

  it('joins the continuous March-April spring range without absorbing earlier attendance days', () => {
    expect(event('spring-break')).toMatchObject({ dateStart: '2027-03-29', dateEnd: '2027-04-02', dateBasis: 'official' })
    expect(calendar.breaks.find(b => b.name === 'Spring Break')).toMatchObject({ lastStudentAttendanceDate: '2027-03-24', nextStudentAttendanceDate: '2027-04-05', schoolWeekdaysOff: 5 })
    for (const d of weekdays('2027-03-25', '2027-04-02')) expect(off().has(d)).toBe(true)
    for (const d of weekdays('2027-03-22', '2027-03-24')) expect(off().has(d)).toBe(false)
    for (const b of calendar.breaks) {
      expect([...datesFor(b.componentEventIds!)].sort()).toEqual(weekdays(b.dateStart, b.dateEnd))
      expect(weekdays(b.dateStart, b.dateEnd)).toHaveLength(b.schoolWeekdaysOff!)
      expect(off().has(b.lastStudentAttendanceDate!)).toBe(false)
      expect(off().has(b.nextStudentAttendanceDate!)).toBe(false)
    }
  })

  it('uses the date-supported printed 174 and discloses the conflicting staff reference to 175', () => {
    expect(weekdays(calendar.firstDay!, calendar.lastDay!)).toHaveLength(205)
    expect(off().size).toBe(31)
    expect(weekdays(calendar.firstDay!, calendar.lastDay!).filter(d => !off().has(d))).toHaveLength(174)
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar, { preserveStoredBreakWording: true }))
    expect(calendar.statistics.find(s => s.id === 'approved-calendar-instructional-days')).toMatchObject({ value: '174 days', basis: 'official' })
    expect(calendar.statistics.find(s => s.id === 'approved-calendar-instructional-days')?.explanation).toContain('175')
    expect(calendar.sourceDiscrepancies?.some(d => d.field === 'studentDayTotal' && d.resolution === 'source-conflict')).toBe(true)
    expect(calendar.statistics.find(s => s.id === 'longest-no-school-stretch')?.value).toBe('18 consecutive days')
    expect(calendar.conditionalNoSchoolDayEventIds).toEqual([])
    expect(calendar.events.some(e => hasEventType(e, 'EMERGENCY_CLOSURE') || hasEventType(e, 'MAKEUP_DAY'))).toBe(false)
  })

  it('stores all dated progress and grade reports without inventing a final report-card date', () => {
    expect(calendar.events.filter(e => hasEventType(e, 'PROGRESS_REPORT')).map(e => e.dateStart)).toEqual(['2026-09-10', '2026-11-12', '2027-02-11', '2027-04-22'])
    expect(calendar.events.filter(e => hasEventType(e, 'REPORT_CARD')).map(e => e.dateStart)).toEqual(['2026-10-15', '2027-01-07', '2027-04-08'])
    expect(calendar.faqs.find(f => f.question === 'When are report cards sent out in 2026–2027?')?.answer).toContain('school offices')
    expect(calendar.events.some(e => e.dateStart! > calendar.lastDay!)).toBe(false)
  })

  it('scopes ceremony clock times to graduates and keeps the weather backup out of regular attendance', () => {
    expect(event('may-early').note).toContain('separate evening ceremony at 7 p.m.')
    expect(event('last-day').note).toContain('graduation is scheduled for 8 p.m.')
    expect(event('last-day').timeSourceId).toBe('hamilton-graduation-plan')
    expect(event('last-day').gradeScope).toBeUndefined()
    expect(event('last-day').countsAsStudentAttendanceDay).toBe(true)
    expect(calendar.faqs.find(f => f.question === 'Is graduation practice mandatory for HCHS seniors?')?.answer).toContain('will not be allowed to walk')
    expect(calendar.faqs.find(f => f.question === 'What happens if bad weather affects HCHS graduation?')?.answer).toContain('Saturday, May 22, 2027 at 10 a.m.')
    expect(calendar.events.some(e => e.dateStart === '2027-05-22')).toBe(false)
  })

  it('exports inclusive holidays and every classification in the single final-day occurrence', () => {
    const entries = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '').split('BEGIN:VEVENT').slice(1)
    const find = (key: string) => entries.find(e => e.includes('UID:' + event(key).id + '@'))!
    expect(entries).toHaveLength(33)
    expect(find('thanksgiving')).toContain('DTEND;VALUE=DATE:20261128')
    expect(find('christmas')).toContain('DTEND;VALUE=DATE:20270101')
    expect(find('spring-break')).toContain('DTEND;VALUE=DATE:20270403')
    expect(entries.filter(e => e.includes('DTSTART;VALUE=DATE:20270521'))).toHaveLength(1)
    expect(find('last-day')).toContain('CATEGORIES:LAST_DAY,EARLY_RELEASE,GRADING_PERIOD_END,SEMESTER_END,SCHOOL_MILESTONE')
    expect(find('last-day')).toContain('graduation is scheduled for 8 p.m.')
    expect(find('first-day')).toContain('CATEGORIES:FIRST_DAY')
  })
})
