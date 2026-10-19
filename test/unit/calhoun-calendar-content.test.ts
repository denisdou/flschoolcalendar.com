import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/calhoun-county-school-district.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore Dependency-free publication checker.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord
const calendar = record.schoolYears['2026-2027']!
const event = (key: string) => calendar.events.find(item => item.id === 'ccsd-2026-2027-' + key)!

function weekdays(start: string, end: string) {
  const result: string[] = []
  for (const cursor = new Date(start + 'T00:00:00Z'); cursor <= new Date(end + 'T00:00:00Z'); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (![0, 6].includes(cursor.getUTCDay())) result.push(cursor.toISOString().slice(0, 10))
  }
  return result
}

function closedDates(ids = calendar.confirmedNoSchoolDayEventIds!) {
  return new Set(ids.flatMap(id => {
    const item = calendar.events.find(item => item.id === id)!
    return weekdays(item.dateStart!, item.dateEnd || item.dateStart!)
  }))
}

describe('Calhoun Florida 2026-2027 student calendar', () => {
  it('uses the matching PDF, web-confirmed approval and Central Time', () => {
    expect(record.district).toMatchObject({ id: 'FL-07', districtNumber: '07', timeZone: 'America/Chicago', name: 'Calhoun County School District' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027'])
    expect(calendar.approvedAt).toBe('2026-03-10')
    expect(calendar.sources[0]).toMatchObject({ contentHash: 'sha256:6b7c1c68b8bdbf7a04eb6a682797a52a0e35be5a713ea28ec62f5e5abd93765c', publishedAt: null })
    expect(calendar.sources[0]?.printedBoardApprovalDate).toBeUndefined()
    expect(calendar.lastOperationalUpdateAt).toBe('2026-10-07')
    expect(calendar.lastOfficialRevisionAt).toBeNull()
    expect(auditRecords([{ filename: record.district.slug + '.json', record }])).toEqual([])
  })

  it('applies the October closure once while retaining the published academic deadline', () => {
    const october = event('october-9-closure')
    expect(october).toMatchObject({ dateStart: '2026-10-09', schoolStatus: 'schools-closed', sourceId: 'ccsd-october-9-closure', countsAsStudentAttendanceDay: false })
    expect(october.eventTypes).toEqual(['EMERGENCY_CLOSURE', 'GRADING_PERIOD_END'])
    expect(calendar.events.filter(item => item.dateStart === '2026-10-09')).toEqual([october])
    expect(calendar.revisions[0]?.eventId).toBe(october.id)
    expect(calendar.breaks[0]).toMatchObject({ dateStart: '2026-10-09', dateEnd: '2026-10-13', schoolWeekdaysOff: 3, nextStudentAttendanceDate: '2026-10-14', nextStudentAttendanceDateBasis: 'official', basis: 'derived' })
    expect(calendar.events.filter(item => item.dateStart === '2026-10-13')).toEqual([event('fall-holiday-13')])
    expect(calendar.conditionalNoSchoolDayEventIds).toEqual([])
    expect(calendar.events.some(item => item.mayBecomeAttendanceDay || hasEventType(item, 'MAKEUP_DAY'))).toBe(false)
  })

  it('keeps all eight shortened attendance dates and gives times only where printed', () => {
    const shortened = calendar.events.filter(item => hasEventType(item, 'EARLY_RELEASE'))
    expect(shortened.map(item => item.dateStart)).toEqual(['2026-09-30', '2026-10-30', '2026-11-11', '2026-12-18', '2027-02-12', '2027-03-19', '2027-04-23', '2027-05-28'])
    expect(shortened.every(item => item.countsAsStudentAttendanceDay && item.schoolStatus === 'early-dismissal')).toBe(true)
    expect(shortened.filter(item => item.note?.includes('1:00 p.m.'))).toHaveLength(6)
    for (const key of ['early-release-2026-11-11', 'early-release-2027-03-19']) {
      expect(event(key).note).not.toContain('1:00')
      expect(event(key).timeSourceId).toBeNull()
      expect(closedDates().has(event(key).dateStart!)).toBe(false)
    }
    expect(calendar.schoolHours).toHaveLength(1)
    expect(calendar.schoolHours).toEqual([expect.objectContaining({ earlyReleaseTime: '1:00 p.m. Central Time', scope: expect.stringContaining('September 30, October 30 and December 18') })])
    expect(calendar.faqs.find(item => item.question.includes('Veterans Day'))?.answer).toContain('Students attend')
    expect(event('early-release-2026-12-18').eventTypes).toEqual(['EARLY_RELEASE', 'GRADING_PERIOD_END', 'SEMESTER_END'])
    expect(event('last-day').eventTypes).toEqual(['LAST_DAY', 'EARLY_RELEASE'])
  })

  it('counts Christmas workdays within the official break without duplicating them', () => {
    expect(event('christmas')).toMatchObject({ dateStart: '2026-12-21', dateEnd: '2027-01-05', dateBasis: 'official' })
    expect(event('winter-return')).toMatchObject({ dateStart: '2027-01-06', schoolStatus: 'schools-open', eventTypeBasis: 'derived' })
    expect(calendar.events.some(item => item.dateStart === '2027-01-04' || item.dateStart === '2027-01-05')).toBe(false)
    expect(calendar.breaks[2]).toMatchObject({ schoolWeekdaysOff: 12, nextStudentAttendanceDate: '2027-01-06', nextStudentAttendanceDateBasis: 'official' })
    expect(calendar.breaks[3]).toMatchObject({ dateStart: '2027-03-22', dateEnd: '2027-03-26', lastStudentAttendanceDate: '2027-03-19', nextStudentAttendanceDate: '2027-03-29', schoolWeekdaysOff: 5 })
    for (const span of calendar.breaks) {
      expect([...closedDates(span.componentEventIds!)].sort()).toEqual(weekdays(span.dateStart, span.dateEnd))
      expect(weekdays(span.dateStart, span.dateEnd)).toHaveLength(span.schoolWeekdaysOff!)
      expect(closedDates().has(span.lastStudentAttendanceDate!)).toBe(false)
      expect(closedDates().has(span.nextStudentAttendanceDate!)).toBe(false)
    }
  })

  it('calculates the current attendance total after the extra closure, without asserting an official annual figure', () => {
    expect(weekdays(calendar.firstDay!, calendar.lastDay!)).toHaveLength(207)
    expect(closedDates().size).toBe(28)
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
    expect(calendar.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value: '179 days', basis: 'derived' })
    expect(calendar.statistics.find(item => item.id === 'early-release-days')?.value).toBe('8 dates')
    expect(calendar.statistics.find(item => item.id === 'longest-no-school-stretch')?.value).toBe('18 consecutive days')
    expect(calendar.highlights.some(item => item.label === 'Student days' && item.basis === 'official')).toBe(false)
    const countFaq = calendar.faqs.find(item => item.question.includes('How many student days'))!
    expect(countFaq.answer).toContain('before any later make-up change')
    expect(countFaq.answer).toContain('PDF does not print an annual student-day total')
  })

  it('preserves separate school and grade ceremonies without changing district attendance', () => {
    const ceremonies = calendar.events.filter(item => hasEventType(item, 'SCHOOL_MILESTONE'))
    expect(ceremonies).toHaveLength(6)
    expect(ceremonies.every(item => item.gradeScope && item.schoolStatus === 'not-applicable' && item.countsAsStudentAttendanceDay === undefined)).toBe(true)
    expect(event('blountstown-graduation').dateStart).toBe('2027-05-20')
    expect(event('altha-graduation').dateStart).toBe('2027-05-21')
    expect(event('carr-kindergarten-graduation').note).toContain('8:30 a.m.')
    expect(event('carr-eighth-grade-graduation').note).toContain('9:15 a.m.')
    expect(calendar.events.filter(item => item.dateStart === '2027-05-27')).toHaveLength(2)
    for (const ceremony of ceremonies) expect(closedDates().has(ceremony.dateStart!)).toBe(false)
    expect(calendar.events.filter(item => hasEventType(item, 'REPORT_CARD')).map(item => item.dateStart)).toEqual(['2026-10-28', '2027-01-13', '2027-03-31'])
  })

  it('exports verified break endpoints and canonical dates while excluding staff and summer schedules', () => {
    const ics = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
    const entries = ics.split('BEGIN:VEVENT').slice(1)
    const find = (key: string) => entries.find(item => item.includes('UID:' + event(key).id + '@'))!
    expect(entries).toHaveLength(29)
    expect(find('christmas')).toContain('DTEND;VALUE=DATE:20270106')
    expect(find('spring-break')).toContain('DTEND;VALUE=DATE:20270327')
    expect(find('october-9-closure')).toContain('CATEGORIES:EMERGENCY_CLOSURE,GRADING_PERIOD_END')
    expect(entries.filter(item => item.includes('DTSTART;VALUE=DATE:20261009'))).toHaveLength(1)
    expect(entries.filter(item => item.includes('DTSTART;VALUE=DATE:20270528'))).toHaveLength(1)
    expect(calendar.events.some(item => /FTE|pre.?school planning|teacher work day|summer school/i.test(item.name))).toBe(false)
    expect(calendar.events.every(item => item.dateStart! >= calendar.firstDay! && item.dateStart! <= calendar.lastDay!)).toBe(true)
    expect(calendar.faqs.find(item => item.question.includes('summer school'))?.answer).toContain('endpoints do not mean every weekday')
  })
})
