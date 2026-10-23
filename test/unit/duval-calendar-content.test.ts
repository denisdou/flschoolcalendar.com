import { readFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CalendarEventsTable from '../../app/components/calendar/CalendarEventsTable.vue'
import MonthlyCalendar from '../../app/components/calendar/MonthlyCalendar.vue'
import type { DistrictCalendar, DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/duval-county-public-schools.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore Dependency-free content checker.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord
const current = record.schoolYears['2026-2027']!
const next = record.schoolYears['2027-2028']!
const calendars = [current, next]
const on = (calendar: DistrictCalendar, date: string) => calendar.events.find(item => item.dateStart === date)!
function weekdays(start: string, end: string) {
  const dates: string[] = []
  for (const cursor = new Date(start + 'T00:00:00Z'); cursor <= new Date(end + 'T00:00:00Z'); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (![0, 6].includes(cursor.getUTCDay())) dates.push(cursor.toISOString().slice(0, 10))
  }
  return dates
}
function noClassDates(calendar: DistrictCalendar, ids = calendar.confirmedNoSchoolDayEventIds!) {
  return new Set(ids.flatMap(id => {
    const event = calendar.events.find(item => item.id === id)!
    return weekdays(event.dateStart!, event.dateEnd || event.dateStart!)
  }))
}

describe('Duval official HTML calendars and year-specific interpretation', () => {
  it('uses real HTML calendar actions and the explicitly dated 2026 revision', () => {
    expect(record.district).toMatchObject({ id: 'FL-16', name: 'Duval County Public Schools', timeZone: 'America/New_York' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027', '2027-2028'])
    expect(current).toMatchObject({ status: 'revised', approvedAt: '2026-04-07', boardRevisionApprovedAt: '2026-04-07', firstDay: '2026-08-10', lastDay: '2027-05-28' })
    expect(next).toMatchObject({ status: 'official', approvedAt: null, firstDay: '2027-08-10', lastDay: '2028-05-26' })
    for (const [index, calendar] of calendars.entries()) {
      expect(calendar.actions.officialPdfUrl).toBeNull()
      expect(calendar.actions.officialCalendarUrl).toBe('https://www.duvalschools.org/page/calendar' + ['2627', '2728'][index])
      expect(calendar.sources.some(source => source.type === 'official-pdf')).toBe(false)
      expect(calendar.sourceDiscrepancies?.some(item => item.field === 'calendarPageHeading')).toBe(true)
      expect(calendar.publishedAt).toBeNull()
    }
    expect(auditRecords([{ filename: record.district.slug + '.json', record }])).toEqual([])
  })

  it('uses the revised October and March dates without inventing November closures', () => {
    for (const day of ['2026-10-12', '2026-10-13', '2027-01-04', '2027-01-05', '2027-03-11', '2027-03-12']) {
      expect(on(current, day)).toMatchObject({ schoolStatus: 'no-classes', countsAsStudentAttendanceDay: false })
    }
    expect(on(current, '2027-03-11').officialLabel).toBe('Professional Development Day')
    expect(on(current, '2027-03-12').officialLabel).toBe('Employee Planning/Inservice')
    for (const day of ['2026-11-12', '2026-11-13', '2027-03-22', '2027-03-23', '2027-03-24', '2027-03-25']) expect(noClassDates(current).has(day)).toBe(false)
    expect(on(current, '2026-10-09').schoolStatus).toBe('not-applicable')
    expect(on(current, '2027-03-10').schoolStatus).toBe('not-applicable')
    expect(current.faqs.find(item => item.question.startsWith('Do Duval students have school on November'))?.answer).toContain('Those two days are regular school days')
  })

  it('keeps separate school-only and schools-and-office closure ranges', () => {
    expect(on(current, '2026-11-23')).toMatchObject({ dateEnd: '2026-11-25', officialLabel: 'Schools Closed', nameBasis: 'derived', dateBasis: 'official' })
    expect(on(current, '2026-11-26')).toMatchObject({ dateEnd: '2026-11-27', officialLabel: 'Schools/Admin Offices Closed' })
    expect(on(current, '2026-12-21')).toMatchObject({ dateEnd: '2026-12-23', officialLabel: 'Schools Closed' })
    expect(on(current, '2026-12-24')).toMatchObject({ dateEnd: '2027-01-01', officialLabel: 'Schools/Admin Offices Closed' })
    expect(on(next, '2027-11-22').dateEnd).toBe('2027-11-24')
    expect(on(next, '2027-11-25').dateEnd).toBe('2027-11-26')
    expect(on(next, '2027-12-20').dateEnd).toBe('2027-12-22')
    expect(on(next, '2027-12-23').dateEnd).toBe('2027-12-31')
  })

  it('checks every weekday in each derived continuous break and preserves different spring returns', () => {
    expect(current.breaks.map(item => [item.dateStart, item.dateEnd, item.nextStudentAttendanceDate, item.schoolWeekdaysOff])).toEqual([
      ['2026-11-21', '2026-11-29', '2026-11-30', 5],
      ['2026-12-19', '2027-01-05', '2027-01-06', 12],
      ['2027-03-11', '2027-03-21', '2027-03-22', 7],
    ])
    expect(next.breaks.map(item => [item.dateStart, item.dateEnd, item.nextStudentAttendanceDate, item.schoolWeekdaysOff])).toEqual([
      ['2027-11-20', '2027-11-28', '2027-11-29', 5],
      ['2027-12-18', '2028-01-04', '2028-01-05', 12],
      ['2028-03-11', '2028-03-21', '2028-03-22', 7],
    ])
    for (const calendar of calendars) {
      const off = noClassDates(calendar)
      for (const span of calendar.breaks) {
        for (const day of weekdays(span.dateStart, span.dateEnd)) expect(off.has(day)).toBe(true)
        expect(span.basis).toBe('derived')
        expect(span.nextStudentAttendanceDateBasis).toBe('derived')
        expect(off.has(span.nextStudentAttendanceDate!)).toBe(false)
        expect([...noClassDates(calendar, span.componentEventIds!)]).toEqual(weekdays(span.dateStart, span.dateEnd))
      }
    }
    expect(current.breaks.some(item => item.dateEnd >= '2027-03-26' && item.dateStart <= '2027-03-19')).toBe(false)
  })

  it('records all four 2026-2027 weather reserves with their no-class baseline and post-year extension', () => {
    const conditional = noClassDates(current, current.conditionalNoSchoolDayEventIds!)
    expect([...conditional]).toEqual(['2027-03-29', '2027-04-26', '2027-06-01', '2027-06-02'])
    for (const id of current.conditionalNoSchoolDayEventIds!) {
      const event = current.events.find(item => item.id === id)!
      expect(event).toMatchObject({ eventType: 'WEATHER_DAY', eventTypes: ['WEATHER_DAY', 'MAKEUP_DAY'], schoolStatus: 'no-classes', scheduledAsNoSchool: true, mayBecomeAttendanceDay: true, countsAsStudentAttendanceDayUnderPublishedSchedule: false, attendanceStatusBasisSourceId: 'duval-2026-revision' })
      expect(event.countsAsStudentAttendanceDay).toBeUndefined()
      expect(current.confirmedNoSchoolDayEventIds).not.toContain(id)
    }
    expect(on(current, '2027-03-29').note).toContain('First reserved')
    expect(on(current, '2027-04-26').note).toContain('Second reserved')
    expect(on(current, '2027-06-01').note).toContain('Third and fourth reserved')
    expect(current.faqs.find(item => item.question.includes('weather make-up days'))?.answer).toContain('chronological order')
    expect(current.lastDayConditional).toBe(true)
    expect(current.lastDayCondition).toContain('June 1-2')
    expect(on(current, '2027-05-31').schoolStatus).toBe('schools-closed')
  })

  it('keeps 2027-2028 Weather Day markers unresolved instead of copying the previous year’s rule', () => {
    const reserves = next.events.filter(item => hasEventType(item, 'WEATHER_DAY'))
    expect(reserves.map(item => [item.dateStart, item.dateEnd])).toEqual([['2028-02-18', null], ['2028-04-17', null], ['2028-05-30', '2028-05-31']])
    for (const event of reserves) {
      expect(event.schoolStatus).toBe('conditional-attendance')
      expect(event.scheduledAsNoSchool).toBeUndefined()
      expect(event.countsAsStudentAttendanceDayUnderPublishedSchedule).toBeUndefined()
      expect(event.countsAsStudentAttendanceDay).toBeUndefined()
      expect(hasEventType(event, 'MAKEUP_DAY')).toBe(false)
      expect(next.confirmedNoSchoolDayEventIds).not.toContain(event.id)
      expect(next.conditionalNoSchoolDayEventIds).not.toContain(event.id)
    }
    expect(next.attendanceUncertaintyDates).toEqual(['2028-02-18', '2028-04-17'])
    expect(next.statistics.some(item => item.id === 'student-attendance-days')).toBe(false)
    expect(next.statistics.find(item => item.id === 'total-no-school-weekdays')?.explanation).toContain('attendance still to be confirmed')
    expect(next.breaks.some(item => item.dateStart.startsWith('2028-02') || item.dateStart.startsWith('2028-04'))).toBe(false)
  })

  it('derives only the supported baseline, omits zero statistics and keeps published grading meanings', () => {
    const fixed = noClassDates(current)
    const weather = noClassDates(current, current.conditionalNoSchoolDayEventIds!)
    expect(weekdays(current.firstDay!, current.lastDay!)).toHaveLength(210)
    expect(weekdays(current.firstDay!, current.lastDay!).filter(day => fixed.has(day))).toHaveLength(31)
    expect(weekdays(current.firstDay!, current.lastDay!).filter(day => weather.has(day))).toHaveLength(2)
    expect(current.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value: '177 days', basis: 'derived' })
    for (const calendar of calendars) {
      expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
      expect(calendar.statistics.some(item => /^0(?:\s|$)/.test(item.value))).toBe(false)
      expect(calendar.events.some(item => hasEventType(item, 'EARLY_RELEASE'))).toBe(false)
      expect(calendar.events.some(item => /\bFTE\b|payroll|compensation|preplanning|postplanning/i.test(item.name))).toBe(false)
      expect(calendar.events.some(item => ['REPORT_CARD', 'PROGRESS_REPORT', 'SEMESTER_END', 'SEMESTER_START'].includes(item.eventType))).toBe(false)
    }
    expect(on(current, '2027-05-28').eventTypes).toEqual(['LAST_DAY', 'GRADING_PERIOD_END'])
    expect(on(next, '2028-05-26').eventTypes).toBeUndefined()
    expect(calendars.map(calendar => calendar.events.filter(item => item.dateStart! > calendar.lastDay!).every(item => ['HOLIDAY', 'WEATHER_DAY'].includes(item.eventType)))).toEqual([true, true])
  })

  it('keeps bell-time scope and the Ribault conflict separate from annual attendance', () => {
    const hours = current.schoolHours as Array<{ scope: string; regularHours: string; sourceId: string; effectiveThrough?: string }>
    expect(hours).toHaveLength(25)
    expect(hours[2]).toMatchObject({ regularHours: '7:10 a.m.-2:05 p.m.' })
    expect(hours[2]!.scope).toContain('excluding')
    expect(hours[2]!.scope).toContain('Jean Ribault High')
    expect(hours.some(item => item.scope.startsWith('High school exceptions:') && item.scope.includes('Jean Ribault'))).toBe(false)
    expect(hours.some(item => item.scope.startsWith('Middle school exceptions:') && item.scope.includes('Jean Ribault') && item.regularHours === '7:30 a.m. - 2:15 p.m.')).toBe(true)
    expect(hours.every(item => !item.effectiveThrough)).toBe(true)
    expect(next.schoolHours).toEqual([])
    expect(current.sourceDiscrepancies?.some(item => item.field === 'ribaultHighDismissalTime' && item.resolution === 'unresolved')).toBe(true)
    const conflict = current.sourceDiscrepancies?.find(item => item.field === 'ribaultHighDismissalTime')!
    expect(conflict.effect).toContain('campus CMS version captured on October 21, 2026 lists 7:10 a.m.-2:05 p.m.')
    expect(conflict.effect).toContain('indexed campus contact page lists 7:25 a.m.-1:50 p.m.')
    expect(conflict.effect).toContain('No verified effective date or superseding notice establishes which schedule controls')
    expect(conflict.sourceIds).toContain('ribault-contact-cms')
  })

  it('has independent family questions with year-specific early-release and weather guidance', () => {
    expect(calendars.map(item => item.faqs.length)).toEqual([20, 20])
    for (const calendar of calendars) expect(new Set(calendar.faqs.map(item => item.question)).size).toBe(calendar.faqs.length)
    expect(current.faqs.find(item => item.question.startsWith('Are there early-release'))?.answer).toContain('No regular early-release days are scheduled for 2026-2027')
    expect(next.faqs.find(item => item.question.startsWith('Are there early-release'))?.answer).toContain('year-specific early-release policy for 2027-2028 has not been verified')
    expect(next.faqs.find(item => item.question.startsWith('Are Duval students off April'))?.answer).toContain('attendance still to be confirmed')
    expect(next.faqs.find(item => item.question.startsWith('What are the weather make-up'))?.answer).toContain('does not establish a year-specific activation order')
    expect(current.faqs.find(item => item.question.startsWith('Can I get a PDF'))?.answer).toContain('dcpsnews@duvalschools.org')
    expect(next.faqs.find(item => item.question.startsWith('Is there a PDF'))?.answer).not.toContain('dcpsnews@duvalschools.org')
  })

  it('distinguishes scheduled student-free weather reserves from unconfirmed attendance in both calendar views', () => {
    for (const [calendar, date, label] of [
      [current, '2027-03-29', 'No School Scheduled · Possible Weather Make-Up'],
      [next, '2028-02-18', 'Weather Day — Attendance Subject to District Confirmation'],
    ] as const) {
      const table = mount(CalendarEventsTable, { props: {
        events: calendar.events, districtName: record.district.name, schoolYear: calendar.schoolYear,
      } })
      const row = table.findAll('tbody tr').find(row => row.find('time').attributes('datetime') === date)!
      expect(row.find('.badge--conditional').text()).toBe(label)
      expect(row.find('.badge--closed').exists()).toBe(false)
      table.unmount()
      const monthly = mount(MonthlyCalendar, { props: {
        events: calendar.events, districtName: record.district.name, firstDay: calendar.firstDay, lastDay: calendar.lastDay,
      } })
      const cell = monthly.findAll('td').find(cell => cell.find(`time[datetime="${date}"]`).exists())!
      expect(cell.classes()).toContain('month-day--conditional')
      expect(cell.classes()).not.toContain('month-day--school-day')
      expect(monthly.find('#month-day-tooltip-' + date).text()).toContain(label)
      monthly.unmount()
    }
  })

  it('exports exact inclusive range ends, HTML sources and post-end weather dates', () => {
    for (const calendar of calendars) {
      const ics = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
      const entries = ics.split('BEGIN:VEVENT').slice(1)
      const entry = (day: string) => entries.find(item => item.includes('UID:' + on(calendar, day).id + '@'))!
      expect(entries).toHaveLength(calendar.events.length)
      expect(ics).toContain(calendar.actions.officialCalendarUrl)
      expect(ics).not.toContain('CATEGORIES:EARLY_RELEASE')
      if (calendar === current) {
        expect(entry('2026-11-23')).toContain('DTEND;VALUE=DATE:20261126')
        expect(entry('2026-12-24')).toContain('DTEND;VALUE=DATE:20270102')
        expect(entry('2027-06-01')).toContain('DTEND;VALUE=DATE:20270603')
        expect(entry('2027-06-01')).toContain('attendance may change')
        expect(entry('2027-05-28')).toContain('CATEGORIES:LAST_DAY,GRADING_PERIOD_END')
      } else {
        expect(entry('2027-12-23')).toContain('DTEND;VALUE=DATE:20280101')
        expect(entry('2028-03-13')).toContain('DTEND;VALUE=DATE:20280318')
        expect(entry('2028-05-30')).toContain('DTEND;VALUE=DATE:20280601')
        expect(entry('2028-02-18')).toContain('Attendance Subject to District Confirmation')
        expect(entry('2028-02-18')).not.toContain('No School Scheduled')
      }
    }
  })
})
