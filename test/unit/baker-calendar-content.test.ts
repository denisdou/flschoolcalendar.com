import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/baker-county-school-district.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore Dependency-free publication checker.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord
const calendar = record.schoolYears['2026-2027']!
const byId = new Map(calendar.events.map(event => [event.id, event]))
const event = (key: string) => byId.get('bcsd-2026-2027-' + key)!

function weekdays(start: string, end: string) {
  const result: string[] = []
  for (const cursor = new Date(start + 'T00:00:00Z'); cursor <= new Date(end + 'T00:00:00Z'); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (![0, 6].includes(cursor.getUTCDay())) result.push(cursor.toISOString().slice(0, 10))
  }
  return result
}

function closureDates(ids: string[]) {
  return new Set(ids.flatMap(id => {
    const item = byId.get(id)!
    return weekdays(item.dateStart!, item.dateEnd || item.dateStart!)
  }))
}

describe('Baker County student calendar source interpretation', () => {
  it('publishes only the verified year with both official calendar formats', () => {
    expect(record.district).toMatchObject({ districtNumber: '02', timeZone: 'America/New_York' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027'])
    expect(calendar).toMatchObject({ firstDay: '2026-08-10', lastDay: '2027-05-28', approvedAt: null, sourceDocumentUpdatedAt: null })
    expect(calendar.sources[0]).toMatchObject({
      url: 'https://www.bakerk12.org/fs/resource-manager/view/ade6adb1-4880-4ad0-a11a-36009a8dd83e',
      contentHash: 'sha256:c1abffa91da0c68986688f54955fd8b9a1ffb9f32ad6de1596950ae4afe8b579',
    })
    expect(auditRecords([{ filename: record.district.slug + '.json', record }])).toEqual([])
  })

  it('uses the student guide for Homecoming without inventing a full holiday', () => {
    expect(event('homecoming-early-release')).toMatchObject({
      dateStart: '2026-10-15', sourceId: 'bcsd-2026-2027-student-guide',
      schoolStatus: 'early-dismissal', schoolStatusLabel: 'Students dismissed 2 hours early', countsAsStudentAttendanceDay: true,
    })
    expect(calendar.sourceDiscrepancies?.some(item => item.field === 'homecomingEarlyDismissal')).toBe(true)
    expect(closureDates(calendar.confirmedNoSchoolDayEventIds!)).not.toContain('2026-10-15')
    expect(event('fall-break')).toMatchObject({ dateStart: '2026-10-22', dateEnd: '2026-10-23' })
  })

  it('keeps seven one-hour PLC dates separate from three two-hour dates', () => {
    const shortened = calendar.events.filter(item => hasEventType(item, 'EARLY_RELEASE'))
    expect(shortened).toHaveLength(10)
    expect(shortened.filter(item => item.schoolStatusLabel?.includes('1 hour')).map(item => item.dateStart)).toEqual([
      '2026-08-19', '2026-09-02', '2026-09-30', '2026-11-04', '2026-12-02', '2027-01-27', '2027-02-24',
    ])
    expect(shortened.filter(item => item.schoolStatusLabel?.includes('2 hours')).map(item => item.dateStart)).toEqual(['2026-10-15', '2026-12-18', '2027-05-28'])
    expect(shortened.every(item => item.countsAsStudentAttendanceDay === true)).toBe(true)
    expect(calendar.events.filter(item => item.dateStart === '2026-12-18')).toHaveLength(1)
    expect(event('quarter-2-end').eventTypes).toEqual(['GRADING_PERIOD_END', 'EARLY_RELEASE'])
    expect(calendar.events.filter(item => item.dateStart === '2027-05-28')).toHaveLength(1)
    expect(event('last-day').eventTypes).toEqual(['LAST_DAY', 'EARLY_RELEASE'])
    expect(calendar.schoolHours).toEqual([])
  })

  it('covers each break continuously and preserves its published student return', () => {
    for (const span of calendar.breaks) {
      const dates = closureDates(span.componentEventIds!)
      expect([...dates].sort()).toEqual(weekdays(span.dateStart, span.dateEnd))
      expect(dates.size).toBe(span.schoolWeekdaysOff)
      expect(dates.has(span.lastStudentAttendanceDate!)).toBe(false)
      expect(dates.has(span.nextStudentAttendanceDate!)).toBe(false)
    }
    expect(calendar.breaks.find(span => span.name === 'Christmas break')).toMatchObject({
      dateStart: '2026-12-21', dateEnd: '2027-01-04', schoolWeekdaysOff: 11, lastStudentAttendanceDate: '2026-12-18', nextStudentAttendanceDate: '2027-01-05',
    })
    expect(calendar.breaks.find(span => span.name === 'Spring break and planning day')).toMatchObject({
      dateStart: '2027-04-12', dateEnd: '2027-04-19', schoolWeekdaysOff: 6, nextStudentAttendanceDate: '2027-04-20',
    })
    expect(event('spring-break')).toMatchObject({ dateStart: '2027-04-12', dateEnd: '2027-04-16' })
    expect(event('april-planning').dateStart).toBe('2027-04-19')
  })

  it('does not join Easter to spring break across scheduled classes', () => {
    const closed = closureDates(calendar.confirmedNoSchoolDayEventIds!)
    expect(calendar.breaks.find(span => span.name === 'Easter break')).toMatchObject({ dateStart: '2027-03-26', dateEnd: '2027-03-29', nextStudentAttendanceDate: '2027-03-30' })
    expect(weekdays('2027-03-30', '2027-04-09').every(date => !closed.has(date))).toBe(true)
    expect(event('quarter-3-end').dateStart).toBe('2027-03-11')
    expect(event('march-planning').dateStart).toBe('2027-03-12')
  })

  it('reconciles closure dates to the printed 176 student days', () => {
    const closed = closureDates(calendar.confirmedNoSchoolDayEventIds!)
    expect(closed.size).toBe(34)
    expect(weekdays(calendar.firstDay!, calendar.lastDay!).length - closed.size).toBe(176)
    expect(calendar.conditionalNoSchoolDayEventIds).toEqual([])
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
    expect(calendar.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value: '176 days', basis: 'official' })
    expect(calendar.statistics.find(item => item.id === 'early-release-days')?.value).toBe('10 dates')
  })

  it('includes student academic milestones while omitting out-of-year staff dates', () => {
    expect(calendar.events.every(item => item.dateStart! >= calendar.firstDay! && (item.dateEnd || item.dateStart)! <= calendar.lastDay!)).toBe(true)
    expect(calendar.events.some(item => /pre-planning|teachers begin|memorial/i.test(item.name))).toBe(false)
    expect(event('graduation')).toMatchObject({ dateStart: '2027-05-21', schoolStatus: 'not-applicable', gradeScope: 'Graduating students' })
    expect(calendar.confirmedNoSchoolDayEventIds).not.toContain(event('graduation').id)
    expect(calendar.events.filter(item => item.eventType === 'REPORT_CARD').map(item => item.dateStart)).toEqual(['2026-10-16', '2027-01-08', '2027-03-19'])
    expect(calendar.events.filter(item => item.eventType === 'PROGRESS_REPORT').map(item => item.dateStart)).toEqual(['2026-09-04', '2026-11-13', '2027-02-05', '2027-04-23'])
  })

  it('exports canonical occurrences once with inclusive ranges converted for ICS', () => {
    const ics = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
    const entries = ics.split('BEGIN:VEVENT').slice(1)
    expect(entries).toHaveLength(calendar.events.length)
    const christmas = entries.find(item => item.includes('UID:' + event('christmas-holiday').id + '@'))!
    expect(christmas).toContain('DTSTART;VALUE=DATE:20261221')
    expect(christmas).toContain('DTEND;VALUE=DATE:20270101')
    const spring = entries.find(item => item.includes('UID:' + event('spring-break').id + '@'))!
    expect(spring).toContain('DTEND;VALUE=DATE:20270417')
    expect(entries.filter(item => item.includes('DTSTART;VALUE=DATE:20270528'))).toHaveLength(1)
    expect(ics).not.toMatch(/SUMMARY:.*(?:Pre-Planning|Teachers Begin|Memorial Day)/)
  })
})
