import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DistrictCalendar, DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/gadsden-county-school-district.json'
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

describe('Gadsden scanned student calendar and employee-calendar boundaries', () => {
  it('uses the approved student source with Eastern Time and keeps later downloads separate', () => {
    expect(record.district).toMatchObject({ id: 'FL-20', timeZone: 'America/New_York' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027'])
    expect(calendar).toMatchObject({ approvedAt: '2026-01-27', firstDay: '2026-08-11', lastDay: '2027-05-26', publishedAt: null, sourceDocumentUpdatedAt: null })
    expect(calendar.sources[0]).toMatchObject({ type: 'official-pdf', printedBoardApprovalDate: '2026-01-27', url: calendar.actions.officialPdfUrl, contentHash: 'sha256:48f6522b18cba5785900836d6d7c910f6c8f57a4c2032f80b6677b8221e99529' })
    expect(record.page.relatedResources.some(item => item.label.includes('2027-2028') && item.href.includes('18f409681bf74b4f8e5d7e9941127c87'))).toBe(true)
    expect(auditRecords([{ filename: record.district.slug + '.json', record }])).toEqual([])
  })

  it('extends Thanksgiving across its student-free Friday and winter through January planning', () => {
    expect(on('2026-11-20')).toMatchObject({ eventType: 'STAFF_DEVELOPMENT', schoolStatus: 'no-classes' })
    expect(on('2026-11-23').dateEnd).toBe('2026-11-27')
    expect(on('2026-12-21').dateEnd).toBe('2026-12-31')
    expect(on('2027-01-01').eventType).toBe('HOLIDAY')
    expect(on('2027-01-04').schoolStatus).toBe('no-classes')
    expect(on('2027-01-05')).toMatchObject({ eventType: 'SCHOOL_MILESTONE', eventTypeBasis: 'derived', name: 'Students Return', schoolStatus: 'schools-open', countsAsStudentAttendanceDay: true })
    expect(calendar.breaks.map(item => [item.dateStart, item.dateEnd, item.nextStudentAttendanceDate, item.schoolWeekdaysOff])).toEqual([
      ['2026-11-20', '2026-11-29', '2026-11-30', 6],
      ['2026-12-19', '2027-01-04', '2027-01-05', 11],
      ['2027-03-13', '2027-03-21', '2027-03-22', 5],
    ])
    const off = offDates(calendar.confirmedNoSchoolDayEventIds!)
    for (const span of calendar.breaks) {
      expect([...offDates(span.componentEventIds!)].sort()).toEqual(weekdays(span.dateStart, span.dateEnd))
      expect(off.has(span.nextStudentAttendanceDate!)).toBe(false)
      expect(off.has(span.lastStudentAttendanceDate!)).toBe(false)
      expect(span.basis).toBe('derived')
    }
    expect(calendar.breaks[1]!.nextStudentAttendanceDateBasis).toBe('official')
  })

  it('keeps four regular school days between spring break and Good Friday', () => {
    const off = offDates(calendar.confirmedNoSchoolDayEventIds!)
    for (const day of weekdays('2027-03-22', '2027-03-25')) expect(off.has(day)).toBe(false)
    expect(on('2027-03-15')).toMatchObject({ dateEnd: '2027-03-19', eventType: 'SPRING_BREAK' })
    expect(on('2027-03-26')).toMatchObject({ eventType: 'HOLIDAY', name: 'Good Friday (District Holiday)', schoolStatus: 'no-classes' })
    expect(calendar.breaks.some(span => span.dateStart <= '2027-03-19' && span.dateEnd >= '2027-03-26')).toBe(false)
    expect(calendar.faqs.find(item => item.question.startsWith('Does spring break continue'))?.answer).toMatch(/^No\./)
  })

  it('preserves the bus-calendar March 5 wording without asserting a third student half day', () => {
    const march = on('2027-03-05')
    expect(march).toMatchObject({ eventType: 'GRADING_PERIOD_END', schoolStatus: 'not-applicable', sourceInternalConflict: true, sourceConflict: true, conflictField: 'studentDismissalSchedule' })
    expect(march.note).toContain('bus drivers and aides')
    expect(hasEventType(march, 'HALF_DAY')).toBe(false)
    expect(calendar.confirmedNoSchoolDayEventIds).not.toContain(march.id)
    expect(calendar.sourceDiscrepancies).toContainEqual(expect.objectContaining({ field: 'march5StudentDismissal', resolution: 'unresolved' }))
    expect(calendar.attendanceUncertaintyDates).toBeUndefined()
    expect(calendar.statistics.find(item => item.id === 'half-days')).toMatchObject({ value: '2 dates' })
    expect(calendar.earlyReleaseStatisticExplanation).toContain('March 5')
  })

  it('reconciles the derived 179 attendance dates and never substitutes employee totals', () => {
    const off = offDates(calendar.confirmedNoSchoolDayEventIds!)
    expect(weekdays(calendar.firstDay!, calendar.lastDay!)).toHaveLength(207)
    expect(off.size).toBe(28)
    expect(weekdays(calendar.firstDay!, calendar.lastDay!).filter(day => !off.has(day))).toHaveLength(179)
    expect(calendar.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value: '179 days', basis: 'derived' })
    expect(calendar.statistics.find(item => item.id === 'longest-no-school-stretch')).toMatchObject({ value: '17 consecutive days' })
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
    expect(calendar.highlights.some(item => item.label === 'Student days' && item.basis === 'official')).toBe(false)
    expect(calendar.events.filter(item => hasEventType(item, 'HALF_DAY'))).toHaveLength(2)
    expect(on('2027-05-26').eventTypes).toEqual(['LAST_DAY', 'HALF_DAY', 'GRADING_PERIOD_END'])
    for (const day of ['2026-12-18', '2027-05-26']) expect(off.has(day)).toBe(false)
  })

  it('omits staff-only dates and avoids carrying old bell times or make-up rules forward', () => {
    expect(calendar.events.every(item => item.dateStart! >= calendar.firstDay! && (item.dateEnd || item.dateStart!) <= calendar.lastDay!)).toBe(true)
    expect(calendar.events.some(item => /\bFTE\b|paid holiday|payroll|report to work|last workday|pre-planning|post planning|Memorial Day/i.test(item.name))).toBe(false)
    expect(calendar.events.some(item => ['MAKEUP_DAY', 'REPORT_CARD', 'SEMESTER_START', 'SEMESTER_END'].includes(item.eventType))).toBe(false)
    expect(calendar.schoolHours).toEqual([])
    expect(calendar.conditionalNoSchoolDayEventIds).toEqual([])
    expect(calendar.sources.find(item => item.id === 'gadsden-previous-hours')?.label).toContain('2025-2026')
  })

  it('provides separate parent intents with visible source limitations', () => {
    expect(calendar.faqs).toHaveLength(17)
    expect(new Set(calendar.faqs.map(item => item.question)).size).toBe(calendar.faqs.length)
    expect(calendar.faqs.find(item => item.question.startsWith('Is March 5'))?.answer).toContain('Confirm dismissal')
    expect(calendar.faqs.find(item => item.question.startsWith('How many student'))?.answer).toContain('not a district-printed annual total')
    expect(calendar.faqs.find(item => item.question.startsWith('What time do'))?.answer).toContain('850-627-6858')
  })

  it('exports canonical events once and ends holiday ranges on the following date', () => {
    const ics = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
    const entries = ics.split('BEGIN:VEVENT').slice(1)
    expect(entries).toHaveLength(18)
    const entry = (day: string) => entries.find(text => text.includes('UID:' + on(day).id + '@'))!
    expect(entry('2026-11-23')).toContain('DTEND;VALUE=DATE:20261128')
    expect(entry('2026-12-21')).toContain('DTEND;VALUE=DATE:20270101')
    expect(entry('2027-03-15')).toContain('DTEND;VALUE=DATE:20270320')
    expect(entry('2027-03-05')).toContain('CATEGORIES:GRADING_PERIOD_END')
    expect(entry('2027-03-05')).not.toContain('CATEGORIES:HALF_DAY')
    expect(entry('2027-03-05')).toContain('Confirm your school')
    expect(entry('2027-05-26')).toContain('CATEGORIES:LAST_DAY,HALF_DAY,GRADING_PERIOD_END')
  })
})
