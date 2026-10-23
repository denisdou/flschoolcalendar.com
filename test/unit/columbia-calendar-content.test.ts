import { readFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CalendarEventsTable from '../../app/components/calendar/CalendarEventsTable.vue'
import CalendarPageHero from '../../app/components/calendar/CalendarPageHero.vue'
import CalendarQuickLook from '../../app/components/calendar/CalendarQuickLook.vue'
import MonthlyCalendar from '../../app/components/calendar/MonthlyCalendar.vue'
import type { DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/columbia-county-school-district.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
import { buildDistrictCatalog } from '../../shared/utils/districts'
import { buildDistrictCalendarSchema, buildDistrictHubSchema } from '../../shared/utils/calendarSchema'
// @ts-ignore Dependency-free publication checker.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord
const calendar = record.schoolYears['2026-2027']!
const event = (key: string) => calendar.events.find(item => item.id === 'columbia-2026-2027-' + key)!
function weekdays(start: string, end: string) {
  const dates: string[] = []
  for (const cursor = new Date(start + 'T00:00:00Z'); cursor <= new Date(end + 'T00:00:00Z'); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (![0, 6].includes(cursor.getUTCDay())) dates.push(cursor.toISOString().slice(0, 10))
  }
  return dates
}
function datesFor(ids: string[]) {
  return new Set(ids.flatMap(id => {
    const item = calendar.events.find(item => item.id === id)!
    return weekdays(item.dateStart!, item.dateEnd || item.dateStart!)
  }))
}

describe('Columbia County scanned 2026-2027 calendar', () => {
  it('uses the School Board approval stamp and matching current PDF without future placeholders', () => {
    expect(record.district).toMatchObject({ id: 'FL-12', name: 'Columbia County School District', timeZone: 'America/New_York' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027'])
    expect(calendar).toMatchObject({ status: 'official', indexable: true, approvedAt: '2026-01-27', firstDay: '2026-08-10', lastDay: '2027-05-26' })
    expect(calendar.sources[0]).toMatchObject({ printedBoardApprovalDate: '2026-01-27', contentHash: 'sha256:33b54d553a9df05bc4a690a3bdbb64e97390b57f5ba26482b0c6d925b4c2956f' })
    expect(calendar.approvedAt).not.toBe('2026-01-28')
    expect(auditRecords([{ filename: record.district.slug + '.json', record }])).toEqual([])
  })

  it('keeps only two student early releases and treats Instructional Virtual workdays as student holidays', () => {
    expect(calendar.events.filter(item => hasEventType(item, 'EARLY_RELEASE')).map(item => item.dateStart)).toEqual(['2026-09-23', '2027-02-24'])
    for (const key of ['october-workday', 'january-workday', 'march-workday']) {
      expect(event(key)).toMatchObject({ schoolStatus: 'no-classes', countsAsStudentAttendanceDay: false })
      expect(event(key).officialLabel).toContain('Instructional Virtual')
      expect(hasEventType(event(key), 'REMOTE_INSTRUCTION')).toBe(false)
    }
    expect(event('first-semester-end')).toMatchObject({ dateStart: '2026-12-18', schoolStatus: 'not-applicable' })
    expect(event('last-day')).toMatchObject({ schoolStatus: 'schools-open', countsAsStudentAttendanceDay: true })
    expect(hasEventType(event('last-day'), 'EARLY_RELEASE')).toBe(false)
    expect(calendar.schoolHours).toEqual([])
  })

  it('splits four conditional weather weekdays from fixed November holiday closures', () => {
    const confirmed = datesFor(calendar.confirmedNoSchoolDayEventIds!)
    const conditional = datesFor(calendar.conditionalNoSchoolDayEventIds!)
    expect([...conditional]).toEqual(['2026-11-23', '2026-11-24', '2027-02-15', '2027-04-19'])
    expect(confirmed.size).toBe(26)
    for (const day of conditional) expect(confirmed.has(day)).toBe(false)
    for (const id of calendar.conditionalNoSchoolDayEventIds!) {
      const item = calendar.events.find(item => item.id === id)!
      expect(item).toMatchObject({ scheduledAsNoSchool: true, mayBecomeAttendanceDay: true, countsAsStudentAttendanceDayUnderPublishedSchedule: false, schoolStatus: 'no-classes' })
      expect(item.countsAsStudentAttendanceDay).toBeUndefined()
      expect(hasEventType(item, 'MAKEUP_DAY')).toBe(true)
    }
    expect(event('november-system-closure')).toMatchObject({ dateStart: '2026-11-25', schoolStatus: 'schools-closed' })
    expect(event('november-district-holiday')).toMatchObject({ dateStart: '2026-11-27', schoolStatus: 'schools-closed' })
    expect(event('thanksgiving-day').dateStart).toBe('2026-11-26')
    expect(calendar.breaks[0]).toMatchObject({ dateStart: '2026-11-21', dateEnd: '2026-11-29', schoolWeekdaysOff: null })
  })

  it('checks every weekday in the winter and spring sequences without bridging March 17-18', () => {
    const off = new Set([...datesFor(calendar.confirmedNoSchoolDayEventIds!), ...datesFor(calendar.conditionalNoSchoolDayEventIds!)])
    expect(event('holiday-break')).toMatchObject({ dateStart: '2026-12-21', dateEnd: '2027-01-04', dateBasis: 'official' })
    expect(calendar.breaks[1]).toMatchObject({ dateStart: '2026-12-19', dateEnd: '2027-01-05', nextStudentAttendanceDate: '2027-01-06', nextStudentAttendanceDateBasis: 'official', schoolWeekdaysOff: 12 })
    expect(event('spring-break')).toMatchObject({ dateStart: '2027-03-22', dateEnd: '2027-03-26' })
    expect(calendar.breaks[2]).toMatchObject({ dateStart: '2027-03-19', dateEnd: '2027-03-28', nextStudentAttendanceDate: '2027-03-29', nextStudentAttendanceDateBasis: 'derived', schoolWeekdaysOff: 6 })
    expect(event('third-grading-period-end')).toMatchObject({ dateStart: '2027-03-16', schoolStatus: 'not-applicable' })
    for (const day of ['2027-03-17', '2027-03-18']) expect(off.has(day)).toBe(false)
    for (const span of calendar.breaks) {
      for (const day of weekdays(span.dateStart, span.dateEnd)) expect(off.has(day)).toBe(true)
      expect(off.has(span.nextStudentAttendanceDate!)).toBe(false)
    }
  })

  it('preserves the senior endpoint and post-class ceremonies without adding staff workdays', () => {
    expect(event('senior-last-day')).toMatchObject({ dateStart: '2027-05-14', gradeScope: 'Graduating seniors at Columbia High School and Fort White High School' })
    expect(event('senior-last-day').isFinalStudentDate).toBeUndefined()
    expect(event('last-day').gradeScope).toBeUndefined()
    expect(calendar.events.filter(item => item.dateStart === '2027-05-26')).toEqual([event('last-day')])
    expect(event('fwhs-baccalaureate').dateStart).toBe('2027-05-20')
    expect(event('fwhs-graduation').dateStart).toBe('2027-05-21')
    expect(event('chs-baccalaureate').dateStart).toBe('2027-05-27')
    expect(event('chs-graduation').dateStart).toBe('2027-05-28')
    for (const item of calendar.events.filter(item => item.eventType === 'SCHOOL_MILESTONE')) {
      expect(item.schoolStatus).toBe('not-applicable')
      expect(item.gradeScope).toContain('graduating students')
      expect(item.countsAsStudentAttendanceDay).toBeUndefined()
    }
    expect(calendar.events.filter(item => item.dateStart! > calendar.lastDay!).every(item => item.eventType === 'SCHOOL_MILESTONE')).toBe(true)
    expect(calendar.events.some(item => /\bFTE\b|Fiscal|Orientation|Pre-planning|Post-planning|Summer|Memorial/i.test(item.name))).toBe(false)
  })

  it('derives 178 regular baseline weekdays without turning the staff 180-day label into a student total', () => {
    expect(weekdays(calendar.firstDay!, calendar.lastDay!)).toHaveLength(208)
    expect(208 - datesFor(calendar.confirmedNoSchoolDayEventIds!).size - datesFor(calendar.conditionalNoSchoolDayEventIds!).size).toBe(178)
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
    expect(calendar.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({
      label: 'Calculated Student Attendance Days', value: '178 days', basis: 'derived',
      explanation: calendar.studentDayStatisticExplanation,
    })
    expect(calendar.statistics.find(item => item.id === 'total-no-school-weekdays')).toMatchObject({ value: '26 weekdays', label: 'Confirmed non-conditional no-school weekdays' })
    expect(calendar.statistics.find(item => item.id === 'early-release-days')?.value).toBe('2 dates')
    expect(calendar.highlights.some(item => item.label === 'Student days' && item.value === '180 days')).toBe(false)
    expect(calendar.calendarScope).toContain('non-senior')
    expect(calendar.faqs.find(item => item.question.startsWith('How many school days'))?.answer).toContain('178')
  })

  it('keeps reporting and separate summer-program guidance honest and free of duplicated FAQ intents', () => {
    expect(calendar.events.some(item => ['REPORT_CARD', 'PROGRESS_REPORT', 'SUMMER_PROGRAM'].includes(item.eventType))).toBe(false)
    expect(calendar.faqs).toHaveLength(32)
    expect(new Set(calendar.faqs.map(item => item.question)).size).toBe(32)
    const summer = calendar.faqs.find(item => item.question.startsWith('When do summer'))!
    expect(summer.answer).toContain('June 7, 2027')
    expect(summer.answer).toContain('June 24')
    expect(summer.answer).toContain('does not specify their daily schedules')
    expect(calendar.faqs.find(item => item.question.startsWith('Where can families check report cards'))?.answer).toContain('not report-card or interim-report release dates')
  })

  it('separates weather-reserve key dates and uses the regular endpoint in the hero', () => {
    const november = calendar.keyDates.filter(item => item.dateStart.startsWith('2026-11'))
    expect(november).toMatchObject([
      { dateStart: '2026-11-23', dateEnd: '2026-11-24', eventType: 'MAKEUP_DAY', dateBasis: 'official', eventTypeBasis: 'official' },
      { dateStart: '2026-11-25', dateEnd: '2026-11-27', eventType: 'THANKSGIVING_BREAK', dateBasis: 'derived' },
    ])
    const quickLook = mount(CalendarQuickLook, { props: { dates: november } })
    expect(quickLook.text()).toContain('Possible Weather Make-Up Days (No School Scheduled)')
    expect(quickLook.text()).toContain('Thanksgiving Holidays and Closures')
    expect(quickLook.findAll('time').map(time => time.attributes('datetime'))).toEqual(['2026-11-23', '2026-11-25'])
    quickLook.unmount()

    const hero = mount(CalendarPageHero, {
      props: { district: record.district, calendar, calendars: [calendar] },
      global: { stubs: { StatusBadge: true, CalendarActions: true, SchoolYearTabs: true } },
    })
    const last = hero.findAll('.calendar-quick-item').find(item => item.find('dt').text() === 'Last day')!
    expect(last.find('time').attributes('datetime')).toBe('2027-05-26')
    expect(hero.find('.calendar-hero-description--mobile').text()).toContain('Seniors at Columbia High and Fort White High finish May 14')
    hero.unmount()
  })

  it('keeps the unset population out of public directory entries and structured data', () => {
    const catalog = buildDistrictCatalog([record])
    expect(catalog.districts[0]).not.toHaveProperty('schoolAgePopulation')
    const siteUrl = 'https://www.flschoolcalendar.com'
    for (const schema of [
      buildDistrictHubSchema(record, siteUrl),
      buildDistrictCalendarSchema({
        district: record.district, calendar, discovery: record.calendarDiscovery,
        siteUrl, path: '/columbia-county-school-district/2026-2027/',
      }),
    ]) {
      expect(JSON.stringify(schema)).not.toMatch(/schoolAgePopulation|population|numberOfStudents|numberOfEmployees/)
    }
  })

  it('shows conditional weather attendance and the senior scope in parent-facing views', () => {
    const table = mount(CalendarEventsTable, { props: {
      events: calendar.events, districtName: record.district.name, schoolYear: calendar.schoolYear,
    } })
    for (const key of ['thanksgiving-weather-reserve', 'february-weather-reserve', 'april-weather-reserve']) {
      const row = table.findAll('tbody tr').find(row => row.text().includes(event(key).name)
        && row.find('time').attributes('datetime') === event(key).dateStart)!
      expect(row.find('.badge--conditional').text()).toBe('No School Scheduled · Possible Weather Make-Up')
      expect(row.find('.badge--closed').exists()).toBe(false)
    }
    const seniorRow = table.findAll('tbody tr').find(row => row.text().includes(event('senior-last-day').name))!
    expect(seniorRow.text()).toContain("Seniors' last day; other classes continue")
    expect(seniorRow.text()).not.toContain('School closes')
    table.unmount()

    const monthly = mount(MonthlyCalendar, { props: {
      events: calendar.events, districtName: record.district.name,
      firstDay: calendar.firstDay, lastDay: calendar.lastDay,
    } })
    for (const date of ['2026-11-23', '2026-11-24', '2027-02-15', '2027-04-19']) {
      const cell = monthly.findAll('td').find(cell => cell.find(`time[datetime="${date}"]`).exists())!
      expect(cell.classes()).toContain('month-day--conditional')
      expect(cell.classes()).not.toContain('month-day--school-day')
      expect(monthly.find('#month-day-tooltip-' + date).text()).toContain('Possible Weather Make-Up')
    }
    expect(monthly.text()).toContain('Last Day for CHS and FWHS Seniors')
    monthly.unmount()
  })

  it('exports inclusive source ranges and attendance caveats with distinct ceremony dates', () => {
    const ics = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
    const entries = ics.split('BEGIN:VEVENT').slice(1)
    const entry = (key: string) => entries.find(item => item.includes('UID:' + event(key).id + '@'))!
    expect(entries).toHaveLength(28)
    expect(entry('thanksgiving-weather-reserve')).toContain('DTEND;VALUE=DATE:20261125')
    expect(entry('thanksgiving-weather-reserve')).toContain('attendance may change')
    expect(entry('holiday-break')).toContain('DTEND;VALUE=DATE:20270105')
    expect(entry('spring-break')).toContain('DTEND;VALUE=DATE:20270327')
    expect(entry('last-day')).toContain('DTEND;VALUE=DATE:20270527')
    expect(entry('chs-graduation')).toContain('DTSTART;VALUE=DATE:20270528')
    expect(entry('senior-last-day')).toContain('graduating seniors at Columbia High School and Fort White High School')
    expect(entry('thanksgiving-weather-reserve')).toContain('No School Scheduled · Possible Weather Make-Up')
    expect(entries.filter(item => item.includes('CATEGORIES:LAST_DAY'))).toHaveLength(2)
    expect(ics).not.toContain('DTSTART;VALUE=DATE:20270531')
  })
})
