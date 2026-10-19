import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/hardee-county-school-district.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord
const calendar = record.schoolYears['2026-2027']!
const event = (key: string) => calendar.events.find(e => e.id === 'hardee-2026-2027-' + key)!
function weekdays(start: string, end: string) {
  const dates: string[] = []
  for (const d = new Date(start + 'T00:00:00Z'); d <= new Date(end + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    if (![0, 6].includes(d.getUTCDay())) dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}
function datesFor(ids: string[]) {
  return new Set(ids.flatMap(id => {
    const e = calendar.events.find(e => e.id === id)!
    return weekdays(e.dateStart!, e.dateEnd || e.dateStart!)
  }))
}
const regularClosures = () => new Set([...datesFor(calendar.confirmedNoSchoolDayEventIds!)].filter(d => d >= calendar.firstDay! && d <= calendar.lastDay!))

describe('Hardee County Florida 2026-2027 calendar interpretation', () => {
  it('uses the matching current download and printed approval instead of PDF metadata dates', () => {
    expect(record.district).toMatchObject({ id: 'FL-25', districtNumber: '25', timeZone: 'America/New_York', name: 'Hardee County School District' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027'])
    expect(calendar.sources[0]).toMatchObject({ url: 'https://5il.co/3fhhs', contentHash: 'sha256:1d5187cb4f93dfe83577ce36b4134b2b173c651c0007f13261d2180f2490701d', printedBoardApprovalDate: '2026-08-13' })
    expect(calendar.approvedAt).toBe('2026-08-13')
    expect(calendar.sourceDocumentUpdatedAt).toBeNull()
    expect(calendar.publishedAt).toBeNull()
    expect(calendar.sources.some(s => s.url === 'https://hardeefl.sites.thrillshare.com/o/hcs/page/calendar')).toBe(true)
  })

  it('distinguishes a full homecoming holiday from February student early release and staff inservice', () => {
    expect(event('fall-holiday')).toMatchObject({ dateStart: '2026-10-02', schoolStatus: 'no-classes', countsAsStudentAttendanceDay: false })
    expect(hasEventType(event('fall-holiday'), 'EARLY_RELEASE')).toBe(false)
    expect(event('february-early')).toMatchObject({ dateStart: '2027-02-19', schoolStatus: 'early-dismissal', countsAsStudentAttendanceDay: true })
    expect(event('september-inservice').schoolStatus).toBe('no-classes')
    expect(event('records-day').schoolStatus).toBe('no-classes')
    expect(event('september-inservice').scheduleSourceId).toBe('hardee-calendar-host')
    expect(calendar.events.filter(e => e.eventType === 'NON_STUDENT_DAY').map(e => e.dateStart)).toEqual(['2026-09-18', '2026-10-14', '2027-01-04'])
    expect(regularClosures().has('2027-02-19')).toBe(false)
  })

  it('keeps five shortened dates and one canonical occurrence for each shortened quarter end', () => {
    expect(calendar.events.filter(e => hasEventType(e, 'EARLY_RELEASE')).map(e => e.dateStart)).toEqual(['2026-11-20', '2026-12-18', '2027-02-19', '2027-03-12', '2027-05-27'])
    expect(calendar.events.filter(e => hasEventType(e, 'GRADING_PERIOD_END')).map(e => e.dateStart)).toEqual(['2026-10-08', '2026-12-18', '2027-03-12', '2027-05-27'])
    expect(event('quarter-1-end').schoolStatus).toBe('schools-open')
    for (const key of ['quarter-2-end', 'quarter-3-end', 'last-day']) expect(calendar.events.filter(e => e.dateStart === event(key).dateStart)).toHaveLength(1)
    expect(calendar.schoolHours).toEqual([])
    expect(calendar.events.filter(e => hasEventType(e, 'EARLY_RELEASE')).some(e => e.timeSourceId)).toBe(false)
  })

  it('marks the final regular student date as derived while retaining the published quarter-end date', () => {
    expect(calendar).toMatchObject({ firstDay: '2026-08-11', firstDayBasis: 'official', lastDay: '2027-05-27', lastDayBasis: 'derived' })
    expect(event('last-day')).toMatchObject({ eventType: 'EARLY_RELEASE', dateBasis: 'official', isFinalStudentDate: true, finalStudentDateBasis: 'derived', finalStudentDateScope: 'regular-year' })
    expect(event('last-day').eventTypes).toEqual(['EARLY_RELEASE', 'GRADING_PERIOD_END', 'CALENDAR_END'])
    expect(event('last-day').eventTypesBasis?.CALENDAR_END).toBe('derived')
    expect(calendar.events.some(e => hasEventType(e, 'LAST_DAY'))).toBe(false)
    expect(calendar.keyDates.find(k => k.eventType === 'CALENDAR_END')).toMatchObject({ dateStart: '2027-05-27', basis: 'derived', dateBasis: 'official', labelBasis: 'derived' })
    expect(calendar.events.some(e => e.dateStart === '2027-05-28')).toBe(false)
  })

  it('preserves weekend-inclusive breaks and the separate January records day without bridging March classes', () => {
    expect(event('thanksgiving')).toMatchObject({ dateStart: '2026-11-21', dateEnd: '2026-11-29' })
    expect(event('winter-break')).toMatchObject({ dateStart: '2026-12-19', dateEnd: '2027-01-03' })
    expect(event('winter-return')).toMatchObject({ dateStart: '2027-01-05', dateBasis: 'official' })
    expect(calendar.breaks.find(b => b.name === 'Winter Break')).toMatchObject({ nextStudentAttendanceDate: '2027-01-05', nextStudentAttendanceDateBasis: 'official', schoolWeekdaysOff: 10 })
    expect(event('spring-break')).toMatchObject({ dateStart: '2027-03-13', dateEnd: '2027-03-21' })
    expect(event('good-friday')).toMatchObject({ dateStart: '2027-03-26', dateEnd: null })
    for (const d of weekdays('2027-03-22', '2027-03-25')) expect(regularClosures().has(d)).toBe(false)
    for (const b of calendar.breaks) {
      expect([...datesFor(b.componentEventIds!)].sort()).toEqual(weekdays(b.dateStart, b.dateEnd))
      expect(weekdays(b.dateStart, b.dateEnd)).toHaveLength(b.schoolWeekdaysOff!)
      expect(regularClosures().has(b.lastStudentAttendanceDate!)).toBe(false)
      expect(regularClosures().has(b.nextStudentAttendanceDate!)).toBe(false)
    }
  })

  it('keeps progress and issued report dates while omitting employee grade-entry deadlines', () => {
    expect(calendar.events.filter(e => hasEventType(e, 'PROGRESS_REPORT')).map(e => e.dateStart)).toEqual(['2026-09-14', '2026-11-11', '2027-02-05', '2027-04-21'])
    expect(calendar.events.filter(e => hasEventType(e, 'REPORT_CARD')).map(e => e.dateStart)).toEqual(['2026-10-21', '2027-01-14', '2027-03-31', '2027-05-26'])
    for (const d of ['2026-10-15', '2027-01-08', '2027-03-25', '2027-05-20']) expect(calendar.events.some(e => e.dateStart === d)).toBe(false)
    expect(regularClosures().has('2026-11-11')).toBe(false)
    expect(calendar.events.some(e => /Veterans Day/.test(e.name))).toBe(false)
    expect(calendar.events.some(e => /Inservice Days|Professional Days|Teacher Post Day|Memorial Day Holiday|Grades Due/.test(e.name) || e.schoolStatus === 'staff-only')).toBe(false)
  })

  it('scopes all six open houses and preserves the high-school grade and junior-high surname time groups', () => {
    const houses = calendar.events.filter(e => e.eventType === 'BACK_TO_SCHOOL_NIGHT')
    expect(houses).toHaveLength(6)
    expect(houses.every(e => e.sourceId === 'hardee-district-live-feed' && e.timeSourceId === e.sourceId && e.gradeScope && e.countsAsStudentAttendanceDay === undefined)).toBe(true)
    expect(houses.map(e => e.dateStart)).toEqual(['2026-08-06', '2026-08-06', '2026-08-07', '2026-08-07', '2026-08-07', '2026-08-10'])
    expect(event('high-school-open-house').note).toContain('Freshmen attend 9-11 a.m.; grades 10-12 attend 1-3 p.m.')
    expect(event('junior-high-open-house').note).toContain('last names A-L attend 10 a.m.-noon; last names M-Z attend 2-4 p.m.')
  })

  it('treats Saturday graduation and the summer window separately from ordinary attendance', () => {
    expect(event('graduation')).toMatchObject({ dateStart: '2027-05-22', schoolStatus: 'not-applicable' })
    expect(event('graduation').countsAsStudentAttendanceDay).toBeUndefined()
    expect(event('summer-school')).toMatchObject({ dateStart: '2027-06-01', dateEnd: '2027-06-30', isWindow: true, schoolStatus: 'not-applicable', gradeScope: 'Students enrolled in district summer school' })
    expect(event('summer-school').countsAsStudentAttendanceDay).toBeUndefined()
    expect(event('juneteenth')).toMatchObject({ dateStart: '2027-06-18', schoolStatus: 'no-classes', gradeScope: 'Students enrolled in district summer school' })
    expect(regularClosures().has('2027-06-18')).toBe(false)
    expect(calendar.events.some(e => /Summer VPK|July 3|Independence Day/.test(e.name))).toBe(false)
  })

  it('calculates the regular 180-day attendance baseline and 17-day winter stretch', () => {
    expect(weekdays(calendar.firstDay!, calendar.lastDay!)).toHaveLength(208)
    expect(regularClosures().size).toBe(28)
    expect(weekdays(calendar.firstDay!, calendar.lastDay!).filter(d => !regularClosures().has(d))).toHaveLength(180)
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
    expect(calendar.statistics.find(s => s.id === 'student-attendance-days')).toMatchObject({ value: '180 days', basis: 'derived' })
    expect(calendar.statistics.find(s => s.id === 'longest-no-school-stretch')?.value).toBe('17 consecutive days')
    expect(calendar.conditionalNoSchoolDayEventIds).toEqual([])
  })

  it('exports exact inclusive endpoints and one May 27 event carrying the derived final-date marker', () => {
    const entries = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '').split('BEGIN:VEVENT').slice(1)
    const find = (key: string) => entries.find(e => e.includes('UID:' + event(key).id + '@'))!
    expect(entries).toHaveLength(36)
    expect(find('thanksgiving')).toContain('DTEND;VALUE=DATE:20261130')
    expect(find('winter-break')).toContain('DTEND;VALUE=DATE:20270104')
    expect(find('spring-break')).toContain('DTEND;VALUE=DATE:20270322')
    expect(find('summer-school')).toContain('DTEND;VALUE=DATE:20270701')
    expect(entries.filter(e => e.includes('DTSTART;VALUE=DATE:20270527'))).toHaveLength(1)
    expect(find('last-day')).toContain('CATEGORIES:EARLY_RELEASE,GRADING_PERIOD_END,CALENDAR_END')
    expect(find('last-day')).toContain('Final regular-year student date shown: inferred from academic-calendar boundaries')
    expect(find('graduation')).toContain('DTSTART;VALUE=DATE:20270522')
  })
})
