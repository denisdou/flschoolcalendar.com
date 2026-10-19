import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/franklin-county-school-district.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord
const calendar = record.schoolYears['2026-2027']!
const event = (key: string) => calendar.events.find(item => item.id === 'franklin-2026-2027-' + key)!

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

describe('Franklin County Florida 2026-2027 calendar interpretation', () => {
  it('uses the matching district file and Eastern Time without treating the filename as Board approval', () => {
    expect(record.district).toMatchObject({ id: 'FL-19', districtNumber: '19', timeZone: 'America/New_York', name: 'Franklin County School District' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027'])
    expect(calendar.sources[0]?.contentHash).toBe('sha256:1a3753f192ca3ae13a5b9e5f3cc4e38fa22d9019891cd02f9ac52782b865c924')
    expect(calendar.approvedAt).toBeNull()
    expect(calendar.sourceDocumentUpdatedAt).toBeNull()
    expect(calendar.sources[0]?.printedBoardApprovalDate).toBeUndefined()
    expect(calendar.sourceDiscrepancies?.some(item => item.field === 'approvedAt')).toBe(true)
  })

  it('uses the green early-release legend on both homecoming and the last student day', () => {
    expect(calendar.events.filter(item => hasEventType(item, 'EARLY_RELEASE')).map(item => item.dateStart)).toEqual(['2026-10-16', '2027-05-27'])
    expect(event('homecoming')).toMatchObject({ schoolStatus: 'early-dismissal', countsAsStudentAttendanceDay: true })
    expect(event('last-day').eventTypes).toEqual(['LAST_DAY', 'EARLY_RELEASE', 'GRADING_PERIOD_END', 'SCHOOL_MILESTONE'])
    expect(calendar.events.filter(item => item.dateStart === '2027-05-27')).toHaveLength(1)
    expect(calendar.events.filter(item => hasEventType(item, 'GRADING_PERIOD_END')).map(item => item.dateStart)).toEqual(['2026-10-09', '2026-12-17', '2027-03-11', '2027-05-27'])
    expect(calendar.schoolHours).toEqual([])
    expect(event('homecoming').timeSourceId).toBeUndefined()
  })

  it('distinguishes school programs from closures and retains eight student-free staff dates', () => {
    const off = datesFor(calendar.confirmedNoSchoolDayEventIds!)
    for (const key of ['veterans-program', 'mlk-program']) {
      expect(event(key).schoolStatus).toBe('schools-open')
      expect(off.has(event(key).dateStart!)).toBe(false)
    }
    expect(off.has('2027-01-18')).toBe(true)
    expect(calendar.events.filter(item => hasEventType(item, 'NON_STUDENT_DAY') && /Teacher/.test(item.name)).map(item => item.dateStart)).toEqual(['2026-09-08', '2026-10-19', '2026-11-30', '2026-12-18', '2027-01-04', '2027-02-16', '2027-03-12', '2027-04-16'])
    for (const key of ['october-planning', 'december-planning', 'january-planning', 'march-planning']) expect(event(key).schoolStatusBasis).toBe('derived')
    expect(event('september-4').name).toBe('No School')
    expect(event('april-19').name).toBe('No School')
    expect(calendar.events.some(item => item.schoolStatus === 'staff-only' || /FTE|Pre-Planning|Post-Planning|Summer School Planning/.test(item.name))).toBe(false)
  })

  it('keeps named breaks separate from adjacent workdays and does not bridge March 22-25', () => {
    expect(event('thanksgiving')).toMatchObject({ dateStart: '2026-11-23', dateEnd: '2026-11-27' })
    expect(event('november-pd')).toMatchObject({ dateStart: '2026-11-30', schoolStatus: 'no-classes' })
    expect(calendar.breaks.find(item => item.name === 'Thanksgiving - no school')).toMatchObject({ nextStudentAttendanceDate: '2026-12-01', nextStudentAttendanceDateBasis: 'derived', schoolWeekdaysOff: 5 })
    expect(event('christmas-new-year')).toMatchObject({ dateStart: '2026-12-21', dateEnd: '2027-01-01' })
    expect(calendar.breaks.find(item => item.name === 'Christmas/New Year - no school')).toMatchObject({ lastStudentAttendanceDate: '2026-12-17', nextStudentAttendanceDate: '2027-01-05', nextStudentAttendanceDateBasis: 'official', schoolWeekdaysOff: 10 })
    expect(event('winter-return')).toMatchObject({ dateStart: '2027-01-05', dateBasis: 'official' })
    expect(event('spring-break')).toMatchObject({ dateStart: '2027-03-15', dateEnd: '2027-03-19' })
    expect(event('easter-break')).toMatchObject({ dateStart: '2027-03-26', dateEnd: '2027-03-29' })
    const off = datesFor(calendar.confirmedNoSchoolDayEventIds!)
    for (const date of weekdays('2027-03-22', '2027-03-25')) expect(off.has(date)).toBe(false)
    for (const span of calendar.breaks) {
      expect([...datesFor(span.componentEventIds!)].sort()).toEqual(weekdays(span.dateStart, span.dateEnd))
      expect(weekdays(span.dateStart, span.dateEnd)).toHaveLength(span.schoolWeekdaysOff!)
      expect(off.has(span.lastStudentAttendanceDate!)).toBe(false)
      expect(off.has(span.nextStudentAttendanceDate!)).toBe(false)
    }
  })

  it('scopes senior dates separately and calculates the regular non-senior attendance total', () => {
    expect(event('senior-last-day')).toMatchObject({ dateStart: '2027-05-14', gradeScope: 'Seniors at Franklin County School' })
    expect(event('senior-recognition')).toMatchObject({ dateStart: '2027-05-25', schoolStatus: 'not-applicable' })
    expect(event('last-day').gradeScope).toBeUndefined()
    expect(calendar.lastDay).toBe('2027-05-27')
    expect(calendar.events.filter(item => hasEventType(item, 'REPORT_CARD')).map(item => item.dateStart)).toEqual(['2026-10-15', '2027-01-07', '2027-03-25', '2027-06-03'])
    expect(event('final-report-cards').countsAsStudentAttendanceDay).toBeUndefined()
    const off = datesFor(calendar.confirmedNoSchoolDayEventIds!)
    expect(weekdays(calendar.firstDay!, calendar.lastDay!)).toHaveLength(208)
    expect(off.size).toBe(38)
    expect(weekdays(calendar.firstDay!, calendar.lastDay!).filter(date => !off.has(date))).toHaveLength(170)
    expect(calendar.conditionalNoSchoolDayEventIds).toEqual([])
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
    expect(calendar.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value: '170 days', basis: 'derived' })
    expect(calendar.statistics.find(item => item.id === 'longest-no-school-stretch')?.value).toBe('18 consecutive days')
  })

  it('stores seven assessment windows without converting holidays or staff dates into class days', () => {
    const windows = calendar.events.filter(item => item.isWindow)
    expect(windows.map(item => [item.dateStart, item.dateEnd])).toEqual([
      ['2026-08-03', '2026-09-25'],
      ['2026-09-08', '2026-10-02'],
      ['2026-11-30', '2027-01-22'],
      ['2026-11-30', '2026-12-18'],
      ['2027-03-29', '2027-04-09'],
      ['2027-04-12', '2027-05-28'],
      ['2027-05-03', '2027-05-28'],
    ])
    expect(windows.every(item => item.eventType === 'STATE_TEST' && item.schoolStatus === 'not-applicable' && item.gradeScope)).toBe(true)
    expect(windows.every(item => item.countsAsStudentAttendanceDay === undefined)).toBe(true)
    expect(datesFor(calendar.confirmedNoSchoolDayEventIds!).has(event('writing').dateStart!)).toBe(true)
    expect(calendar.events.some(item => item.dateStart === '2027-05-28')).toBe(false)
    expect(calendar.events.some(item => item.eventType === 'SUMMER_PROGRAM')).toBe(false)
    expect(calendar.faqs.find(item => item.question === 'When does summer school meet?')?.answer).toContain('Monday through Thursday')
  })

  it('exports exact break and window endpoints and preserves the one May 27 occurrence', () => {
    const ics = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
    const entries = ics.split('BEGIN:VEVENT').slice(1)
    const find = (key: string) => entries.find(item => item.includes('UID:' + event(key).id + '@'))!
    expect(entries).toHaveLength(43)
    expect(find('thanksgiving')).toContain('DTEND;VALUE=DATE:20261128')
    expect(find('christmas-new-year')).toContain('DTEND;VALUE=DATE:20270102')
    expect(find('easter-break')).toContain('DTEND;VALUE=DATE:20270330')
    expect(find('fast-pm-3')).toContain('DTEND;VALUE=DATE:20270529')
    expect(find('fast-pm-3')).toContain('published assessment window')
    expect(find('last-day')).toContain('CATEGORIES:LAST_DAY,EARLY_RELEASE,GRADING_PERIOD_END,SCHOOL_MILESTONE')
    expect(entries.filter(item => item.includes('DTSTART;VALUE=DATE:20270527'))).toHaveLength(1)
    expect(find('final-report-cards')).toContain('DTSTART;VALUE=DATE:20270603')
  })
})
