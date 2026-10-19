import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DistrictCalendar, DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/collier-county-school-district.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore Dependency-free publication checker.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord
const current = record.schoolYears['2026-2027']!
const next = record.schoolYears['2027-2028']!
const calendars = [current, next]
const event = (calendar: DistrictCalendar, key: string) => calendar.events.find(item => item.id === `collier-${calendar.schoolYear}-${key}`)!
function weekdays(start: string, end: string) {
  const dates: string[] = []
  for (const cursor = new Date(start + 'T00:00:00Z'); cursor <= new Date(end + 'T00:00:00Z'); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (![0, 6].includes(cursor.getUTCDay())) dates.push(cursor.toISOString().slice(0, 10))
  }
  return dates
}
function closed(calendar: DistrictCalendar) {
  return new Set(calendar.confirmedNoSchoolDayEventIds!.flatMap(id => {
    const item = calendar.events.find(item => item.id === id)!
    return weekdays(item.dateStart!, item.dateEnd || item.dateStart!)
  }))
}

describe('Collier approved 2026-2027 and 2027-2028 calendars', () => {
  it('publishes both currently linked PDFs with printed approvals and matching downloaded hashes', () => {
    expect(record.district).toMatchObject({ id: 'FL-11', name: 'Collier County Public Schools', timeZone: 'America/New_York' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027', '2027-2028'])
    expect(calendars.map(item => item.approvedAt)).toEqual(['2025-01-15', '2026-01-20'])
    expect(calendars.map(item => item.sources[0]?.contentHash)).toEqual([
      'sha256:6ec862a5e36143795bd59cb8963d1d580441219cca5db814c3650279d03e4fc7',
      'sha256:bd2d06be4647334aaed57570a5868f2d4216c6e4c60d27570db0df4a949c87d4',
    ])
    for (const calendar of calendars) {
      expect(calendar).toMatchObject({ status: 'official', indexable: true, verifiedAt: '2026-10-19' })
      expect(calendar.sources[0]?.url).toBe(calendar.actions.officialPdfUrl)
      expect(calendar.sources[0]?.printedBoardApprovalDate).toBe(calendar.approvedAt)
    }
    expect(auditRecords([{ filename: record.district.slug + '.json', record }])).toEqual([])
  })

  it('uses six diagonal early dismissals and one canonical final-day occurrence per year', () => {
    expect(current.events.filter(item => hasEventType(item, 'EARLY_RELEASE')).map(item => item.dateStart)).toEqual(['2026-08-26', '2026-10-29', '2027-02-02', '2027-04-21', '2027-05-21', '2027-05-27'])
    expect(next.events.filter(item => hasEventType(item, 'EARLY_RELEASE')).map(item => item.dateStart)).toEqual(['2027-08-25', '2027-11-04', '2028-02-01', '2028-03-29', '2028-05-26', '2028-06-01'])
    for (const calendar of calendars) {
      const last = event(calendar, 'last-day')
      expect(last.eventTypes).toEqual(['LAST_DAY', 'EARLY_RELEASE', 'GRADING_PERIOD_END'])
      expect(calendar.events.filter(item => item.dateStart === calendar.lastDay)).toEqual([last])
      for (const n of [1, 2, 3]) {
        expect(hasEventType(event(calendar, `quarter-${n}-end`), 'EARLY_RELEASE')).toBe(false)
        expect(event(calendar, `quarter-${n}-end`).schoolStatus).toBe('not-applicable')
      }
      expect(calendar.events.filter(item => hasEventType(item, 'EARLY_RELEASE')).every(item => item.schoolStatus === 'early-dismissal' && item.countsAsStudentAttendanceDay === true)).toBe(true)
    }
  })

  it('keeps March 29 in the 2027 spring break and the 2028 planning day after its named holiday', () => {
    expect(event(current, 'spring-break')).toMatchObject({ dateStart: '2027-03-22', dateEnd: '2027-03-29', dateBasis: 'official' })
    expect(current.breaks.find(item => item.name.startsWith('March planning'))).toMatchObject({ dateStart: '2027-03-19', dateEnd: '2027-03-29', schoolWeekdaysOff: 7, nextStudentAttendanceDate: '2027-03-30', nextStudentAttendanceDateBasis: 'derived' })
    expect(event(next, 'spring-break')).toMatchObject({ dateStart: '2028-03-13', dateEnd: '2028-03-17' })
    expect(event(next, 'spring-planning').dateStart).toBe('2028-03-20')
    expect(next.breaks.find(item => item.name.startsWith('Spring break'))).toMatchObject({ dateStart: '2028-03-11', dateEnd: '2028-03-20', schoolWeekdaysOff: 6, nextStudentAttendanceDate: '2028-03-21', nextStudentAttendanceDateBasis: 'derived' })
    for (const calendar of calendars) {
      const off = closed(calendar)
      for (const span of calendar.breaks) {
        for (const day of weekdays(span.dateStart, span.dateEnd)) expect(off.has(day)).toBe(true)
        expect(off.has(span.nextStudentAttendanceDate!)).toBe(false)
      }
      expect(event(calendar, 'winter-break').dateEnd).toBe(calendar === current ? '2026-12-31' : '2027-12-31')
      expect(event(calendar, 'winter-return').dateStart).toBe(calendar === current ? '2027-01-05' : '2028-01-05')
    }
    expect(next.breaks.find(item => item.name.startsWith('April student'))).toMatchObject({ dateStart: '2028-04-14', dateEnd: '2028-04-17', schoolWeekdaysOff: 2, nextStudentAttendanceDate: '2028-04-18' })
    expect(event(next, 'october-student-teacher-day-off').dateStart).toBe('2027-10-11')
    expect(event(next, 'october-planning').dateStart).toBe('2027-10-12')
  })

  it('treats sundown restrictions as activities and preserves the separate secondary reporting scope', () => {
    expect(current.events.filter(item => item.dateStart === '2026-09-11')).toHaveLength(2)
    const reporting = event(current, 'interim-period-end-2026-09-11')
    expect(reporting.gradeScope).toBe('Middle and high schools')
    for (const calendar of calendars) {
      const activity = event(calendar, 'sundown-activity-restriction')
      expect(activity).toMatchObject({ eventType: 'SCHOOL_MILESTONE', schoolStatus: 'not-applicable' })
      expect(activity.gradeScope).toBeUndefined()
      expect(activity.countsAsStudentAttendanceDay).toBeUndefined()
      expect(closed(calendar).has(activity.dateStart!)).toBe(false)
      expect(event(calendar, 'september-professional-development')).toMatchObject({ schoolStatus: 'no-classes', countsAsStudentAttendanceDay: false })
      const september = calendar.events.filter(item => item.eventType === 'PROGRESS_REPORT' && item.dateStart!.slice(5, 7) === '09')
      expect(september).toHaveLength(2)
      expect(september.every(item => item.gradeScope === 'Middle and high schools')).toBe(true)
      expect(calendar.events.filter(item => item.eventType === 'PROGRESS_REPORT' && item.dateStart!.slice(5, 7) !== '09').every(item => item.gradeScope === undefined)).toBe(true)
    }
    expect(event(current, 'september-professional-development').note).toContain('activities after sundown')
    expect(event(next, 'sundown-activity-restriction').dateStart).toBe('2027-10-01')
  })

  it('uses the printed 180 student total, includes Memorial Day only within the June-ending year and omits staff-only dates', () => {
    expect(current.lastDay).toBe('2027-05-27')
    expect(next.lastDay).toBe('2028-06-01')
    for (const [calendar, total, off] of [[current, 208, 28], [next, 212, 32]] as Array<[DistrictCalendar, number, number]>) {
      expect(weekdays(calendar.firstDay!, calendar.lastDay!)).toHaveLength(total)
      expect(closed(calendar).size).toBe(off)
      expect(total - off).toBe(180)
      expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
      expect(calendar.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value: '180 days', basis: 'official' })
      expect(calendar.statistics.find(item => item.id === 'early-release-days')?.value).toBe('6 dates')
      expect(calendar.events.filter(item => item.dateStart! > calendar.lastDay!).every(item => item.eventType === 'REPORT_CARD')).toBe(true)
      expect(calendar.events.every(item => item.dateStart! >= calendar.firstDay!)).toBe(true)
      expect(calendar.events.some(item => /\bFTE\b|Teacher Start|Summer/i.test(item.name))).toBe(false)
      expect(calendar.conditionalNoSchoolDayEventIds).toEqual([])
    }
    expect(current.events.some(item => item.dateStart === '2027-05-31')).toBe(false)
    expect(event(next, 'memorial-day')).toMatchObject({ dateStart: '2028-05-29', schoolStatus: 'no-classes' })
    for (const day of ['2028-05-30', '2028-05-31', '2028-06-01']) expect(closed(next).has(day)).toBe(false)
    expect(closed(current).has('2026-11-11')).toBe(false)
    expect(closed(next).has('2027-11-11')).toBe(false)
  })

  it('preserves graduation windows without daily attendance claims and retains post-year final report cards', () => {
    expect(event(current, 'graduation-window')).toMatchObject({ dateStart: '2027-05-17', dateEnd: '2027-05-21', isWindow: true, gradeScope: 'High school graduating students', schoolStatus: 'not-applicable' })
    expect(event(next, 'graduation-window')).toMatchObject({ dateStart: '2028-05-24', dateEnd: '2028-05-26', isWindow: true })
    for (const calendar of calendars) {
      expect(event(calendar, 'graduation-window').countsAsStudentAttendanceDay).toBeUndefined()
      expect(calendar.events.filter(item => hasEventType(item, 'LAST_DAY'))).toHaveLength(1)
      const reports = calendar.events.filter(item => item.eventType === 'REPORT_CARD')
      expect(reports).toHaveLength(4)
      expect(reports.every(item => item.schoolStatus === 'not-applicable')).toBe(true)
    }
    expect(event(current, 'report-cards-2027-06-07').dateStart).toBe('2027-06-07')
    expect(event(next, 'report-cards-2028-06-12').name).toBe('Report Cards Available Electronically')
  })

  it('separates verified campus bells and care operations from districtwide attendance', () => {
    expect(current.schoolHours).toEqual([expect.objectContaining({ scope: 'Mike Davis Elementary School — 2026-2027', earlyReleaseTime: '11:50 a.m.', sourceId: 'collier-mike-davis-hours' })])
    expect(next.schoolHours).toEqual([])
    expect(JSON.stringify(current.schoolHours)).not.toContain('6:30')
    expect(event(current, 'early-dismissal-2026-10-29')).toMatchObject({ timeSourceId: 'collier-big-cypress-october-29' })
    expect(event(current, 'early-dismissal-2027-04-21')).toMatchObject({ schoolStatus: 'early-dismissal', countsAsStudentAttendanceDay: true })
    expect(event(current, 'early-dismissal-2027-04-21').note).toContain('care programs closed')
    expect(current.sourceDiscrepancies?.find(item => item.field.startsWith('SACC May 28'))?.effect).toContain('Retain May 27')
    expect(current.events.some(item => item.dateStart === '2027-05-28')).toBe(false)
    expect(current.faqs).toHaveLength(23)
    expect(next.faqs).toHaveLength(21)
  })

  it('exports inclusive source ranges with exclusive subscription ends and no duplicate final days', () => {
    for (const [calendar, count] of [[current, 36], [next, 40]] as Array<[DistrictCalendar, number]>) {
      const ics = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
      const entries = ics.split('BEGIN:VEVENT').slice(1)
      const entry = (key: string) => entries.find(item => item.includes('UID:' + event(calendar, key).id + '@'))!
      expect(entries).toHaveLength(count)
      expect(entry('winter-break')).toContain('DTEND;VALUE=DATE:' + (calendar === current ? '20270101' : '20280101'))
      expect(entry('spring-break')).toContain('DTEND;VALUE=DATE:' + (calendar === current ? '20270330' : '20280318'))
      expect(entry('graduation-window')).toContain('DTEND;VALUE=DATE:' + (calendar === current ? '20270522' : '20280527'))
      expect(entry('graduation-window')).toContain('does not require every graduate to attend every day')
      expect(entry('last-day')).toContain('CATEGORIES:LAST_DAY,EARLY_RELEASE,GRADING_PERIOD_END')
      expect(entry('last-day')).toContain('DTEND;VALUE=DATE:' + (calendar === current ? '20270528' : '20280602'))
      expect(entries.filter(item => item.includes('CATEGORIES:LAST_DAY'))).toHaveLength(1)
      expect(entry('sundown-activity-restriction')).toContain('not marked as a daytime student holiday')
    }
  })
})
