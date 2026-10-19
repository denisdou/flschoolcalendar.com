import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DistrictRecord, DistrictCalendar } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/gilchrist-county-school-district.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord
const first = record.schoolYears['2026-2027']!
const second = record.schoolYears['2027-2028']!
const event = (c: DistrictCalendar, key: string) => c.events.find(e => e.id === `gilchrist-${c.schoolYear}-${key}`)!
function weekdays(start: string, end: string) {
  const dates: string[] = []
  for (const cursor = new Date(start + 'T00:00:00Z'); cursor <= new Date(end + 'T00:00:00Z'); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (![0, 6].includes(cursor.getUTCDay())) dates.push(cursor.toISOString().slice(0, 10))
  }
  return dates
}
function offDates(c: DistrictCalendar, ids = c.confirmedNoSchoolDayEventIds!) {
  return new Set(ids.flatMap(id => {
    const e = c.events.find(e => e.id === id)!
    return weekdays(e.dateStart!, e.dateEnd || e.dateStart!)
  }))
}
function icsEvents(c: DistrictCalendar) {
  return readFileSync('public' + c.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '').split('BEGIN:VEVENT').slice(1)
}

describe('Gilchrist County two-year student calendar interpretation', () => {
  it('identifies the Florida district and two matching current downloads without inventing Board adoption', () => {
    expect(record.district).toMatchObject({ id: 'FL-21', districtNumber: '21', timeZone: 'America/New_York' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027', '2027-2028'])
    expect(first.sources[0]?.contentHash).toBe('sha256:dbf6dde1756ce1302b87408ab9e268aed03c06a677d3d5981122faadd5eb798b')
    expect(second.sources[0]?.contentHash).toBe('sha256:79cfa103a6694ef270b4630578f78f2893b1cf879350ca8c1ba3ca41995b028d')
    for (const c of [first, second]) {
      expect(c.approvedAt).toBeNull()
      expect(c.sourceDocumentUpdatedAt).toBeNull()
      expect(c.sourceDiscrepancies?.some(d => d.field === 'approvedAt')).toBe(true)
      expect(c.sources[0]?.resolvedPdfUrl).toContain('files-backend.assets.thrillshare.com')
    }
  })

  it('distinguishes Good Friday early release in 2027 from a full holiday in 2028', () => {
    expect(event(first, 'good-friday')).toMatchObject({ dateStart: '2027-03-26', eventType: 'EARLY_RELEASE', schoolStatus: 'early-dismissal', countsAsStudentAttendanceDay: true })
    expect(event(second, 'good-friday')).toMatchObject({ dateStart: '2028-04-14', eventType: 'HOLIDAY', schoolStatus: 'no-classes', countsAsStudentAttendanceDay: false })
    expect(offDates(first).has('2027-03-26')).toBe(false)
    expect(offDates(second).has('2028-04-14')).toBe(true)
  })

  it('counts all printed exam early releases once and combines grading ends and last days', () => {
    const expected = [
      ['2026-09-16', '2026-10-14', '2026-12-17', '2026-12-18', '2027-03-03', '2027-03-26', '2027-05-26', '2027-05-27', '2027-05-28'],
      ['2027-09-15', '2027-10-13', '2027-12-16', '2027-12-17', '2028-02-23', '2028-05-24', '2028-05-25', '2028-05-26'],
    ]
    for (const [index, c] of [first, second].entries()) {
      expect(c.events.filter(e => hasEventType(e, 'EARLY_RELEASE')).map(e => e.dateStart)).toEqual(expected[index])
      expect(event(c, 'last-day').eventTypes).toEqual(['LAST_DAY', 'EARLY_RELEASE', 'FINAL_EXAM', 'GRADING_PERIOD_END'])
      expect(event(c, 'midterm-2').eventTypes).toEqual(['EARLY_RELEASE', 'EXAM', 'GRADING_PERIOD_END'])
      expect(c.events.filter(e => e.dateStart === c.lastDay)).toHaveLength(1)
      expect(c.events.filter(e => hasEventType(e, 'GRADING_PERIOD_END'))).toHaveLength(4)
      expect(c.schoolHours).toEqual([])
      expect(c.events.some(e => e.timeSourceId)).toBe(false)
    }
  })

  it('uses student-free January workdays and explicit returns instead of grading-period starts', () => {
    expect(event(first, 'winter-return').dateStart).toBe('2027-01-07')
    expect(event(second, 'winter-return').dateStart).toBe('2028-01-10')
    for (const c of [first, second]) {
      expect(event(c, 'winter-return').dateBasis).toBe('official')
      expect(event(c, 'january-workday-2')).toMatchObject({ schoolStatus: 'no-classes', countsAsStudentAttendanceDay: false })
      expect(event(c, 'january-workday-2').name).toContain('Close the Gap')
    }
    expect(offDates(second).has('2028-01-07')).toBe(true)
    expect(offDates(second).has('2027-10-11')).toBe(false)
    expect(event(second, 'presidents-day').dateStart).toBe('2028-02-14')
    expect(offDates(second).has('2028-02-21')).toBe(false)
  })

  it('preserves exact named breaks and verifies every weekday in each continuous planning span', () => {
    expect(event(first, 'fall-break')).toMatchObject({ dateStart: '2026-11-23', dateEnd: '2026-11-25' })
    expect(event(first, 'thanksgiving')).toMatchObject({ dateStart: '2026-11-26', dateEnd: '2026-11-27' })
    expect(event(first, 'christmas-break')).toMatchObject({ dateStart: '2026-12-21', dateEnd: '2027-01-01' })
    expect(event(second, 'christmas-break')).toMatchObject({ dateStart: '2027-12-20', dateEnd: '2028-01-03' })
    expect(event(second, 'spring-break')).toMatchObject({ dateStart: '2028-04-10', dateEnd: '2028-04-13' })
    expect(second.breaks.find(b => b.name === 'Spring Break')).toMatchObject({ schoolWeekdaysOff: 4, nextStudentAttendanceDate: '2028-04-17', nextStudentAttendanceDateBasis: 'derived' })
    for (const c of [first, second]) {
      const off = offDates(c)
      for (const b of c.breaks) {
        expect([...offDates(c, b.componentEventIds!)].sort()).toEqual(weekdays(b.dateStart, b.dateEnd))
        expect(weekdays(b.dateStart, b.dateEnd)).toHaveLength(b.schoolWeekdaysOff!)
        expect(off.has(b.lastStudentAttendanceDate!)).toBe(false)
        expect(off.has(b.nextStudentAttendanceDate!)).toBe(false)
        for (const day of weekdays(new Date(new Date(b.lastStudentAttendanceDate! + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10), new Date(new Date(b.nextStudentAttendanceDate! + 'T00:00:00Z').getTime() - 86400000).toISOString().slice(0, 10))) expect(off.has(day)).toBe(true)
      }
      const fair = c.breaks.find(b => b.name === 'Fair Break')!
      expect(off.has(fair.nextStudentAttendanceDate!)).toBe(false)
    }
    expect(offDates(first).has('2027-03-18')).toBe(false)
    expect(offDates(second).has('2028-03-16')).toBe(false)
  })

  it('retains conference assignment windows and the published Saturday report date without adding classes', () => {
    for (const c of [first, second]) {
      expect(c.events.filter(e => e.isWindow)).toHaveLength(2)
      expect(c.events.filter(e => e.isWindow).every(e => e.eventType === 'PARENT_CONFERENCE' && e.schoolStatus === 'not-applicable' && e.countsAsStudentAttendanceDay === undefined)).toBe(true)
      expect(event(c, 'report-4').dateStart).toBe(c.schoolYear === '2026-2027' ? '2027-06-01' : '2028-06-01')
      expect(event(c, 'report-4').countsAsStudentAttendanceDay).toBeUndefined()
      expect(c.events.some(e => /Preplanning|Post Planning|Memorial Day/.test(e.name) || e.schoolStatus === 'staff-only')).toBe(false)
    }
    expect(event(second, 'progress-1')).toMatchObject({ dateStart: '2027-09-11', schoolStatus: 'not-applicable' })
    expect(event(second, 'progress-1').note).toContain('Saturday')
    expect(event(second, 'progress-1').countsAsStudentAttendanceDay).toBeUndefined()
    expect(first.events.some(e => e.id.endsWith('-open-house'))).toBe(true)
    expect(second.events.some(e => e.id.endsWith('-open-house'))).toBe(false)
  })

  it('keeps campus graduation order and does not create an unsupported senior last day', () => {
    expect(event(first, 'bell-graduation').dateStart).toBe('2027-05-20')
    expect(event(first, 'trenton-graduation').dateStart).toBe('2027-05-21')
    expect(event(second, 'trenton-graduation').dateStart).toBe('2028-05-18')
    expect(event(second, 'bell-graduation').dateStart).toBe('2028-05-19')
    for (const c of [first, second]) {
      expect(c.events.filter(e => hasEventType(e, 'LAST_DAY'))).toHaveLength(1)
      expect(event(c, 'bell-graduation').schoolStatus).toBe('not-applicable')
      expect(event(c, 'trenton-graduation').countsAsStudentAttendanceDay).toBeUndefined()
    }
  })

  it('deduplicates enclosed holidays and preserves derived totals and winter stretches', () => {
    for (const [c, closures, attendance, stretch] of [[first, 32, 177, 19], [second, 34, 175, 23]] as const) {
      expect(weekdays(c.firstDay!, c.lastDay!)).toHaveLength(209)
      expect(offDates(c).size).toBe(closures)
      expect(209 - offDates(c).size).toBe(attendance)
      expect(event(c, 'christmas-holiday').coveredByBreakEventId).toBe(event(c, 'christmas-break').id)
      expect(c.conditionalNoSchoolDayEventIds).toEqual([])
      expect(c.statistics).toEqual(calculateCalendarStatistics(c))
      expect(c.statistics.find(s => s.id === 'student-attendance-days')).toMatchObject({ value: `${attendance} days`, basis: 'derived' })
      expect(c.statistics.find(s => s.id === 'longest-no-school-stretch')?.value).toBe(`${stretch} consecutive days`)
    }
  })

  it('exports inclusive break ranges and a single final-day occurrence with every classification', () => {
    for (const c of [first, second]) {
      const entries = icsEvents(c)
      const find = (key: string) => entries.find(e => e.includes('UID:' + event(c, key).id + '@'))!
      expect(entries.filter(e => e.includes('DTSTART;VALUE=DATE:' + c.lastDay!.replaceAll('-', '')))).toHaveLength(1)
      expect(find('last-day')).toContain('CATEGORIES:LAST_DAY,EARLY_RELEASE,FINAL_EXAM,GRADING_PERIOD_END')
      expect(find('conferences-1')).toContain('DTEND;VALUE=DATE:' + (c === first ? '20261016' : '20271015'))
      expect(find('spring-break')).toContain('DTEND;VALUE=DATE:' + (c === first ? '20270417' : '20280414'))
      expect(find('christmas-break')).toContain('DTEND;VALUE=DATE:' + (c === first ? '20270102' : '20280104'))
      expect(find('report-4')).toContain('DTSTART;VALUE=DATE:' + (c === first ? '20270601' : '20280601'))
    }
  })
})
