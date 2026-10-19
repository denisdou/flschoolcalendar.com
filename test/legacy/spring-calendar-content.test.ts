import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CalendarEventsTable from '../../app/components/calendar/CalendarEventsTable.vue'
import MonthlyCalendar from '../../app/components/calendar/MonthlyCalendar.vue'
import record from '../fixtures/districts/spring-isd.json'
import type { CalendarEvent } from '../../shared/types/content'
// @ts-ignore Dependency-free validator used by the publish gate.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Dependency-free statistics generator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const regular = record.schoolYears['2026-2027']
const ace = record.schoolYears['2026-2027-ace']
const adsy = record.schoolYears['2026-2027-adsy']
const event = (calendar: typeof regular, id: string) => calendar.events.find(e => e.id === id)!
const expectedSummerDates = [
  '2027-06-01', '2027-06-02', '2027-06-03',
  '2027-06-07', '2027-06-08', '2027-06-09', '2027-06-10',
  '2027-06-14', '2027-06-15', '2027-06-16',
  '2027-06-21', '2027-06-22', '2027-06-23', '2027-06-24',
  '2027-06-28', '2027-06-29', '2027-06-30', '2027-07-01',
  '2027-07-06', '2027-07-07', '2027-07-08',
  '2027-07-12', '2027-07-13', '2027-07-14', '2027-07-15',
]

describe('Spring ISD campus calendars and conditional attendance', () => {
  it('passes the publish gate and preserves all three distinct attendance counts', () => {
    expect(auditRecords([{ filename: 'spring-isd.json', record }])).toEqual([])
    for (const [calendar, count] of [[regular, '172 days'], [ace, '181 days'], [adsy, '201 days']] as const) {
      expect(calculateCalendarStatistics(calendar).find((s: { id: string }) => s.id === 'student-attendance-days')?.value).toBe(count)
      expect(calendar.events.find(e => e.eventType === 'FIRST_DAY')?.name).toBe('First Day of School')
      expect(calendar.events.find(e => e.eventType === 'SEMESTER_START')?.dateStart).toBe('2027-01-05')
    }
  })

  it('can activate February 15 without treating it as permanently excluded', () => {
    for (const [calendar, activatedCount] of [[regular, '173 days'], [ace, '182 days'], [adsy, '202 days']] as const) {
      const activated = structuredClone(calendar)
      const conditional = activated.events.find(e => e.schoolStatus === 'conditional-attendance')!
      conditional.schoolStatus = 'schools-open'
      conditional.countsAsStudentAttendanceDayUnderPublishedSchedule = true
      conditional.mayBecomeAttendanceDay = false
      expect(calculateCalendarStatistics(activated).find((s: { id: string }) => s.id === 'student-attendance-days')?.value).toBe(activatedCount)
      const makeup = calendar.events.find(e => e.schoolStatus === 'conditional-attendance')!
      expect(makeup).not.toHaveProperty('countsAsStudentAttendanceDay')
      expect(calendar.noSchoolDayEventIds).not.toContain(makeup.id)
    }
  })

  it('shows the regular-class pause with the selected-student exception', () => {
    const pause = event(regular, 'spring-regular-mid-winter-fixed-dates')
    const intervention = event(regular, 'spring-regular-february-intervention')
    const wrapper = mount(CalendarEventsTable, { props: {
      events: [pause, intervention] as CalendarEvent[], districtName: 'Spring ISD', schoolYear: '2026-2027',
    } })
    expect(wrapper.text()).toContain('No regular classes')
    expect(wrapper.text()).toContain('Selected-Student Intervention')
    expect(wrapper.text()).toContain('Calculated from calendar')
    expect(intervention.participantScope).toBe('Selected students assigned intervention')
    wrapper.unmount()
  })

  it('separates program gaps from district closures while marking inferred dates', () => {
    const gap = event(adsy, 'spring-adsy-summer-friday-2027-06-04')
    const closure = event(adsy, 'spring-adsy-summer-friday-2027-07-02')
    const wrapper = mount(CalendarEventsTable, { props: {
      events: [gap, closure] as CalendarEvent[], districtName: 'Spring ISD', schoolYear: '2026-2027',
    } })
    const rows = wrapper.findAll('tbody tr')
    expect(rows[0]!.text()).toContain('No ADSY Session')
    expect(rows[0]!.text()).toContain('ADSY sessions only')
    expect(rows[0]!.text()).toContain('No program session')
    expect(rows[0]!.text()).not.toContain('Schools closed')
    expect(rows[0]!.text()).toContain('Calculated from calendar')
    expect(rows[1]!.text()).toContain('District Closed')
    expect(rows[1]!.text()).toContain('Calculated from calendar')
    expect(closure.nameBasis).toBe('official')
    expect(closure.dateBasis).toBe('derived')
    wrapper.unmount()

    const monthly = mount(MonthlyCalendar, { props: {
      events: adsy.events as CalendarEvent[], districtName: 'Spring ISD', firstDay: adsy.firstDay, lastDay: adsy.lastDay,
    } })
    expect(monthly.find('time[datetime="2027-06-04"]').text()).toContain('calculated from calendar')
    const gapCell = monthly.find('time[datetime="2027-06-04"]').element.closest('td')!
    expect(gapCell.className).not.toContain('month-day--holiday')
    expect(gapCell.className).not.toContain('month-day--school-day')
    expect(gapCell.textContent).toContain('ADSY sessions only')
    expect(monthly.find('time[datetime="2027-07-02"]').text()).toContain('calculated from calendar')
    monthly.unmount()
  })

  it('requires scoped source evidence before accepting a program gap', () => {
    const modified = structuredClone(record)
    const gap = modified.schoolYears['2026-2027-adsy'].events.find(e => e.id === 'spring-adsy-summer-friday-2027-06-04')!
    delete gap.scheduleScope
    expect(auditRecords([{ filename: 'spring-isd.json', record: modified }]).some((issue: { code: string }) => issue.code === 'INCOMPLETE_PROGRAM_GAP')).toBe(true)
  })

  it('keeps conditional holidays out of the monthly confirmed-closure styling', () => {
    for (const calendar of [regular, ace, adsy]) {
      const wrapper = mount(MonthlyCalendar, { props: {
        districtName: 'Spring ISD', events: calendar.events as CalendarEvent[],
        firstDay: calendar.firstDay, lastDay: calendar.lastDay,
      } })
      const cell = wrapper.find('time[datetime="2027-02-15"]').element.closest('td')!
      expect(cell.className).toContain('month-day--important')
      expect(cell.className).not.toContain('month-day--holiday')
      expect(cell.className).not.toContain('month-day--school-day')
      expect(cell.textContent).toMatch(/make-up/i)
      wrapper.unmount()
    }
  })

  it('retains precisely the 25 visually verified ADSY summer dates', () => {
    const summer = adsy.events.filter(e => e.dateStart >= '2027-06-01' && e.countsAsStudentAttendanceDay === true)
    const dates = summer.flatMap(e => {
      const values: string[] = []
      const end = e.dateEnd || e.dateStart
      for (const date = new Date(e.dateStart + 'T00:00:00Z'); date.toISOString().slice(0, 10) <= end; date.setUTCDate(date.getUTCDate() + 1)) {
        values.push(date.toISOString().slice(0, 10))
      }
      return values
    }).sort()
    expect(dates).toEqual(expectedSummerDates)
    expect(adsy.lastDay).toBe('2027-07-15')
    expect(event(adsy, 'spring-adsy-regular-last-day').name).toBe('End of Regular Grading Year')
    for (const e of adsy.events.filter(e => e.id.startsWith('spring-adsy-summer-friday-'))) {
      expect(e.eventType).toBe('NON_STUDENT_DAY')
      if (e.dateStart.startsWith('2027-06')) expect(e.name).toBe('No ADSY Session')
    }
  })
})
