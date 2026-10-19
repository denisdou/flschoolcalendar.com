import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import CalendarEventsTable from '../../app/components/calendar/CalendarEventsTable.vue'
import MonthlyCalendar from '../../app/components/calendar/MonthlyCalendar.vue'
import type { CalendarEvent } from '../../shared/types/content'
import record from '../fixtures/districts/socorro-isd.json'
// @ts-ignore Shared offline content gate.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Shared offline statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const calendar = record.schoolYears['2026-2027']
const events = calendar.events as CalendarEvent[]

function weekdays(start: string, end: string): Set<string> {
  const dates = new Set<string>()
  for (let day = new Date(`${start}T00:00:00Z`); day <= new Date(`${end}T00:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) {
    if (![0, 6].includes(day.getUTCDay())) dates.add(day.toISOString().slice(0, 10))
  }
  return dates
}

describe('Socorro ISD verified first day and student intersession scope', () => {
  it('corrects every first-day surface to July 27 and links direct district evidence', () => {
    expect(auditRecords([{ filename: 'socorro-isd.json', record }])).toEqual([])
    expect(calendar.firstDay).toBe('2026-07-27')
    expect(calendar.keyDates.find(k => k.eventType === 'FIRST_DAY')?.dateStart).toBe(calendar.firstDay)
    expect(calendar.seo.title).toBe('Socorro ISD Calendar 2026-2027: First Day, Breaks & PDF')
    expect(calendar.seo.description).toContain('July 27, 2026')
    expect(calendar.hero.mobileDescription).toContain('July 27, 2026')
    expect(calendar.hero.desktopDescription).toContain('Monday, July 27, 2026')
    expect(calendar.editorialSummary.paragraphs[0]).toContain('Monday, July 27, 2026')
    expect(calendar.editorialSummary.highlights[0]).toContain('July 27 first day')
    expect(calendar.faqs.find(f => f.question.includes('first day of school'))?.answer).toBe('The first day of school is Monday, July 27, 2026.')
    expect(calendar.faqs.find(f => f.question.includes('nine-week grading-period'))?.answer).toContain('The fourth begins March 31, and the last day of school is May 27.')
    expect(JSON.stringify(record)).not.toMatch(/2026-08-03|August 3|Aug\. 3|not the first student day/)
    const first = events.find(e => e.eventType === 'FIRST_DAY')!
    expect(first).toMatchObject({ dateStart: calendar.firstDay, sourceId: 'socorro-2026-2027-school-year-opening', dateBasis: 'official' })
    expect(calendar.sources.find(s => s.id === first.sourceId)).toMatchObject({
      url: 'https://www.sisd.net/o/spcrafaelhernando/article/3051001', publishedAt: '2026-07-29',
    })
    expect(first.noteSourceIds).toEqual(['socorro-2026-2027-calendar-pdf'])
  })

  it('keeps four grading starts and displays the July first-day milestone without duplicating its date row', () => {
    expect(events.filter(e => e.eventType === 'SCHOOL_MILESTONE').map(e => e.dateStart)).toEqual([
      '2026-07-27', '2026-10-14', '2027-01-06', '2027-03-31',
    ])
    const firstDayEvents = events.filter(e => e.dateStart === '2026-07-27')
    expect(firstDayEvents).toHaveLength(2)
    const table = mount(CalendarEventsTable, { props: { events: firstDayEvents, districtName: 'Socorro ISD', schoolYear: '2026-2027' } })
    expect(table.findAll('tbody tr')).toHaveLength(1)
    expect(table.text()).toContain('First Day of School')
    expect(table.text()).toContain('First Nine Weeks Begins')
    table.unmount()
    const month = mount(MonthlyCalendar, { props: { events: firstDayEvents, districtName: 'Socorro ISD', firstDay: calendar.firstDay, lastDay: calendar.lastDay } })
    expect(month.find('h3').text()).toContain('July 2026')
    expect(month.text()).toContain('First Day of School')
    month.unmount()
  })

  it('preserves intersession dates without inventing attendance, campus variation or a modified-day schedule', () => {
    const sessions = events.filter(e => e.eventType === 'INTERSESSION')
    expect(sessions.map(e => [e.dateStart, e.dateEnd])).toEqual([
      ['2026-09-28', '2026-10-09'], ['2027-03-15', '2027-03-19'],
    ])
    for (const e of sessions) {
      expect(e).toMatchObject({ schoolStatus: 'unknown', schoolStatusReason: 'source-does-not-state', schoolStatusLabel: 'Participation not specified', basis: 'official', dateBasis: 'official', eventTypeBasis: 'derived' })
      expect(e.scheduleType).toBeUndefined()
      expect(e.scheduleScope).toBeUndefined()
      expect(e.countsAsStudentAttendanceDay).toBeUndefined()
      expect(calendar.noSchoolDayEventIds).not.toContain(e.id)
      expect(calendar.breaks.some(b => b.dateStart === e.dateStart)).toBe(false)
    }
    const key = calendar.keyDates.find(k => k.label === 'Fall student intersession')!
    expect(key).toMatchObject({ eventType: 'INTERSESSION', dateBasis: 'official', labelBasis: 'official', eventTypeBasis: 'derived' })
    expect(key).not.toHaveProperty('basis')
    const table = mount(CalendarEventsTable, { props: { events: sessions, districtName: 'Socorro ISD', schoolYear: '2026-2027' } })
    expect(table.text()).toContain('Participation not specified')
    expect(table.text()).not.toContain('Varies by school')
    table.unmount()
  })

  it('reconciles the regular instructional grid to the printed 86 fall and 89 spring days', () => {
    const regularExclusions = new Set<string>()
    for (const e of events.filter(e => calendar.noSchoolDayEventIds.includes(e.id) || e.eventType === 'INTERSESSION')) {
      for (const day of weekdays(e.dateStart, e.dateEnd || e.dateStart)) regularExclusions.add(day)
    }
    const fall = [...weekdays(calendar.firstDay, '2026-12-18')].filter(d => !regularExclusions.has(d))
    const spring = [...weekdays('2027-01-06', calendar.lastDay)].filter(d => !regularExclusions.has(d))
    expect(fall).toHaveLength(86)
    expect(spring).toHaveLength(89)
    expect(fall.length + spring.length).toBe(175)
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
    expect(calendar.statistics.find(s => s.id === 'student-attendance-days')).toMatchObject({ value: '175 days', basis: 'official' })
    expect(calendar.statistics.find(s => s.id === 'total-no-school-weekdays')?.value).toBe('29 weekdays')
    expect(calendar.statistics.find(s => s.id === 'early-release-days')?.value).toBe('3 dates')
    // Intersession is not a districtwide holiday: without the printed total,
    // do not infer everyone's attendance from unresolved participation.
    expect(calculateCalendarStatistics({ ...calendar, highlights: [] }).some((s: { id: string }) => s.id === 'student-attendance-days')).toBe(false)
  })

  it('answers fall-break terminology and both open-house seasons without stale future-year claims', () => {
    expect(calendar.faqs).toHaveLength(22)
    expect(calendar.faqs.find(f => f.question.includes('have a fall break'))?.answer).toContain('does not use the term "fall break" on its 2026-2027 calendar')
    expect(calendar.faqs.find(f => f.question.includes('Who attends'))?.answer).toContain('does not specify which students')
    expect(calendar.faqs.find(f => f.question.includes('fall open house'))?.answer).toContain('September 8, Elementary/PK-8 Open House on September 9, and High School Open House on September 10, 2026')
    expect(calendar.faqs.find(f => f.question.includes('spring open house'))?.answer).toContain('February 23, Elementary/K-8 Open House on February 24, and High School Open House on February 25, 2027')
    expect(calendar.faqs.some(f => f.question.includes('posted a 2027-2028'))).toBe(false)
  })

  it('keeps final wording source-faithful without unsupported attendance or publication claims', () => {
    expect(calendar.seo.description).toBe("Socorro ISD's 2026-2027 school year starts July 27, 2026, and ends May 27, 2027. See breaks, intersessions, early-release dates and the official PDF.")
    expect(calendar.hero.mobileDescription).toContain('The calendar also lists two student intersessions.')
    expect(calendar.hero.desktopDescription).toContain('staff development mean students return March 31.')
    expect(calendar.editorialSummary.paragraphs[1]).toMatch(/^SISD's 2026-2027 calendar lists two student intersessions:/)
    const staffDays = events.filter(e => e.eventType === 'NON_STUDENT_DAY')
    expect(staffDays).toHaveLength(3)
    for (const e of staffDays) {
      expect(e).toMatchObject({ name: 'Staff Development', officialLabel: 'Staff Development', nameBasis: 'official', schoolStatus: 'no-classes', schoolStatusBasis: 'derived' })
    }
    expect(events.find(e => e.id === 'socorro-2026-veterans-day')).toMatchObject({ name: 'Veterans Day Holiday', officialLabel: "Veteran's Day Holiday", nameBasis: 'official' })
    expect(events.find(e => e.id === 'socorro-2027-third-nine-weeks-start')).toMatchObject({ note: 'Students return to class after winter break and staff development.', noteBasis: 'derived' })
    expect(calendar.faqs.find(f => f.question.includes('official SISD calendar'))?.answer).toBe("The official 2026-2027 Student Calendar PDF is linked on this page and through Socorro ISD's Student Calendars page.")
    expect(JSON.stringify(calendar.faqs)).not.toContain('PDF is dated')
    expect(calendar.faqs.find(f => f.question.includes('nine-week grading-period'))?.answer).not.toMatch(/fourth.*ends May 27/)
    expect(calendar.faqs.find(f => f.question.includes('instructional days'))?.answer).toBe('Socorro ISD lists 175 instructional days for 2026-2027: 86 in the fall and 89 in the spring.')
    expect(calendar.faqs.find(f => f.question.includes('Who attends'))?.question).toBe("Who attends Socorro ISD's fall and spring intersessions?")
    expect(calendar.faqs.find(f => f.question.includes('Martin Luther King Jr. Day'))).toEqual({ question: 'Is there school in Socorro ISD on Martin Luther King Jr. Day?', answer: 'No. Monday, January 18, 2027, is listed as the Martin Luther King Jr. holiday.' })
  })

  it('exposes all published early releases and grading ends as independently queryable events', () => {
    expect(events).toHaveLength(25)
    expect(events.filter(e => e.eventType === 'EARLY_RELEASE').map(e => e.dateStart)).toEqual([
      '2026-11-03', '2026-12-18', '2027-05-27',
    ])
    expect(events.filter(e => e.eventType === 'GRADING_PERIOD_END').map(e => e.dateStart)).toEqual([
      '2026-09-25', '2026-12-18', '2027-03-12',
    ])
    expect(events.find(e => e.id === 'socorro-2026-december-early-release')?.name).toBe('Early Release')
    expect(events.find(e => e.id === 'socorro-2026-second-nine-weeks-end')).toMatchObject({ eventType: 'GRADING_PERIOD_END', dateStart: '2026-12-18', name: 'End of Second Nine Weeks', officialLabel: 'End of 2nd Nine Weeks', basis: 'official', note: null })
    expect(events.find(e => e.id === 'socorro-2027-last-day')?.name).toBe('Last Day of School')
    expect(events.find(e => e.id === 'socorro-2027-may-27-early-release')).toMatchObject({ eventType: 'EARLY_RELEASE', dateStart: '2027-05-27', schoolStatus: 'early-dismissal', basis: 'official' })
    expect(events.filter(e => e.eventType === 'GRADING_PERIOD_END').some(e => e.dateStart === '2027-05-27')).toBe(false)
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
    const sameDateEvents = events.filter(e => ['2026-12-18', '2027-05-27'].includes(e.dateStart!))
    const table = mount(CalendarEventsTable, { props: { events: sameDateEvents, districtName: 'Socorro ISD', schoolYear: '2026-2027' } })
    expect(table.findAll('tbody tr')).toHaveLength(2)
    expect(table.text()).toContain('End of Second Nine Weeks')
    expect(table.text()).toContain('Last Day of School')
    expect(table.findAll('.calendar-event-name')).toHaveLength(4)
    table.unmount()
  })

  it('exports the corrected first day and uncertain intersessions without an August 3 opening', () => {
    execFileSync(process.execPath, ['scripts/generate-ics.mjs'], { cwd: process.cwd() })
    const ics = readFileSync(`test/fixtures${calendar.actions.staticIcsUrl}`, 'utf8').replace(/\r\n /g, '')
    const first = ics.split('BEGIN:VEVENT').find(e => e.includes('UID:socorro-2026-first-day@'))!
    expect(first).toContain('DTSTART;VALUE=DATE:20260727')
    expect(first).toContain('SUMMARY:First Day of School')
    expect(first).toContain('Source: https://www.sisd.net/o/spcrafaelhernando/article/3051001')
    expect(ics).not.toContain('DTSTART;VALUE=DATE:20260803')
    expect((ics.match(/BEGIN:VEVENT/g) || []).length).toBe(25)
    expect((ics.match(/CATEGORIES:EARLY_RELEASE/g) || []).length).toBe(3)
    expect((ics.match(/CATEGORIES:GRADING_PERIOD_END/g) || []).length).toBe(3)
    const secondEnd = ics.split('BEGIN:VEVENT').find(e => e.includes('UID:socorro-2026-second-nine-weeks-end@'))!
    expect(secondEnd).toContain('DTSTART;VALUE=DATE:20261218')
    expect(secondEnd).toContain('CATEGORIES:GRADING_PERIOD_END')
    const finalRelease = ics.split('BEGIN:VEVENT').find(e => e.includes('UID:socorro-2027-may-27-early-release@'))!
    expect(finalRelease).toContain('DTSTART;VALUE=DATE:20270527')
    expect(finalRelease).toContain('CATEGORIES:EARLY_RELEASE')
    expect((ics.match(/CATEGORIES:INTERSESSION/g) || []).length).toBe(2)
    expect(ics).toContain('School status: Participation not specified')
    expect(ics).not.toContain('School status: varied by school')
  })
})
