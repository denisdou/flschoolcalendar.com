import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/desoto-county-school-district.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord
const calendar = record.schoolYears['2026-2027']!
const event = (key: string) => calendar.events.find(item => item.id === 'desoto-2026-2027-' + key)!

function weekdays(start: string, end: string) {
  const dates: string[] = []
  for (const cursor = new Date(start + 'T00:00:00Z'); cursor <= new Date(end + 'T00:00:00Z'); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (![0, 6].includes(cursor.getUTCDay())) dates.push(cursor.toISOString().slice(0, 10))
  }
  return dates
}

function noClassDates(ids = calendar.confirmedNoSchoolDayEventIds!) {
  return new Set(ids.flatMap(id => {
    const item = calendar.events.find(item => item.id === id)!
    return weekdays(item.dateStart!, item.dateEnd || item.dateStart!)
  }))
}

describe('DeSoto County Florida 2026-2027 PDF interpretation', () => {
  it('records the matching official source without inventing approval or future years', () => {
    expect(record.district).toMatchObject({ id: 'FL-14', districtNumber: '14', timeZone: 'America/New_York', name: 'The School District of DeSoto County' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027'])
    expect(calendar.approvedAt).toBeNull()
    expect(calendar.sources[0]).toMatchObject({ contentHash: 'sha256:a9f5f54f52b8cd8cc2a9d380b72d1ff7df0fe05287f34c100dad20dd34e55802', publishedAt: null })
    expect(calendar.sourceDiscrepancies?.some(item => item.field === 'approvedAt')).toBe(true)
  })

  it('preserves every published nine-day range without joining spring break to Good Friday', () => {
    const spans = calendar.breaks.filter(item => item.name !== 'Christmas Break')
    expect(spans.map(item => [item.dateStart, item.dateEnd, item.nextStudentAttendanceDate])).toEqual([
      ['2026-10-17', '2026-10-25', '2026-10-26'],
      ['2026-11-21', '2026-11-29', '2026-11-30'],
      ['2027-03-13', '2027-03-21', '2027-03-22'],
    ])
    for (const span of spans) {
      expect(new Date(span.dateStart).getUTCDay()).toBe(6)
      expect(new Date(span.dateEnd).getUTCDay()).toBe(0)
      expect([...noClassDates(span.componentEventIds!)].sort()).toEqual(weekdays(span.dateStart, span.dateEnd))
      expect(span.schoolWeekdaysOff).toBe(5)
      expect(span.nextStudentAttendanceDateBasis).toBe('derived')
      expect(noClassDates().has(span.nextStudentAttendanceDate!)).toBe(false)
    }
    for (const date of weekdays('2027-03-22', '2027-03-25')) expect(noClassDates().has(date)).toBe(false)
    expect(event('good-friday').dateStart).toBe('2027-03-26')
  })

  it('keeps Christmas and New Year separate and the second-quarter end after winter return', () => {
    expect(event('christmas-break')).toMatchObject({ dateStart: '2026-12-19', dateEnd: '2026-12-31', dateBasis: 'official' })
    expect(event('new-years-day')).toMatchObject({ dateStart: '2027-01-01', dateEnd: null })
    expect(calendar.breaks.find(item => item.name === 'Christmas Break')).toMatchObject({ nextStudentAttendanceDate: '2027-01-04', nextStudentAttendanceDateBasis: 'derived', schoolWeekdaysOff: 9 })
    expect(event('quarter-2-end')).toMatchObject({ dateStart: '2027-01-08', eventTypes: ['EARLY_RELEASE', 'GRADING_PERIOD_END'] })
    expect(calendar.events.some(item => item.dateStart === '2026-12-18')).toBe(false)
    for (const date of weekdays('2027-01-04', '2027-01-08')) expect(noClassDates().has(date)).toBe(false)
  })

  it('keeps Presidents Day conditional and reconciles the printed 180 days', () => {
    const presidentsDay = event('presidents-day')
    expect(presidentsDay).toMatchObject({ dateStart: '2027-02-15', schoolStatus: 'no-classes', scheduledAsNoSchool: true, mayBecomeAttendanceDay: true, countsAsStudentAttendanceDayUnderPublishedSchedule: false })
    expect(presidentsDay.countsAsStudentAttendanceDay).toBeUndefined()
    expect(calendar.conditionalNoSchoolDayEventIds).toEqual([presidentsDay.id])
    expect(calendar.confirmedNoSchoolDayEventIds).not.toContain(presidentsDay.id)
    const confirmed = noClassDates()
    const conditional = noClassDates(calendar.conditionalNoSchoolDayEventIds!)
    const schoolDays = weekdays(calendar.firstDay!, calendar.lastDay!).filter(date => !confirmed.has(date) && !conditional.has(date))
    expect(schoolDays).toHaveLength(180)
    expect(['2026-10-16', '2027-01-08', '2027-03-12', '2027-05-27'].map((end, index, ends) => schoolDays.filter(date => date <= end && (index === 0 || date > ends[index - 1]!)).length)).toEqual([49, 40, 43, 48])
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
    expect(calendar.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value: '180 days', basis: 'official' })
    expect(calendar.statistics.find(item => item.id === 'total-no-school-weekdays')?.value).toBe('28 weekdays')
    expect(calendar.statistics.find(item => item.id === 'longest-no-school-stretch')?.value).toBe('16 consecutive days')
  })

  it('counts five early releases once, with no invented dismissal time or last-day shortening', () => {
    const shortened = calendar.events.filter(item => hasEventType(item, 'EARLY_RELEASE'))
    expect(shortened.map(item => item.dateStart)).toEqual(['2026-09-16', '2026-10-16', '2027-01-08', '2027-03-12', '2027-04-07'])
    expect(shortened.every(item => item.countsAsStudentAttendanceDay && item.schoolStatus === 'early-dismissal')).toBe(true)
    expect(calendar.events.filter(item => item.dateStart === '2026-10-16')).toHaveLength(1)
    expect(calendar.schoolHours).toEqual([])
    expect(shortened.every(item => !item.timeSourceId)).toBe(true)
    expect(hasEventType(event('last-day'), 'EARLY_RELEASE')).toBe(false)
  })

  it('includes family events and exports inclusive PDF ranges as exclusive ICS end dates', () => {
    expect(event('open-house').dateStart).toBe('2026-08-06')
    expect(event('graduation')).toMatchObject({ dateStart: '2027-05-28', eventType: 'SCHOOL_MILESTONE', schoolStatus: 'no-classes' })
    expect(calendar.events.some(item => item.schoolStatus === 'staff-only' || /onboarding|Independence Day|Memorial Day|Professional Learning & Teacher Workdays/i.test(item.name))).toBe(false)
    const ics = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
    const entries = ics.split('BEGIN:VEVENT').slice(1)
    const find = (key: string) => entries.find(item => item.includes('UID:' + event(key).id + '@'))!
    expect(entries).toHaveLength(18)
    expect(find('christmas-break')).toContain('DTEND;VALUE=DATE:20270101')
    expect(find('new-years-day')).toContain('DTEND;VALUE=DATE:20270102')
    expect(find('spring-break')).toContain('DTEND;VALUE=DATE:20270322')
    expect(find('presidents-day')).toContain('attendance may change')
    expect(find('quarter-1-end')).toContain('CATEGORIES:EARLY_RELEASE,GRADING_PERIOD_END')
  })
})
