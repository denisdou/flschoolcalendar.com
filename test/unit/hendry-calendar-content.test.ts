import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CalendarSchoolHours, DistrictCalendar, DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/hendry-county-school-district.json'
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

describe('Hendry approved scan, January return and school-specific regular hours', () => {
  it('preserves the printed Board stamp and matching current source without treating the scan date as publication', () => {
    expect(record.district).toMatchObject({ id: 'FL-26', timeZone: 'America/New_York' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027'])
    expect(calendar).toMatchObject({ firstDay: '2026-08-10', lastDay: '2027-05-28', approvedAt: '2026-02-17', printedBoardApprovalDate: '2026-02-17', publishedAt: null, lastOfficialRevisionAt: null })
    expect(calendar.sources[0]).toMatchObject({ contentHash: 'sha256:26da5935b209c3cbe3c75c5df922ab0c0ad7378e6c2a170c6e1c76e979c26323', printedBoardApprovalDate: '2026-02-17' })
    expect(calendar.actions.officialPdfUrl).toContain('562edc0f-ac26-430d-9f70-126f09f5269e')
    expect(auditRecords([{ filename: record.district.slug + '.json', record }])).toEqual([])
  })

  it('derives 178 attendance days from 210 weekdays less 32 closures, keeping shortened days as attendance', () => {
    const off = offDates(calendar.confirmedNoSchoolDayEventIds!)
    expect(weekdays(calendar.firstDay!, calendar.lastDay!)).toHaveLength(210)
    expect(off.size).toBe(32)
    expect(weekdays(calendar.firstDay!, calendar.lastDay!).filter(day => !off.has(day))).toHaveLength(178)
    expect(calendar.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value: '178 days', basis: 'derived' })
    expect(calendar.highlights.find(item => item.label === 'Student days')?.note).toContain('PDF prints no annual student-day total')
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
    expect(calendar.conditionalNoSchoolDayEventIds).toEqual([])
    expect(calendar.events.some(item => hasEventType(item, 'MAKEUP_DAY') || item.mayBecomeAttendanceDay)).toBe(false)
  })

  it('checks all weekdays in continuous breaks and preserves the explicit January 6 return', () => {
    expect(calendar.breaks.map(item => [item.dateStart, item.dateEnd, item.nextStudentAttendanceDate, item.schoolWeekdaysOff])).toEqual([
      ['2026-10-10', '2026-10-18', '2026-10-19', 5],
      ['2026-11-21', '2026-11-29', '2026-11-30', 5],
      ['2026-12-19', '2027-01-05', '2027-01-06', 12],
      ['2027-03-13', '2027-03-21', '2027-03-22', 5],
      ['2027-03-26', '2027-03-29', '2027-03-30', 2],
    ])
    const off = offDates(calendar.confirmedNoSchoolDayEventIds!)
    for (const span of calendar.breaks) {
      expect([...offDates(span.componentEventIds!)].sort()).toEqual(weekdays(span.dateStart, span.dateEnd))
      expect(off.has(span.lastStudentAttendanceDate!)).toBe(false)
      expect(off.has(span.nextStudentAttendanceDate!)).toBe(false)
    }
    expect(calendar.breaks[2]!.nextStudentAttendanceDateBasis).toBe('official')
    expect(on('2027-01-04')).toMatchObject({ schoolStatus: 'no-classes', schoolStatusBasis: 'derived' })
    expect(on('2027-01-05')).toMatchObject({ schoolStatus: 'no-classes', schoolStatusBasis: 'derived' })
    expect(on('2027-01-06')).toMatchObject({ name: 'Students Return', schoolStatus: 'schools-open', countsAsStudentAttendanceDay: true })
  })

  it('keeps four attendance dates between spring break and the Easter holiday', () => {
    const off = offDates(calendar.confirmedNoSchoolDayEventIds!)
    for (const day of weekdays('2027-03-22', '2027-03-25')) expect(off.has(day)).toBe(false)
    expect(on('2027-03-15')).toMatchObject({ dateEnd: '2027-03-19', eventType: 'SPRING_BREAK' })
    expect(on('2027-03-26')).toMatchObject({ dateEnd: '2027-03-29', eventType: 'HOLIDAY', dateBasis: 'official' })
    expect(calendar.breaks[3]!.componentEventIds).not.toContain(on('2027-03-26').id)
  })

  it('reads seven gray/pink early releases without moving quarter endings or shortening the last day', () => {
    const early = calendar.events.filter(item => hasEventType(item, 'EARLY_RELEASE'))
    expect(early.map(item => item.dateStart)).toEqual(['2026-09-23', '2026-10-09', '2026-11-18', '2026-12-18', '2027-02-10', '2027-03-12', '2027-04-14'])
    for (const event of early) {
      expect(event.schoolStatus).toBe('early-dismissal')
      expect(event.countsAsStudentAttendanceDay).toBe(true)
      expect(calendar.confirmedNoSchoolDayEventIds).not.toContain(event.id)
    }
    expect(calendar.events.filter(item => hasEventType(item, 'GRADING_PERIOD_END')).map(item => item.dateStart)).toEqual(['2026-10-08', '2026-12-17', '2027-03-11', '2027-05-28'])
    expect(on('2027-05-28')).toMatchObject({ eventTypes: ['LAST_DAY', 'GRADING_PERIOD_END'], schoolStatus: 'schools-open', countsAsStudentAttendanceDay: true })
    expect(hasEventType(on('2027-05-28'), 'EARLY_RELEASE')).toBe(false)
    expect(calendar.events.some(item => hasEventType(item, 'SEMESTER_END'))).toBe(false)
  })

  it('distinguishes October report-card release from staff grade deadlines and excludes employee-year events', () => {
    expect(calendar.events.filter(item => hasEventType(item, 'REPORT_CARD'))).toEqual([on('2026-10-20')])
    expect(on('2026-10-20')).toMatchObject({ sourceId: 'hendry-calendar-page', name: 'Report Cards Go Home', schoolStatus: 'not-applicable' })
    expect(calendar.events.every(item => item.dateStart! >= calendar.firstDay! && item.dateStart! <= calendar.lastDay!)).toBe(true)
    expect(calendar.events.some(item => /grades due|posting window|11 month|Memorial|payroll|support staff/i.test(item.name))).toBe(false)
    expect(calendar.faqs.find(item => item.question.startsWith('When do report cards'))?.answer).toContain('October 20')
    expect(calendar.faqs.find(item => item.question.startsWith('Is there school on Veterans'))?.answer).toContain('scheduled school day')
    expect(new Set(calendar.faqs.map(item => item.question)).size).toBe(calendar.faqs.length)
    expect(calendar.faqs).toHaveLength(19)
  })

  it('uses the 2026-27 student hours column, preserving CELC parent/bus differences and withholding unprinted release clocks', () => {
    const rows = calendar.schoolHours as CalendarSchoolHours[]
    expect(rows).toHaveLength(10)
    const row = (school: string) => rows.find(item => item.scope === school)!
    expect(row('Clewiston High School').regularHours).toBe('7:30 a.m.-2:30 p.m.')
    expect(row('LaBelle High School').regularHours).toBe('7:30 a.m.-2:40 p.m.')
    expect(row('LaBelle Middle School').regularHours).toBe('7:20 a.m.-2:15 p.m.')
    expect(row('Clewiston Early Learning Center').regularHours).toContain('parent dismissal 2:30 p.m.; bus dismissal 2:50 p.m.')
    expect(row('LaBelle Elementary School').note).toContain('parent drop-off: 7:40 a.m.')
    for (const item of rows) {
      expect(item.sourceId).toBe('hendry-2026-2027-school-times')
      expect(item.effectiveThrough).toBeNull()
      expect(item.earlyReleaseTime).toBeUndefined()
    }
    expect(rows.some(item => /Montura/.test(item.scope))).toBe(false)
    expect(calendar.sources.find(item => item.id === 'hendry-2026-2027-school-times')?.contentHash).toBe('sha256:e9bc2ca40e58b909ba366741c57b89ee6e3ee0f2c7e690e29c5421fde3623dcb')
  })

  it('exports every student occurrence once and uses exclusive range endings without adding post-year holidays', () => {
    const ics = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
    const entries = ics.split('BEGIN:VEVENT').slice(1)
    expect(entries).toHaveLength(24)
    const entry = (day: string) => entries.find(text => text.includes('UID:' + on(day).id + '@'))!
    expect(entry('2026-10-12')).toContain('DTEND;VALUE=DATE:20261017')
    expect(entry('2026-12-21')).toContain('DTEND;VALUE=DATE:20270102')
    expect(entry('2027-03-15')).toContain('DTEND;VALUE=DATE:20270320')
    expect(entry('2027-03-26')).toContain('DTEND;VALUE=DATE:20270330')
    expect(entry('2027-05-28')).toContain('CATEGORIES:LAST_DAY,GRADING_PERIOD_END')
    expect(entry('2027-05-28')).not.toContain('EARLY_RELEASE')
    expect(ics).not.toContain('DTSTART;VALUE=DATE:20270531')
  })
})
