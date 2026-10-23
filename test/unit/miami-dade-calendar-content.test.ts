import { readFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CalendarEventsTable from '../../app/components/calendar/CalendarEventsTable.vue'
import MonthlyCalendar from '../../app/components/calendar/MonthlyCalendar.vue'
import type { DistrictCalendar, DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/miami-dade-county-public-schools.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
import { conditionalAttendanceDescription } from '../../shared/utils/calendarAttendance.mjs'
// @ts-ignore Dependency-free publication checker.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord
const regular = record.schoolYears['2026-2027']!
const technical = record.schoolYears['2026-2027-technical-adult-education']!
const juvenile = record.schoolYears['2026-2027-juvenile-justice']!
const calendars = [regular, technical, juvenile]
const event = (calendar: DistrictCalendar, key: string) => calendar.events.find(item => item.id.endsWith('-' + key))!
function dates(start: string, end: string) {
  const result: string[] = []
  for (const cursor = new Date(start + 'T00:00:00Z'); cursor <= new Date(end + 'T00:00:00Z'); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    result.push(cursor.toISOString().slice(0, 10))
  }
  return result
}
function noClassDates(calendar: DistrictCalendar, ids: string[] = calendar.confirmedNoSchoolDayEventIds || calendar.noSchoolDayEventIds || []) {
  return new Set(ids.flatMap(id => {
    const item = calendar.events.find(item => item.id === id)!
    return dates(item.dateStart!, item.dateEnd || item.dateStart!).filter(day => ![0, 6].includes(new Date(day).getUTCDay()))
  }))
}
function baseline(calendar: DistrictCalendar) {
  const off = noClassDates(calendar)
  const conditional = noClassDates(calendar, calendar.conditionalNoSchoolDayEventIds || [])
  const weekends = calendar.events.filter(item => item.countsAsStudentAttendanceDay === true && [0, 6].includes(new Date(item.dateStart!).getUTCDay())).map(item => item.dateStart!)
  return [...dates(calendar.firstDay!, calendar.lastDay!).filter(day => ![0, 6].includes(new Date(day).getUTCDay()) && !off.has(day) && !conditional.has(day)), ...weekends].sort()
}

describe('Miami-Dade three distinct 2026-2027 program calendars', () => {
  it('publishes three same-year variants from matching current official PDFs', () => {
    expect(record.district).toMatchObject({ id: 'FL-13', name: 'Miami-Dade County Public Schools', timeZone: 'America/New_York' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027', '2026-2027-technical-adult-education', '2026-2027-juvenile-justice'])
    expect(calendars.map(item => item.schoolYear)).toEqual(['2026-2027', '2026-2027', '2026-2027'])
    expect(calendars.map(item => item.sources[0]!.contentHash)).toEqual([
      'sha256:29cd3844927aea44a9e11423c6d655325de7a8e9b6455c42f8289b660b8ff215',
      'sha256:aeb654742cbb879ce8bbc8009cdd559d9d7623ea1441dac3f8ab910be27b22b8',
      'sha256:52f679a1f4904ff23c2eb9c43189fda9e2da202c3a9a89168bf7e884eee2fae5',
    ])
    expect(new Set(calendars.map(item => item.actions.staticIcsUrl)).size).toBe(3)
    expect(calendars.every(item => item.approvedAt === null)).toBe(true)
    expect(auditRecords([{ filename: record.district.slug + '.json', record }])).toEqual([])
  })

  it('expands Wednesday release only onto 36 attendance dates and preserves its precise grade scope', () => {
    const shortened = regular.events.filter(item => hasEventType(item, 'EARLY_RELEASE'))
    const expected = baseline(regular).filter(day => new Date(day).getUTCDay() === 3)
    expect(shortened.map(item => item.dateStart)).toEqual(expected)
    expect(expected).toHaveLength(36)
    for (const item of shortened) {
      expect(item).toMatchObject({ gradeScope: 'Elementary schools: grades 2-5; K-8 centers: grades 2-8', gradeScopeBasis: 'official', dateBasis: 'derived', countsAsStudentAttendanceDay: true, schoolStatus: 'early-dismissal' })
      expect(item.note).toContain('one hour early')
    }
    for (const off of ['2026-11-11', '2026-11-25', '2026-12-23', '2026-12-30', '2027-03-10', '2027-03-24']) expect(expected).not.toContain(off)
    expect(technical.events.some(item => hasEventType(item, 'EARLY_RELEASE'))).toBe(false)
    expect(juvenile.events.some(item => hasEventType(item, 'EARLY_RELEASE'))).toBe(false)
    expect(regular.schoolHours).toEqual([expect.objectContaining({ earlyReleaseHours: 'One hour before regular dismissal on Wednesdays when classes are held' })])
    expect(technical.schoolHours).toEqual([])
    expect(juvenile.schoolHours).toEqual([])
    expect(hasEventType(event(regular, 'last-day'), 'EARLY_RELEASE')).toBe(false)
  })

  it('uses independent district confirmation of Fall Recess without copying it into Juvenile Justice', () => {
    for (const calendar of [regular, technical]) {
      expect(event(calendar, 'fall-recess')).toMatchObject({ dateStart: '2026-11-23', dateEnd: '2026-11-25', attendanceStatusBasisSourceId: 'mdcps-calendar-adoption', nameSourceId: 'mdcps-calendar-adoption' })
      expect(calendar.sources.find(item => item.id === 'mdcps-calendar-adoption')).toMatchObject({ url: 'https://news.dadeschools.net/cmnc/new/34307', publishedAt: '2025-01-23' })
      expect(calendar.breaks[0]).toMatchObject({ dateStart: '2026-11-21', dateEnd: '2026-11-29', schoolWeekdaysOff: 5, nextStudentAttendanceDate: '2026-11-30' })
    }
    expect(event(juvenile, 'fall-recess')).toBeUndefined()
    expect(juvenile.breaks[0]).toMatchObject({ dateStart: '2026-11-25', dateEnd: '2026-11-29', schoolWeekdaysOff: 3 })
    expect(baseline(juvenile)).toContain('2026-11-23')
    expect(baseline(juvenile)).toContain('2026-11-24')
    expect(event(juvenile, 'november-planning').dateStart).toBe('2026-11-25')
  })

  it('separates technical adult class-day exchanges from fixed closures and weather reserves', () => {
    const fixed = noClassDates(technical)
    const conditional = noClassDates(technical, technical.conditionalNoSchoolDayEventIds)
    expect(fixed.size).toBe(27)
    expect([...conditional]).toEqual(['2026-09-21', '2026-11-03', '2026-12-18', '2027-01-15', '2027-03-10', '2027-03-29', '2027-06-04'])
    for (const id of technical.conditionalNoSchoolDayEventIds!) {
      const item = technical.events.find(item => item.id === id)!
      expect(item).toMatchObject({ scheduledAsNoSchool: true, countsAsStudentAttendanceDayUnderPublishedSchedule: false })
      expect(item.countsAsStudentAttendanceDay).toBeUndefined()
      expect(fixed.has(item.dateStart!)).toBe(false)
      expect(hasEventType(item, 'MAKEUP_DAY')).toBe(false)
      if (['2026-11-03', '2027-06-04'].includes(item.dateStart!)) {
        expect(item).toMatchObject({ schoolStatus: 'no-classes', attendanceChangeEligibility: 'unconfirmed' })
        expect(item.mayBecomeAttendanceDay).toBeUndefined()
        expect(item.mayBecomeAttendanceDayBasis).toBeUndefined()
        expect(conditionalAttendanceDescription(item)).toBe('No student classes on published calendar; course-specific arrangements unconfirmed')
      } else {
        expect(item).toMatchObject({ mayBecomeAttendanceDay: true, schoolStatus: 'no-classes' })
        expect(conditionalAttendanceDescription(item)).toBe('Schedule may change: principal-approved class swap')
      }
    }
    expect(technical.breaks.slice(1).every(item => item.schoolWeekdaysOff === null && item.note?.includes('principal'))).toBe(true)
    const metric = technical.statistics.find(item => item.id === 'total-no-school-weekdays')!
    expect(metric.explanation).toContain('27 fixed no-class weekdays')
    expect(metric.explanation).toContain('Five planning dates')
    expect(metric.explanation).toContain('applicability of that provision to those two dates is unconfirmed')
    expect(metric.explanation).toContain('none of these dates is a weather make-up reserve')
    for (const calendar of [regular, juvenile]) {
      expect(calendar.events.some(item => item.mayBecomeAttendanceDay)).toBe(false)
      expect(calendar.events.some(item => hasEventType(item, 'MAKEUP_DAY'))).toBe(false)
    }
  })

  it('keeps trimester boundaries and extended-year June and July attendance in the technical calendar', () => {
    expect(technical).toMatchObject({ firstDay: '2026-08-13', lastDay: '2027-07-28' })
    expect(event(technical, 'trimester-one-end').dateStart).toBe('2026-12-17')
    expect(event(technical, 'trimester-two-start').dateStart).toBe('2027-01-04')
    expect(event(technical, 'trimester-two-end').dateStart).toBe('2027-04-16')
    expect(event(technical, 'trimester-three-start').dateStart).toBe('2027-04-19')
    expect(event(technical, 'june-planning').dateStart).toBe('2027-06-04')
    expect(event(technical, 'juneteenth').dateStart).toBe('2027-06-18')
    expect(event(technical, 'independence-day').dateStart).toBe('2027-07-05')
    expect(baseline(technical)).toContain('2027-06-03')
    expect(baseline(technical)).toContain('2027-07-28')
    expect(technical.events.some(item => item.dateStart === '2027-07-29')).toBe(false)
  })

  it('keeps all 15 explicit Saturday classes as attendance and infers overall endpoints from summer boundaries', () => {
    const saturday = juvenile.events.filter(item => item.officialLabel === 'Saturday school')
    expect(saturday.map(item => item.dateStart)).toEqual(['2026-08-22', '2026-09-12', '2026-09-26', '2026-10-10', '2026-10-24', '2026-11-07', '2026-12-12', '2027-01-09', '2027-01-23', '2027-02-06', '2027-02-27', '2027-03-13', '2027-04-10', '2027-04-24', '2027-05-08'])
    expect(saturday.every(item => item.countsAsStudentAttendanceDay && new Date(item.dateStart!).getUTCDay() === 6 && item.schoolStatus === 'schools-open')).toBe(true)
    expect(juvenile).toMatchObject({ firstDay: '2026-07-02', firstDayBasis: 'derived', lastDay: '2027-06-29', lastDayBasis: 'derived' })
    expect(event(juvenile, 'first-day')).toMatchObject({ eventType: 'GRADING_PERIOD_START', eventTypes: ['GRADING_PERIOD_START', 'CALENDAR_START'], dateBasis: 'official', basis: 'official', eventTypesBasis: { GRADING_PERIOD_START: 'official', CALENDAR_START: 'derived' } })
    expect(event(juvenile, 'last-day')).toMatchObject({ eventType: 'GRADING_PERIOD_END', eventTypes: ['GRADING_PERIOD_END', 'CALENDAR_END'], isFinalStudentDate: true, finalStudentDateBasis: 'derived' })
    expect(juvenile.events.some(item => hasEventType(item, 'SUMMER_PROGRAM'))).toBe(false)
    expect(juvenile.events.some(item => item.dateStart === '2026-07-01' || item.dateStart === '2027-06-30')).toBe(false)
  })

  it('verifies every weekday and Saturday in each continuous break, preserving official return-date provenance', () => {
    for (const calendar of calendars) {
      const fixed = noClassDates(calendar)
      const conditional = noClassDates(calendar, calendar.conditionalNoSchoolDayEventIds || [])
      for (const span of calendar.breaks) {
        for (const day of dates(span.dateStart, span.dateEnd)) {
          if (![0, 6].includes(new Date(day).getUTCDay())) expect(fixed.has(day) || conditional.has(day)).toBe(true)
          expect(calendar.events.some(item => item.dateStart === day && item.countsAsStudentAttendanceDay === true)).toBe(false)
        }
        expect(baseline(calendar)).toContain(span.nextStudentAttendanceDate)
      }
      expect(event(calendar, 'winter-recess')).toMatchObject({ dateStart: '2026-12-21', dateEnd: '2027-01-01', dateBasis: 'official' })
      expect(event(calendar, 'spring-recess')).toMatchObject({ dateStart: '2027-03-22', dateEnd: '2027-03-26' })
      expect(event(calendar, 'post-spring-planning').dateStart).toBe('2027-03-29')
    }
    expect(regular.breaks[2]).toMatchObject({ nextStudentAttendanceDate: '2027-03-30', nextStudentAttendanceDateBasis: 'official', schoolWeekdaysOff: 6 })
    expect(juvenile.breaks[2]).toMatchObject({ nextStudentAttendanceDate: '2027-03-30', nextStudentAttendanceDateBasis: 'derived' })
  })

  it('reconciles each printed total and period breakdown independently', () => {
    expect(calendars.map(item => baseline(item).length)).toEqual([180, 216, 240])
    expect(calendars.map(item => noClassDates(item).size)).toEqual([31, 27, 34])
    const periods = (calendar: DistrictCalendar, ends: string[]) => {
      const all = baseline(calendar)
      return ends.map((end, i) => all.filter(day => day <= end && (i === 0 || day > ends[i - 1]!)).length)
    }
    expect(periods(regular, ['2026-10-16', '2027-01-14', '2027-03-19', '2027-06-03'])).toEqual([45, 46, 42, 47])
    expect(periods(technical, ['2026-12-17', '2027-04-16', '2027-07-28'])).toEqual([82, 65, 69])
    expect(periods(juvenile, ['2026-08-18', '2026-10-16', '2026-12-17', '2027-03-05', '2027-05-14', '2027-06-29'])).toEqual([30, 45, 42, 46, 47, 30])
    for (const [i, calendar] of calendars.entries()) {
      expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar, { preserveStoredBreakWording: true }))
      expect(calendar.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value: [180, 216, 240][i] + ' days', basis: 'official' })
    }
  })

  it('retains distinct useful FAQ intents and omits unverified reporting, testing and employee events', () => {
    expect(calendars.map(item => item.faqs.length)).toEqual([26, 18, 18])
    for (const calendar of calendars) {
      expect(new Set(calendar.faqs.map(item => item.question)).size).toBe(calendar.faqs.length)
      expect(calendar.events.some(item => /\bFTE\b|payroll|compensation|New Teachers Report|available to opt/i.test(item.name))).toBe(false)
      expect(calendar.events.some(item => ['REPORT_CARD', 'PROGRESS_REPORT', 'EXAM', 'FINAL_EXAM'].includes(item.eventType))).toBe(false)
    }
    expect(regular.faqs.find(item => item.question.startsWith('Is the last day of school'))?.answer).toContain('does not specify')
    expect(juvenile.faqs.find(item => item.question.startsWith('Does the Juvenile Justice Center have the full Thanksgiving'))?.answer).toMatch(/^No\./)
    expect(technical.faqs.find(item => item.question.startsWith('Can adult education classes'))?.answer).toMatch(/^In certain circumstances, yes\./)
  })

  it('shows unconfirmed course arrangements separately from approved class-swap eligibility and rejects false certainty', () => {
    const table = mount(CalendarEventsTable, { props: { events: technical.events, districtName: record.district.name, schoolYear: technical.schoolYear } })
    for (const key of ['november-learning', 'june-planning']) {
      const row = table.findAll('tbody tr').find(item => item.find('time').attributes('datetime') === event(technical, key).dateStart)!
      expect(row.find('.badge--conditional').text()).toBe('No student classes on published calendar')
      expect(row.find('.badge--closed').exists()).toBe(false)
      expect(row.text()).not.toContain('principal-approved class swap')
    }
    table.unmount()
    const monthly = mount(MonthlyCalendar, { props: { events: technical.events, districtName: record.district.name, firstDay: technical.firstDay, lastDay: technical.lastDay } })
    for (const day of ['2026-11-03', '2027-06-04']) {
      const cell = monthly.findAll('td').find(item => item.find(`time[datetime="${day}"]`).exists())!
      expect(cell.classes()).toContain('month-day--conditional')
      expect(cell.classes()).not.toContain('month-day--holiday')
      expect(monthly.find('#month-day-tooltip-' + day).text()).toContain('course-specific arrangements unconfirmed')
    }
    monthly.unmount()
    const contradictory = JSON.parse(JSON.stringify(record)) as DistrictRecord
    event(contradictory.schoolYears['2026-2027-technical-adult-education']!, 'june-planning').mayBecomeAttendanceDay = false
    expect(auditRecords([{ filename: record.district.slug + '.json', record: contradictory }])).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'INVALID_ATTENDANCE_CHANGE_ELIGIBILITY' }),
    ]))
  })

  it('exports inclusive ranges with exclusive ICS ends, program scope and attendance caveats', () => {
    for (const calendar of calendars) {
      const ics = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
      const entries = ics.split('BEGIN:VEVENT').slice(1)
      expect(entries).toHaveLength(calendar.events.length)
      const entry = (key: string) => entries.find(item => item.includes('UID:' + event(calendar, key).id + '@'))!
      expect(entry('winter-recess')).toContain('DTEND;VALUE=DATE:20270102')
      expect(entry('spring-recess')).toContain('DTEND;VALUE=DATE:20270327')
      if (calendar === regular) {
        expect(entry('wednesday-2026-08-19')).toContain('elementary schools (grades 2-5)')
        expect(entry('last-day')).toContain('DTEND;VALUE=DATE:20270604')
      }
      if (calendar === technical) {
        expect(entry('june-planning')).toContain('No student classes on published calendar\\; course-specific arrangements unconfirmed')
        expect(entry('june-planning')).not.toContain('Schedule may change: principal-approved class swap')
        expect(entry('november-learning')).toContain('excluded from employee opt-work substitutions')
        expect(entry('last-day')).toContain('DTEND;VALUE=DATE:20270729')
      }
      if (calendar === juvenile) {
        expect(entry('saturday-2026-08-22')).toContain('DTSTART;VALUE=DATE:20260822')
        expect(entry('last-day')).toContain('DTEND;VALUE=DATE:20270630')
        expect(ics).not.toContain('CATEGORIES:LAST_DAY')
      }
    }
  })
})
