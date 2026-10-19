import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/bradford-county-school-district.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore Dependency-free publication checker.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord
const calendar = record.schoolYears['2026-2027']!
const byId = new Map(calendar.events.map(item => [item.id, item]))
const event = (key: string) => byId.get('bradford-2026-2027-' + key)!

function weekdays(start: string, end: string) {
  const dates: string[] = []
  for (const cursor = new Date(start + 'T00:00:00Z'); cursor <= new Date(end + 'T00:00:00Z'); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (![0, 6].includes(cursor.getUTCDay())) dates.push(cursor.toISOString().slice(0, 10))
  }
  return dates
}

function closureDates(ids: string[]) {
  return new Set(ids.flatMap(id => {
    const item = byId.get(id)!
    return weekdays(item.dateStart!, item.dateEnd || item.dateStart!)
  }))
}

describe('Bradford County 2026-2027 source interpretation', () => {
  it('uses the current matching PDF without treating its filename as an approval date', () => {
    expect(record.district).toMatchObject({ id: 'FL-04', timeZone: 'America/New_York' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027'])
    expect(calendar).toMatchObject({ firstDay: '2026-08-11', lastDay: '2027-05-26', approvedAt: null, sourceDocumentUpdatedAt: null })
    expect(calendar.sources[0]).toMatchObject({ contentHash: 'sha256:e282126954141b4347db64a1e1e3f4ed1bd663796c95eb7097baab97d8ab7ae4' })
    expect(calendar.sources[0]).not.toHaveProperty('printedBoardApprovalDate')
    expect(auditRecords([{ filename: record.district.slug + '.json', record }])).toEqual([])
  })

  it('keeps both unspecified student schedules out of the closure and make-up lists', () => {
    expect(calendar.attendanceUncertaintyDates).toEqual(['2027-02-12', '2027-04-23'])
    for (const key of ['february-pd', 'virtual-planning']) {
      const item = event(key)
      expect(item).toMatchObject({ schoolStatus: 'unknown', schoolStatusReason: 'source-does-not-state' })
      expect(item).not.toHaveProperty('countsAsStudentAttendanceDay')
      expect(item).not.toHaveProperty('mayBecomeAttendanceDay')
      expect(calendar.confirmedNoSchoolDayEventIds).not.toContain(item.id)
      expect(calendar.conditionalNoSchoolDayEventIds).not.toContain(item.id)
    }
    expect(event('virtual-planning').schoolStatus).not.toBe('remote-instruction')
    expect(calendar.conditionalNoSchoolDayEventIds).toEqual([])
    expect(calendar.sourceDiscrepancies?.filter(item => /StudentAttendance$/.test(item.field))).toHaveLength(2)
  })

  it('publishes only confirmed closure statistics and withholds an unsupported annual attendance total', () => {
    const closed = closureDates(calendar.confirmedNoSchoolDayEventIds!)
    expect(weekdays(calendar.firstDay!, calendar.lastDay!)).toHaveLength(207)
    expect(closed.size).toBe(28)
    expect(closed.has('2027-02-12')).toBe(false)
    expect(closed.has('2027-04-23')).toBe(false)
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
    expect(calendar.statistics.some(item => item.id === 'student-attendance-days')).toBe(false)
    expect(calendar.statistics.find(item => item.id === 'total-no-school-weekdays')).toMatchObject({ value: '28 weekdays', label: 'Confirmed non-conditional no-school weekdays' })
    expect(calendar.statistics.find(item => item.id === 'student-no-school-days')).toMatchObject({ value: '4 days', label: 'Explicit student holidays for staff workdays' })
  })

  it('retains the named holidays while adding only adjacent planning days to the student break summaries', () => {
    expect(event('winter-holidays')).toMatchObject({ dateStart: '2026-12-21', dateEnd: '2027-01-01', dateBasis: 'official' })
    expect(event('spring-break')).toMatchObject({ dateStart: '2027-03-22', dateEnd: '2027-03-26', dateBasis: 'official' })
    expect(calendar.breaks.find(item => item.name === 'Winter holidays and planning day')).toMatchObject({
      dateStart: '2026-12-21', dateEnd: '2027-01-04', schoolWeekdaysOff: 11, nextStudentAttendanceDate: '2027-01-05', nextStudentAttendanceDateBasis: 'official',
    })
    expect(calendar.breaks.find(item => item.name === 'Spring break and planning day')).toMatchObject({
      dateStart: '2027-03-22', dateEnd: '2027-03-29', schoolWeekdaysOff: 6, nextStudentAttendanceDate: '2027-03-30', nextStudentAttendanceDateBasis: 'derived',
    })
    for (const span of calendar.breaks) {
      const dates = closureDates(span.componentEventIds!)
      expect([...dates].sort()).toEqual(weekdays(span.dateStart, span.dateEnd))
      expect(dates.size).toBe(span.schoolWeekdaysOff)
      expect(dates.has(span.lastStudentAttendanceDate!)).toBe(false)
      expect(dates.has(span.nextStudentAttendanceDate!)).toBe(false)
    }
  })

  it('distinguishes the January student return from the later semester boundary', () => {
    expect(event('winter-return')).toMatchObject({ dateStart: '2027-01-05', eventType: 'SCHOOL_MILESTONE', schoolStatus: 'schools-open' })
    expect(event('first-semester-end')).toMatchObject({ dateStart: '2027-01-08', eventType: 'SEMESTER_END' })
    expect(event('second-semester-start')).toMatchObject({ dateStart: '2027-01-11', eventType: 'SEMESTER_START' })
    expect(event('quarter-1-end').dateStart).toBe('2026-10-13')
    expect(event('quarter-3-end')).toMatchObject({ dateStart: '2027-03-15', schoolStatus: 'not-applicable' })
    expect(closureDates(calendar.confirmedNoSchoolDayEventIds!)).not.toContain('2027-03-15')
  })

  it('does not invent a last-day early release or a clock time for December 18', () => {
    const shortened = calendar.events.filter(item => hasEventType(item, 'EARLY_RELEASE'))
    expect(shortened.map(item => item.dateStart)).toEqual(['2026-12-18'])
    expect(shortened[0]).toMatchObject({ name: 'Early Release Day', countsAsStudentAttendanceDay: true })
    expect(event('last-day')).toMatchObject({ schoolStatus: 'schools-open', countsAsStudentAttendanceDay: true })
    expect(hasEventType(event('last-day'), 'EARLY_RELEASE')).toBe(false)
    expect(calendar.schoolHours).toEqual([])
  })

  it('includes student reporting and graduation while omitting the employee holiday table', () => {
    expect(calendar.events.filter(item => item.eventType === 'PROGRESS_REPORT').map(item => item.dateStart)).toEqual(['2026-09-23', '2026-12-02', '2027-02-23', '2027-05-03'])
    expect(calendar.events.filter(item => item.eventType === 'REPORT_CARD').map(item => item.dateStart)).toEqual(['2026-10-22', '2027-01-20', '2027-04-01'])
    expect(event('graduation')).toMatchObject({ dateStart: '2027-05-21', gradeScope: 'Graduating students', schoolStatus: 'not-applicable' })
    expect(calendar.confirmedNoSchoolDayEventIds).not.toContain(event('graduation').id)
    expect(calendar.events.every(item => item.dateStart! >= calendar.firstDay! && (item.dateEnd || item.dateStart)! <= calendar.lastDay!)).toBe(true)
    expect(calendar.events.some(item => /pre-planning|post-planning|calendar adjustment|vacation|memorial|independence/i.test(item.name))).toBe(false)
    expect(calendar.events.filter(item => item.dateStart === '2026-11-25')).toEqual([])
  })

  it('exports inclusive holiday ranges and explicit attendance uncertainty without duplicate staff closures', () => {
    const ics = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
    const entries = ics.split('BEGIN:VEVENT').slice(1)
    expect(entries).toHaveLength(calendar.events.length)
    const winter = entries.find(item => item.includes('UID:' + event('winter-holidays').id + '@'))!
    expect(winter).toContain('DTSTART;VALUE=DATE:20261221')
    expect(winter).toContain('DTEND;VALUE=DATE:20270102')
    const spring = entries.find(item => item.includes('UID:' + event('spring-break').id + '@'))!
    expect(spring).toContain('DTEND;VALUE=DATE:20270327')
    for (const key of ['february-pd', 'virtual-planning']) {
      const item = entries.find(value => value.includes('UID:' + event(key).id + '@'))!
      expect(item).toMatch(/Student (?:attendance|schedule) not specified/)
      expect(item).not.toContain('School status: no classes')
    }
    expect(ics).not.toMatch(/SUMMARY:.*(?:Calendar Adjustment|Vacation|Memorial|Pre-planning|Post-planning)/)
  })
})
