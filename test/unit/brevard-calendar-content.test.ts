import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/brevard-county-school-district.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore Dependency-free publication checker.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord
const calendar = record.schoolYears['2026-2027']!
const byId = new Map(calendar.events.map(item => [item.id, item]))
const event = (key: string) => byId.get('bps-2026-2027-' + key)!

function weekdays(start: string, end: string) {
  const dates: string[] = []
  for (const cursor = new Date(start + 'T00:00:00Z'); cursor <= new Date(end + 'T00:00:00Z'); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (![0, 6].includes(cursor.getUTCDay())) dates.push(cursor.toISOString().slice(0, 10))
  }
  return dates
}

function datesFor(ids: string[]) {
  return new Set(ids.flatMap(id => {
    const item = byId.get(id)!
    return weekdays(item.dateStart!, item.dateEnd || item.dateStart!)
  }))
}

describe('Brevard 2026-2027 regular district calendar', () => {
  it('publishes the matching approved PDF and explicitly excludes the modified school', () => {
    expect(record.district).toMatchObject({ id: 'FL-05', name: 'Brevard Public Schools', timeZone: 'America/New_York' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027'])
    expect(calendar.approvedAt).toBe('2026-02-24')
    expect(calendar.sources[0]).toMatchObject({ contentHash: 'sha256:e053185166a18e033e2ae23590d1691223a4c310aa2301e1b0d87092696fc648', printedBoardApprovalDate: '2026-02-24' })
    expect(calendar.excludedCampuses).toEqual(['Challenger 7 Elementary School'])
    expect(calendar.events.every(item => item.dateStart! >= '2026-08-10')).toBe(true)
    expect(auditRecords([{ filename: record.district.slug + '.json', record }])).toEqual([])
  })

  it('distinguishes the three opening dates and the regular opening Friday', () => {
    const starts = calendar.events.filter(item => hasEventType(item, 'FIRST_DAY'))
    expect(starts.map(item => item.dateStart)).toEqual(['2026-08-10', '2026-08-13', '2026-08-17'])
    expect(event('kindergarten-first-day')).toMatchObject({ gradeScope: 'Kindergarten', schoolStatus: 'schools-open' })
    expect(event('prekindergarten-first-day')).toMatchObject({ gradeScope: 'Prekindergarten', schoolStatus: 'schools-open' })
    expect(event('regular-release')).toMatchObject({ dateStart: '2026-08-14', schoolStatus: 'schools-open', schoolStatusLabel: 'Regular release day' })
    expect(hasEventType(event('regular-release'), 'EARLY_RELEASE')).toBe(false)
    expect(calendar.events.filter(item => hasEventType(item, 'EARLY_RELEASE'))[0]?.dateStart).toBe('2026-08-21')
  })

  it('counts all 39 shortened dates without filling holidays with weekly recurrences', () => {
    const closed = datesFor(calendar.confirmedNoSchoolDayEventIds!)
    const shortened = calendar.events.filter(item => hasEventType(item, 'EARLY_RELEASE'))
    const actual = datesFor(shortened.map(item => item.id))
    const fridays = weekdays('2026-08-21', '2027-05-21').filter(date => new Date(date + 'T00:00:00Z').getUTCDay() === 5 && !closed.has(date))
    const expected = new Set([...fridays, ...weekdays('2026-12-16', '2026-12-18'), ...weekdays('2027-05-24', '2027-05-26')])
    expect([...actual].sort()).toEqual([...expected].sort())
    expect(actual.size).toBe(39)
    expect(shortened.every(item => item.countsAsStudentAttendanceDay === true)).toBe(true)
    for (const date of ['2026-08-14', '2026-09-25', '2026-11-27', '2026-12-25', '2027-01-01', '2027-03-19', '2027-03-26']) expect(actual.has(date)).toBe(false)
    expect(calendar.schoolHours).toEqual([])
  })

  it('keeps reporting scopes from narrowing district dismissal or holiday attendance', () => {
    for (const date of ['2026-10-16', '2027-01-15', '2027-02-15', '2027-04-23', '2027-04-30', '2027-05-26']) {
      const items = calendar.events.filter(item => item.dateStart === date)
      expect(items).toHaveLength(1)
      expect(items[0]?.gradeScope).toBeUndefined()
    }
    const october = event('early-release-2026-10-16')
    expect(october.eventTypes).toEqual(['EARLY_RELEASE', 'REPORT_CARD'])
    expect(october.note).toContain('secondary students')
    const january = event('early-release-2027-01-15')
    expect(january.note).toContain('elementary students')
    expect(event('presidents-day')).toMatchObject({ schoolStatus: 'no-classes', eventTypes: ['HOLIDAY', 'NON_STUDENT_DAY', 'PROGRESS_REPORT', 'REPORT_CARD'] })
    expect(calendar.confirmedNoSchoolDayEventIds).toContain(event('presidents-day').id)
    expect(event('last-day').eventTypes).toEqual(['LAST_DAY', 'EARLY_RELEASE', 'EXAM', 'SEMESTER_END', 'REPORT_CARD'])
  })

  it('splits the final exam range around the canonical last day without overlapping dates', () => {
    expect(event('december-exams')).toMatchObject({ dateStart: '2026-12-16', dateEnd: '2026-12-18', dateBasis: 'official' })
    expect(event('may-exams')).toMatchObject({ dateStart: '2027-05-24', dateEnd: '2027-05-25', dateBasis: 'derived' })
    expect(event('last-day')).toMatchObject({ dateStart: '2027-05-26', dateEnd: null, schoolStatus: 'early-dismissal' })
    const finalDateEarlyReleaseEvents = calendar.events.filter(item => hasEventType(item, 'EARLY_RELEASE') && weekdays(item.dateStart!, item.dateEnd || item.dateStart!).includes('2027-05-26'))
    expect(finalDateEarlyReleaseEvents.map(item => item.id)).toEqual([event('last-day').id])
  })

  it('preserves each holiday entry and joins only continuous closure spans', () => {
    expect(event('winter-december')).toMatchObject({ dateStart: '2026-12-21', dateEnd: '2026-12-31' })
    expect(event('january-1-holiday').dateStart).toBe('2027-01-01')
    expect(event('winter-january-4')).toMatchObject({ dateStart: '2027-01-04', eventType: 'WINTER_BREAK', name: 'Winter Break - Student/Teacher Holiday' })
    expect(event('spring-break')).toMatchObject({ dateStart: '2027-03-22', dateEnd: '2027-03-26' })
    expect(calendar.breaks.find(span => span.name === 'Winter student break')).toMatchObject({ dateStart: '2026-12-21', dateEnd: '2027-01-04', nextStudentAttendanceDate: '2027-01-05', schoolWeekdaysOff: 11 })
    expect(calendar.breaks.find(span => span.name === 'March workday and spring break')).toMatchObject({ dateStart: '2027-03-19', dateEnd: '2027-03-26', nextStudentAttendanceDate: '2027-03-29', schoolWeekdaysOff: 6 })
    for (const span of calendar.breaks) {
      const dates = datesFor(span.componentEventIds!)
      expect([...dates].sort()).toEqual(weekdays(span.dateStart, span.dateEnd))
      expect(dates.size).toBe(span.schoolWeekdaysOff)
      expect(dates.has(span.lastStudentAttendanceDate!)).toBe(false)
      expect(dates.has(span.nextStudentAttendanceDate!)).toBe(false)
    }
  })

  it('reconciles the printed 180 pupil days and the 90-day semester boundaries', () => {
    const closed = datesFor(calendar.confirmedNoSchoolDayEventIds!)
    expect(closed.size).toBe(28)
    expect(weekdays('2026-08-10', '2027-05-26').length - closed.size).toBe(180)
    expect(weekdays('2026-08-10', '2027-01-08').filter(date => !closed.has(date))).toHaveLength(90)
    expect(weekdays('2027-01-11', '2027-05-26').filter(date => !closed.has(date))).toHaveLength(90)
    expect(event('early-release-2027-01-08').eventTypes).toEqual(['EARLY_RELEASE', 'SEMESTER_END'])
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
    expect(calendar.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value: '180 days', basis: 'official' })
    expect(calendar.statistics.find(item => item.id === 'early-release-days')?.value).toBe('39 dates')
  })

  it('separates elementary and secondary reporting without inventing a June release day', () => {
    const relatedDates = (pattern: RegExp) => calendar.events.filter(item => pattern.test(item.name)).map(item => item.dateStart)
    expect(relatedDates(/Elementary Interims/)).toEqual(['2026-09-16', '2026-11-30', '2027-02-17', '2027-04-30'])
    expect(relatedDates(/Secondary Interims/)).toEqual(['2026-09-14', '2026-11-19', '2027-02-15', '2027-04-28'])
    expect(relatedDates(/Secondary Report Cards/)).toEqual(['2026-10-16', '2027-01-13', '2027-03-29'])
    expect(relatedDates(/Elementary Report Cards/)).toEqual(['2026-10-20', '2027-01-15', '2027-03-31', '2027-05-26', '2027-05-27'])
    expect(calendar.events.filter(item => hasEventType(item, 'PROGRESS_REPORT'))).toHaveLength(8)
    expect(calendar.events.filter(item => hasEventType(item, 'REPORT_CARD'))).toHaveLength(12)
    expect(calendar.events.some(item => item.dateStart!.startsWith('2027-06'))).toBe(false)
    expect(calendar.faqs.find(item => item.question.includes('secondary report-card dates'))?.answer).toContain('June, with no specific day')
  })

  it('keeps the make-up priority as guidance and omits administrative and staff-only events', () => {
    expect(calendar.sources.some(item => item.id === 'bps-2026-2027-make-up-priority')).toBe(true)
    expect(calendar.conditionalNoSchoolDayEventIds).toEqual([])
    expect(calendar.events.some(item => item.mayBecomeAttendanceDay || hasEventType(item, 'MAKEUP_DAY'))).toBe(false)
    expect(calendar.events.some(item => /FTE|preplanning|post.?planning|memorial|graduation/i.test(item.name))).toBe(false)
    expect(calendar.events.filter(item => item.dateStart! > calendar.lastDay!)).toEqual([event('elementary-final-report-focus')])
  })

  it('exports each canonical occurrence once and preserves inclusive multi-day endpoints', () => {
    const ics = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
    const entries = ics.split('BEGIN:VEVENT').slice(1)
    expect(entries).toHaveLength(69)
    const find = (key: string) => entries.find(item => item.includes('UID:' + event(key).id + '@'))!
    expect(find('december-exams')).toContain('DTEND;VALUE=DATE:20261219')
    expect(find('may-exams')).toContain('DTEND;VALUE=DATE:20270526')
    expect(find('last-day')).toContain('DTSTART;VALUE=DATE:20270526')
    expect(find('last-day')).toContain('CATEGORIES:LAST_DAY,EARLY_RELEASE,EXAM,SEMESTER_END,REPORT_CARD')
    expect(find('winter-december')).toContain('DTEND;VALUE=DATE:20270101')
    expect(find('spring-break')).toContain('DTEND;VALUE=DATE:20270327')
    expect(entries.filter(item => item.includes('DTSTART;VALUE=DATE:20270526'))).toHaveLength(1)
    expect(ics).not.toMatch(/SUMMARY:.*(?:FTE|PREPLANNING|POST PLANNING|MEMORIAL)/)
  })
})
