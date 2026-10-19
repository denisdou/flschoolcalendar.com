import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/bay-county-school-district.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore Dependency-free publication checker.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord

function weekdays(start: string, end: string) {
  const dates: string[] = []
  for (const cursor = new Date(start + 'T00:00:00Z'); cursor <= new Date(end + 'T00:00:00Z'); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (![0, 6].includes(cursor.getUTCDay())) dates.push(cursor.toISOString().slice(0, 10))
  }
  return dates
}

const cases = [
  {
    year: '2026-2027', first: '2026-08-10', last: '2027-05-26', fullDay: '2026-12-18', hsEarly: '2027-05-25',
    conditional: ['2026-09-30', '2026-10-09', '2026-10-28', '2026-12-21', '2027-02-03', '2027-04-14'],
    spring: ['2027-03-15', '2027-03-19', '2027-03-22'], winter: ['2026-12-21', '2027-01-04', '2027-01-05'],
    finalReport: '2027-06-09', graduations: 9,
  },
  {
    year: '2027-2028', first: '2027-08-10', last: '2028-05-25', fullDay: '2027-12-17', hsEarly: '2028-05-24',
    conditional: ['2027-09-29', '2027-10-08', '2027-10-27', '2027-12-20', '2028-02-02', '2028-03-29'],
    spring: ['2028-03-13', '2028-03-17', '2028-03-20'], winter: ['2027-12-20', '2028-01-03', '2028-01-04'],
    finalReport: '2028-06-07', graduations: 10,
  },
]

describe('Bay District Schools source versions', () => {
  it('uses the local Central Time district and only the two supplied years', () => {
    expect(record.district).toMatchObject({ id: 'FL-03', name: 'Bay District Schools', timeZone: 'America/Chicago' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027', '2027-2028'])
    expect(auditRecords([{ filename: record.district.slug + '.json', record }])).toEqual([])
  })

  it('distinguishes printed Board approval from a revision label and unverified remote bytes', () => {
    const earlier = record.schoolYears['2026-2027']!
    const later = record.schoolYears['2027-2028']!
    expect(earlier.approvedAt).toBe('2025-10-28')
    expect(earlier.sources[0]).toMatchObject({ printedBoardApprovalDate: '2025-10-28', contentHash: 'sha256:2caa46dd1ebc8c7d5bc07743d76dc07713c881a61ccdf040a9ff474ebee2a549' })
    expect(later).toMatchObject({ approvedAt: null, sourceDocumentUpdatedAt: '2026-09-08', lastOfficialRevisionAt: '2026-09-08' })
    expect(later.sources[0]).toMatchObject({ printedRevisionDate: '2026-09-08', contentHash: 'sha256:f9b1222b4edfe623a4a6f60411185b282319d1dafe0eaadccc5b10059604d554' })
    expect(later.sources[0]).not.toHaveProperty('printedBoardApprovalDate')
    expect(later.sourceDiscrepancies?.some(item => item.field === 'remoteFileVersionVerification' && item.resolution === 'unresolved')).toBe(true)
  })
})

for (const expected of cases) {
  describe('Bay ' + expected.year + ' student dates', () => {
    const calendar = record.schoolYears[expected.year]!
    const byId = new Map(calendar.events.map(item => [item.id, item]))
    const event = (key: string) => byId.get('bds-' + expected.year + '-' + key)!
    const closures = (ids: string[]) => new Set(ids.flatMap(id => {
      const item = byId.get(id)!
      return weekdays(item.dateStart!, item.dateEnd || item.dateStart!)
    }))

    it('keeps exactly six conditional dates outside confirmed closure totals', () => {
      const conditional = calendar.conditionalNoSchoolDayEventIds!.map(id => byId.get(id)!)
      expect(conditional.map(item => item.dateStart)).toEqual(expected.conditional)
      for (const item of conditional) {
        expect(item.dateEnd).toBeNull()
        expect(item).toMatchObject({ schoolStatus: 'no-classes', scheduledAsNoSchool: true, mayBecomeAttendanceDay: true, countsAsStudentAttendanceDayUnderPublishedSchedule: false })
        expect(item).not.toHaveProperty('countsAsStudentAttendanceDay')
        expect(calendar.confirmedNoSchoolDayEventIds).not.toContain(item.id)
      }
      expect(event('winter-remainder').mayBecomeAttendanceDay).toBeUndefined()
      expect(event('records-workday').mayBecomeAttendanceDay).toBeUndefined()
    })

    it('covers every break weekday without bridging a scheduled class date', () => {
      for (const span of calendar.breaks) {
        const dates = closures(span.componentEventIds!)
        expect([...dates].sort()).toEqual(weekdays(span.dateStart, span.dateEnd))
        if (span.componentEventIds!.some(id => byId.get(id)!.mayBecomeAttendanceDay)) {
          expect(span.schoolWeekdaysOff).toBeNull()
          expect(span.lastStudentAttendanceDate).toBeNull()
        } else expect(span.schoolWeekdaysOff).toBe(dates.size)
        expect(dates.has(span.nextStudentAttendanceDate!)).toBe(false)
      }
      expect(calendar.breaks.find(span => span.name.includes('winter') || span.name.includes('Christmas'))).toMatchObject({
        dateStart: expected.winter[0], dateEnd: expected.winter[1], nextStudentAttendanceDate: expected.winter[2],
      })
      expect(event('spring-break')).toMatchObject({ dateStart: expected.spring[0], dateEnd: expected.spring[1] })
      expect(event('spring-return').dateStart).toBe(expected.spring[2])
      expect(event('good-friday').dateStart! > expected.spring[2]!).toBe(true)
      expect(closures(calendar.confirmedNoSchoolDayEventIds!)).not.toContain(expected.spring[2])
    })

    it('preserves the December full day with testing and both academic boundaries', () => {
      const fullDay = event('first-semester-end')
      expect(fullDay).toMatchObject({ dateStart: expected.fullDay, schoolStatus: 'schools-open', countsAsStudentAttendanceDay: true })
      for (const type of ['EXAM', 'GRADING_PERIOD_END', 'SEMESTER_END'] as const) expect(hasEventType(fullDay, type)).toBe(true)
      expect(hasEventType(fullDay, 'EARLY_RELEASE')).toBe(false)
      expect(fullDay.gradeScope).toBeUndefined()
      expect(calendar.events.filter(item => item.dateStart === expected.fullDay)).toHaveLength(1)
    })

    it('limits the penultimate early release to high school and the last-day release to everyone', () => {
      const early = calendar.events.filter(item => hasEventType(item, 'EARLY_RELEASE'))
      expect(early.map(item => item.dateStart)).toEqual([expected.hsEarly, expected.last])
      expect(event('high-school-early-release')).toMatchObject({ gradeScope: 'High school students only', countsAsStudentAttendanceDay: true })
      expect(event('last-day').gradeScope).toBeUndefined()
      expect(event('last-day').schoolStatusLabel).toBe('Early release for all students')
      for (const type of ['LAST_DAY', 'EARLY_RELEASE', 'GRADING_PERIOD_END', 'SEMESTER_END', 'EXAM'] as const) expect(hasEventType(event('last-day'), type)).toBe(true)
      expect(calendar.schoolHours).toEqual([])
    })

    it('deduplicates Thanksgiving and reconciles the official 176-day plan', () => {
      const confirmed = closures(calendar.confirmedNoSchoolDayEventIds!)
      const conditional = closures(calendar.conditionalNoSchoolDayEventIds!)
      expect(confirmed.size).toBe(26)
      expect(conditional.size).toBe(6)
      expect(weekdays(expected.first, expected.last).length - confirmed.size - conditional.size).toBe(176)
      expect(event('thanksgiving-day').coveredByBreakEventId).toBe(event('thanksgiving-break').id)
      expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
      expect(calendar.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value: '176 days', basis: 'official' })
      expect(calendar.statistics.find(item => item.id === 'total-no-school-weekdays')).toMatchObject({ value: '26 weekdays', label: 'Confirmed non-conditional no-school weekdays' })
      expect(calendar.statistics.find(item => item.id === 'early-release-days')?.value).toBe('2 dates')
    })

    it('retains June report cards and campus graduation milestones but excludes staff-only dates', () => {
      const reports = calendar.events.filter(item => hasEventType(item, 'REPORT_CARD'))
      expect(reports).toHaveLength(4)
      expect(reports.at(-1)).toMatchObject({ dateStart: expected.finalReport, schoolStatus: 'not-applicable' })
      expect(calendar.events.filter(item => item.id.includes('-graduation-'))).toHaveLength(expected.graduations)
      for (const item of calendar.events.filter(item => item.id.includes('-graduation-'))) {
        expect(item.gradeScope).toMatch(/^Graduating students at /)
        expect(item.schoolStatus).toBe('not-applicable')
        expect(calendar.confirmedNoSchoolDayEventIds).not.toContain(item.id)
      }
      expect(calendar.events.filter(item => item.dateStart! > expected.last)).toEqual([event('report-card-4')])
      expect(calendar.events.some(item => /professional learning|pre-school planning|post planning|memorial/i.test(item.name))).toBe(false)
      expect(calendar.events.some(item => item.eventType === 'PROGRESS_REPORT')).toBe(false)
    })

    it('exports each occurrence once, including conditionals and scoped dismissals', () => {
      const ics = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
      const entries = ics.split('BEGIN:VEVENT').slice(1)
      expect(entries).toHaveLength(calendar.events.length)
      const winter = entries.find(item => item.includes('UID:' + event('winter-remainder').id + '@'))!
      expect(winter).toContain('DTSTART;VALUE=DATE:' + event('winter-remainder').dateStart!.replaceAll('-', ''))
      const end = new Date(event('winter-remainder').dateEnd! + 'T00:00:00Z')
      end.setUTCDate(end.getUTCDate() + 1)
      expect(winter).toContain('DTEND;VALUE=DATE:' + end.toISOString().slice(0, 10).replaceAll('-', ''))
      for (const id of calendar.conditionalNoSchoolDayEventIds!) {
        expect(entries.find(item => item.includes('UID:' + id + '@'))).toContain('may become a school day')
      }
      const hs = entries.find(item => item.includes('UID:' + event('high-school-early-release').id + '@'))!
      expect(hs).toMatch(/early release for high school students only/i)
      expect(ics).not.toMatch(/SUMMARY:.*(?:Professional Learning|Pre-School Planning|Post Planning|Memorial)/)
    })
  })
}

describe('Bay 2027-2028 reporting and monthly subtotal differences', () => {
  const calendar = record.schoolYears['2027-2028']!
  it('keeps March 29 report cards on the existing conditional PLC occurrence', () => {
    const entries = calendar.events.filter(item => item.dateStart === '2028-03-29')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ mayBecomeAttendanceDay: true, eventTypes: ['NON_STUDENT_DAY', 'REPORT_CARD'] })
  })
  it('preserves dated March and April events instead of changing them to fit printed monthly totals', () => {
    const excluded = new Set([...calendar.confirmedNoSchoolDayEventIds!, ...calendar.conditionalNoSchoolDayEventIds!].flatMap(id => {
      const item = calendar.events.find(value => value.id === id)!
      return weekdays(item.dateStart!, item.dateEnd || item.dateStart!)
    }))
    expect(weekdays('2028-03-01', '2028-03-31').filter(date => !excluded.has(date))).toHaveLength(17)
    expect(weekdays('2028-04-01', '2028-04-30').filter(date => !excluded.has(date))).toHaveLength(19)
    expect(calendar.sourceDiscrepancies?.some(item => item.field === 'monthlyStudentDayCounts' && item.resolution === 'unresolved')).toBe(true)
    expect(calendar.statistics.some(item => /march|april|month/i.test(item.id))).toBe(false)
  })
})
