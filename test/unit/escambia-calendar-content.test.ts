import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DistrictCalendar, DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/escambia-county-school-district.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore Dependency-free content audit.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord
const calendars = Object.values(record.schoolYears)
const [current, next, later] = calendars as [DistrictCalendar, DistrictCalendar, DistrictCalendar]
const eventOn = (calendar: DistrictCalendar, day: string) => calendar.events.find(event => event.dateStart === day)!
function weekdays(start: string, end: string) {
  const days: string[] = []
  for (const d = new Date(start + 'T00:00:00Z'); d <= new Date(end + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    if (![0, 6].includes(d.getUTCDay())) days.push(d.toISOString().slice(0, 10))
  }
  return days
}
function noClassDates(calendar: DistrictCalendar, ids: string[]) {
  return new Set(ids.flatMap(id => {
    const event = calendar.events.find(item => item.id === id)!
    return weekdays(event.dateStart!, event.dateEnd || event.dateStart!)
  }))
}

describe('Escambia three-year student calendars', () => {
  it('publishes only verified years with printed approval and Central Time', () => {
    expect(record.district).toMatchObject({ id: 'FL-17', timeZone: 'America/Chicago' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027', '2027-2028', '2028-2029'])
    expect(auditRecords([{ filename: record.district.slug + '.json', record }])).toEqual([])
    for (const calendar of calendars) {
      expect(calendar.approvedAt).toBe('2025-02-18')
      expect(calendar.publishedAt).toBeNull()
      expect(calendar.sources[0]).toMatchObject({ type: 'official-pdf', printedBoardApprovalDate: '2025-02-18', url: calendar.actions.officialPdfUrl })
      expect(calendar.sources[0]!.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
    }
  })

  it('reconciles every printed quarter and annual total without counting half days as days off', () => {
    const boundaries = [
      [['2026-08-12', '2026-10-09', 42], ['2026-10-13', '2026-12-18', 43], ['2027-01-05', '2027-03-12', 47], ['2027-03-15', '2027-05-25', 46]],
      [['2027-08-11', '2027-10-08', 42], ['2027-10-12', '2027-12-17', 43], ['2028-01-04', '2028-03-10', 47], ['2028-03-13', '2028-05-23', 46]],
      [['2028-08-10', '2028-10-13', 45], ['2028-10-16', '2028-12-20', 42], ['2029-01-08', '2029-03-09', 43], ['2029-03-12', '2029-05-23', 48]],
    ] as const
    calendars.forEach((calendar, i) => {
      const fixed = noClassDates(calendar, calendar.confirmedNoSchoolDayEventIds!)
      const conditional = noClassDates(calendar, calendar.conditionalNoSchoolDayEventIds!)
      const all = new Set([...fixed, ...conditional])
      expect(weekdays(calendar.firstDay!, calendar.lastDay!)).toHaveLength(205)
      expect(fixed.size).toBe(7)
      expect(conditional.size).toBe(20)
      for (const [start, end, count] of boundaries[i]!) expect(weekdays(start, end).filter(day => !all.has(day))).toHaveLength(count)
      expect(calendar.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value: '178 days', basis: 'official' })
      expect(calendar.statistics.find(item => item.id === 'total-no-school-weekdays')?.value).toBe('7 weekdays')
      expect(calendar.statistics.find(item => item.id === 'longest-no-school-stretch')).toMatchObject({ label: 'Longest fixed no-class stretch' })
      expect(calendar.statistics.find(item => item.id === 'longest-no-school-stretch')?.explanation).toContain('make-up days are excluded')
      expect(calendar.events.filter(item => hasEventType(item, 'HALF_DAY'))).toHaveLength(2)
      for (const event of calendar.events.filter(item => hasEventType(item, 'HALF_DAY'))) {
        expect(event.countsAsStudentAttendanceDay).toBe(true)
        expect(all.has(event.dateStart!)).toBe(false)
      }
    })
  })

  it('preserves the general break-day make-up condition without inventing activated reserves', () => {
    for (const calendar of calendars) {
      expect(calendar.conditionalNoSchoolDayEventIds).toHaveLength(3)
      for (const id of calendar.conditionalNoSchoolDayEventIds!) {
        const event = calendar.events.find(item => item.id === id)!
        expect(event).toMatchObject({ scheduledAsNoSchool: true, mayBecomeAttendanceDay: true, countsAsStudentAttendanceDayUnderPublishedSchedule: false, schoolStatus: 'no-classes' })
        expect(event.countsAsStudentAttendanceDay).toBeUndefined()
        expect(calendar.confirmedNoSchoolDayEventIds).not.toContain(id)
        expect(event.note).toContain('make-up days')
      }
      expect(calendar.events.some(item => hasEventType(item, 'MAKEUP_DAY'))).toBe(false)
    }
  })

  it('resolves the 2028 Christmas caption against its half-day and grading evidence', () => {
    expect(eventOn(later, '2028-12-20')).toMatchObject({ eventTypes: ['HALF_DAY', 'GRADING_PERIOD_END'], countsAsStudentAttendanceDay: true, schoolStatus: 'early-dismissal' })
    expect(eventOn(later, '2028-12-21')).toMatchObject({ eventType: 'WINTER_BREAK', dateEnd: '2029-01-03', dateBasis: 'derived', sourceInternalConflict: true })
    expect(later.sourceDiscrepancies).toContainEqual(expect.objectContaining({ field: 'christmasBreakStart', gridDate: '2028-12-21', captionDate: '2028-12-20' }))
    expect(eventOn(later, '2029-01-04')).toMatchObject({ dateEnd: '2029-01-05', dateBasis: 'derived', schoolStatus: 'no-classes' })
    expect(later.breaks[1]).toMatchObject({ dateStart: '2028-12-21', dateEnd: '2029-01-07', nextStudentAttendanceDate: '2029-01-08' })
  })

  it('checks continuous planning spans and keeps pre-break teaching weeks intact', () => {
    expect(calendars.map(calendar => calendar.breaks[2]!.nextStudentAttendanceDate)).toEqual(['2027-03-29', '2028-03-27', '2029-04-02'])
    const teaching = [['2027-03-15', '2027-03-19'], ['2028-03-13', '2028-03-17'], ['2029-03-12', '2029-03-23']]
    calendars.forEach((calendar, i) => {
      const all = noClassDates(calendar, [...calendar.confirmedNoSchoolDayEventIds!, ...calendar.conditionalNoSchoolDayEventIds!])
      for (const span of calendar.breaks) {
        expect(span.schoolWeekdaysOff).toBeNull()
        expect(span.note).toContain('make-up instruction')
        const componentDays = noClassDates(calendar, span.componentEventIds!)
        expect([...componentDays].sort()).toEqual(weekdays(span.dateStart, span.dateEnd))
        expect(all.has(span.nextStudentAttendanceDate!)).toBe(false)
        expect(all.has(span.lastStudentAttendanceDate!)).toBe(false)
      }
      for (const day of weekdays(teaching[i]![0]!, teaching[i]![1]!)) expect(all.has(day)).toBe(false)
    })
  })

  it('retains year-specific PD dates, canonical final-day meanings and only student-relevant events', () => {
    expect(eventOn(later, '2028-10-09')).toMatchObject({ eventType: 'STAFF_DEVELOPMENT', schoolStatus: 'no-classes' })
    expect(eventOn(later, '2028-10-13').schoolStatus).toBe('not-applicable')
    expect(later.events.some(item => item.dateStart!.startsWith('2029-04'))).toBe(false)
    for (const calendar of calendars) {
      expect(eventOn(calendar, calendar.lastDay!).eventTypes).toEqual(['LAST_DAY', 'HALF_DAY', 'GRADING_PERIOD_END'])
      expect(calendar.events.every(item => item.dateStart! >= calendar.firstDay! && (item.dateEnd || item.dateStart!) <= calendar.lastDay!)).toBe(true)
      expect(calendar.events.some(item => /\bFTE\b|payroll|compensation|preplanning|postplanning|Memorial Day/i.test(item.name))).toBe(false)
      expect(calendar.events.some(item => ['REPORT_CARD', 'SEMESTER_END', 'SEMESTER_START'].includes(item.eventType))).toBe(false)
    }
  })

  it('limits clock times to verified campuses and keeps FAQ intents distinct', () => {
    expect(current.schoolHours).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'Brown-Barge Middle School', earlyReleaseHours: '12:15 p.m.' }),
      expect.objectContaining({ scope: 'Bailey Middle School', regularHours: '9:34 a.m.-4:16 p.m.', earlyReleaseHours: '1:10 p.m.' }),
      expect.objectContaining({ scope: 'Pensacola High School', earlyReleaseHours: '1:20 p.m.' }),
    ]))
    expect(next.schoolHours).toEqual([])
    expect(later.schoolHours).toEqual([])
    expect(calendars.map(calendar => calendar.faqs.length)).toEqual([19, 17, 19])
    for (const calendar of calendars) expect(new Set(calendar.faqs.map(item => item.question)).size).toBe(calendar.faqs.length)
  })

  it('exports each canonical occurrence once with exclusive ICS range ends', () => {
    for (const calendar of calendars) {
      const ics = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
      const entries = ics.split('BEGIN:VEVENT').slice(1)
      expect(entries).toHaveLength(calendar.events.length)
      expect(ics).toContain('CATEGORIES:LAST_DAY,HALF_DAY,GRADING_PERIOD_END')
      for (const event of calendar.events.filter(item => item.dateEnd)) {
        const entry = entries.find(item => item.includes('UID:' + event.id + '@'))!
        const exclusive = new Date(event.dateEnd + 'T00:00:00Z')
        exclusive.setUTCDate(exclusive.getUTCDate() + 1)
        expect(entry).toContain('DTEND;VALUE=DATE:' + exclusive.toISOString().slice(0, 10).replaceAll('-', ''))
      }
    }
  })
})
