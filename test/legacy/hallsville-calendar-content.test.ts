import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import CalendarEventsTable from '../../app/components/calendar/CalendarEventsTable.vue'
import CalendarBellTimes from '../../app/components/calendar/CalendarBellTimes.vue'
import type { CalendarEvent, DistrictRecord } from '../../shared/types/content'
import { buildDistrictCatalog } from '../../shared/utils/districts'
import record from '../fixtures/districts/hallsville-isd.json'
// @ts-ignore Shared offline content gate.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Shared offline statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'
// @ts-ignore Shared taxonomy helper.
import { hasEventType } from '../../shared/utils/eventTypes.mjs'

const calendar = record.schoolYears['2026-2027']
const events = calendar.events as CalendarEvent[]
const event = (id: string) => events.find(e => e.id === `hallsville-${id}`)!
const range = (start: string, end = start) => {
  const result: string[] = []
  for (const d = new Date(`${start}T00:00:00Z`); d <= new Date(`${end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) result.push(d.toISOString().slice(0, 10))
  return result
}
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() % 6 !== 0
const closed = new Set(events.filter(e => calendar.confirmedNoSchoolDayEventIds.includes(e.id)).flatMap(e => range(e.dateStart!, e.dateEnd || e.dateStart!)).filter(weekday))

describe('Hallsville ISD current calendar and student scope', () => {
  it('identifies Hallsville rather than Houston and exposes only the sourced year', () => {
    expect(record.district).toMatchObject({ id: '102904', slug: 'hallsville-isd', countySlug: 'harrison-county', regionSlug: 'region-7' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027'])
    expect(auditRecords([{ filename: 'hallsville-isd.json', record }])).toEqual([])
    expect(buildDistrictCatalog([record as DistrictRecord]).districts[0]?.calendarPages[0]?.href).toBe('/hallsville-isd/2026-2027/')
    expect(calendar.seo.title).toBe('Hallsville ISD Calendar 2026-2027: Holidays & Breaks')
    expect(calendar.seo.description.length).toBeLessThanOrEqual(160)
  })

  it('does not infer approval from the July filename or PDF modification date', () => {
    expect(calendar.approvedAt).toBe('2026-01-20')
    expect(calendar.printedBoardApprovalDate).toBe('2026-01-20')
    expect(calendar.publishedAt).toBeNull()
    expect(calendar.lastOfficialRevisionAt).toBeNull()
    expect(calendar.sourceDocumentUpdatedAt).toBeNull()
    expect(calendar.sources[0]?.contentHash).toBe('ab60d73a7e0f8cf11101590470613e56030c1ce6ae89c6dd5fb0bd13e2194c5d')
    expect(calendar.sources[0]?.label).toContain('V20260120v3')
    expect(calendar.sources[0]?.url).toContain('7-21-26.pdf')
  })

  it('keeps the inferred final student date on the published attendance occurrence', () => {
    expect(calendar.firstDay).toBe('2026-08-13')
    expect(calendar.lastDay).toBe('2027-05-27')
    expect(calendar.lastDayBasis).toBe('derived')
    expect(events.filter(e => e.dateStart === '2027-05-27')).toHaveLength(1)
    expect(event('2027-may-early-release')).toMatchObject({ eventType: 'EARLY_RELEASE', isFinalStudentDate: true, finalStudentDateBasis: 'derived', finalStudentDateScope: 'regular-year' })
    expect(events.some(e => hasEventType(e, 'LAST_DAY'))).toBe(false)
    expect(calendar.keyDates.find(k => k.eventType === 'CALENDAR_END')).toMatchObject({ dateStart: '2027-05-27', basis: 'derived' })
  })

  it('preserves all four grading starts and ends and both semester-ending releases', () => {
    expect(events.filter(e => hasEventType(e, 'GRADING_PERIOD_START')).map(e => e.dateStart)).toEqual(['2026-08-13', '2026-10-21', '2027-01-06', '2027-03-22'])
    expect(events.filter(e => hasEventType(e, 'GRADING_PERIOD_END')).map(e => e.dateStart)).toEqual(['2026-10-09', '2026-12-17', '2027-03-12', '2027-05-27'])
    expect(events.filter(e => hasEventType(e, 'EARLY_RELEASE')).map(e => e.dateStart)).toEqual(['2026-12-17', '2027-05-27'])
    for (const date of ['2026-12-17', '2027-05-27']) {
      const occurrence = events.filter(e => e.dateStart === date)
      expect(occurrence).toHaveLength(1)
      expect(hasEventType(occurrence[0], 'SEMESTER_END')).toBe(true)
      expect(occurrence[0]?.note).toContain('12:30 p.m.')
      const table = mount(CalendarEventsTable, { props: { events: occurrence, districtName: 'Hallsville ISD', schoolYear: '2026-2027' } })
      expect(table.findAll('tbody tr')).toHaveLength(1)
      expect(table.text()).toContain('Early Release')
      table.unmount()
    }
  })

  it('stores the published 12:30 dismissal in the independent school-hours module', () => {
    expect(calendar.schoolHours[0]).toMatchObject({ earlyReleaseTime: '12:30 p.m.', sourceId: 'hallsville-2026-2027-calendar-pdf', basis: 'official' })
    expect(calendar.schoolHours[0]?.scope).toContain('excluding TVAH')
    const card = mount(CalendarBellTimes, { props: { hours: calendar.schoolHours, sources: calendar.sources, heading: 'Hallsville ISD early-release times' } })
    expect(card.text()).toContain('12:30 p.m.')
    card.unmount()
  })

  it('keeps fall and winter Staff Days outside officially named breaks', () => {
    expect(event('2026-fall-break')).toMatchObject({ dateStart: '2026-10-12', dateEnd: '2026-10-16' })
    expect(event('2026-october-staff-days')).toMatchObject({ dateStart: '2026-10-19', dateEnd: '2026-10-20', eventType: 'NON_STUDENT_DAY' })
    expect(event('2026-christmas-break')).toMatchObject({ dateStart: '2026-12-21', dateEnd: '2026-12-31' })
    expect(event('2027-christmas-break-january')).toMatchObject({ dateStart: '2027-01-01', dateEnd: null, officialLabel: 'Christmas Break' })
    expect(event('2027-christmas-break-january').eventType).toBe('WINTER_BREAK')
    expect(hasEventType(event('2027-christmas-break-january'), 'HOLIDAY')).toBe(true)
    expect(events.filter(e => hasEventType(e, 'WINTER_BREAK')).map(e => [e.dateStart, e.dateEnd])).toEqual([
      ['2026-12-21', '2026-12-31'], ['2027-01-01', null],
    ])
    expect(event('2027-january-staff-days')).toMatchObject({ dateStart: '2027-01-04', dateEnd: '2027-01-05', eventType: 'NON_STUDENT_DAY' })
    expect(closed.has('2026-12-17')).toBe(false)
    expect(closed.has('2027-01-06')).toBe(false)
  })

  it('proves every weekday in every derived student break is off', () => {
    for (const b of calendar.breaks) {
      const weekdays = range(b.dateStart, b.dateEnd).filter(weekday)
      expect(weekdays.every(d => closed.has(d))).toBe(true)
      expect(weekdays).toHaveLength(b.schoolWeekdaysOff)
      expect(b.basis).toBe('derived')
      expect(b.schoolWeekdaysOffNote.length).toBeGreaterThan(15)
      expect(b.componentEventIds.every(id => calendar.confirmedNoSchoolDayEventIds.includes(id))).toBe(true)
      expect(closed.has(b.lastStudentAttendanceDate)).toBe(false)
      expect(closed.has(b.nextStudentAttendanceDate)).toBe(false)
    }
    expect(calendar.breaks.find(b => b.name === 'Fall student break')).toMatchObject({ dateStart: '2026-10-10', dateEnd: '2026-10-20', nextStudentAttendanceDate: '2026-10-21', schoolWeekdaysOff: 7 })
    expect(calendar.breaks.find(b => b.name === 'Winter student break')).toMatchObject({ dateStart: '2026-12-18', dateEnd: '2027-01-05', nextStudentAttendanceDate: '2027-01-06', schoolWeekdaysOff: 13 })
  })

  it('reconciles 170 student dates with both printed semester subtotals', () => {
    expect(closed.size).toBe(36)
    expect(range(calendar.firstDay, calendar.lastDay).filter(d => weekday(d) && !closed.has(d))).toHaveLength(170)
    expect(range('2026-08-13', '2026-12-17').filter(d => weekday(d) && !closed.has(d))).toHaveLength(78)
    expect(range('2027-01-06', '2027-05-27').filter(d => weekday(d) && !closed.has(d))).toHaveLength(92)
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
    expect(calendar.statistics.find(s => s.id === 'student-attendance-days')).toMatchObject({ value: '170 days', basis: 'official' })
    expect(calendar.statistics.find(s => s.id === 'student-no-school-days')).toMatchObject({ value: '7 days', label: 'Student days off for in-year Staff Days' })
    expect(calendar.statistics.find(s => s.id === 'early-release-days')?.value).toBe('2 dates')
  })

  it('groups testing symbols only across consecutive weekdays', () => {
    const testing = events.filter(e => e.eventType === 'EXAM')
    expect(testing.map(e => [e.dateStart, e.dateEnd])).toEqual([
      ['2026-12-01', '2026-12-04'], ['2026-12-07', '2026-12-11'],
      ['2027-04-05', '2027-04-09'], ['2027-04-12', '2027-04-16'], ['2027-04-19', '2027-04-23'], ['2027-04-26', '2027-04-30'],
      ['2027-06-14', '2027-06-18'], ['2027-06-21', '2027-06-25'],
    ])
    expect(testing.every(e => range(e.dateStart!, e.dateEnd!).every(weekday))).toBe(true)
    expect(testing.every(e => e.dateBasis === 'derived' && e.isWindow && e.basis === 'official' && !e.gradeScope && !e.participantScope)).toBe(true)
    expect(testing.slice(0, 6).every(e => e.schoolStatus === 'schools-open')).toBe(true)
    expect(testing.slice(6).every(e => e.schoolStatus === 'program-specific')).toBe(true)
    expect(event('2027-06-14-testing').note).toContain('June 18')
    expect(event('2027-06-21-testing').note).toContain('June 25')
    expect(events.some(e => e.schoolStatus === 'exam-day')).toBe(false)
  })

  it('excludes employee training, office-only closures and staff make-up events', () => {
    expect(events.some(e => /Teacher Academy|New to HISD|Make-up Day Staff|Offices Closed/.test(e.name))).toBe(false)
    expect(events.some(e => ['2026-08-03', '2026-08-04', '2026-08-12', '2027-06-01', '2027-06-02'].includes(e.dateStart!))).toBe(false)
    expect(events.some(e => e.schoolStatus === 'staff-only')).toBe(false)
    expect(calendar.conditionalNoSchoolDayEventIds).toEqual([])
    expect(event('2027-graduation')).toMatchObject({ dateStart: '2027-05-28', eventType: 'SCHOOL_MILESTONE', schoolStatus: 'not-applicable' })
  })

  it('uses the back-to-school page for freshman end time and new-student scope', () => {
    expect(event('2026-freshman-orientation')).toMatchObject({ timeSourceId: 'hallsville-back-to-school', noteSourceIds: ['hallsville-back-to-school'] })
    expect(event('2026-freshman-orientation').note).toContain('5 to 6:30 p.m.')
    expect(event('2026-freshman-orientation').note).toContain('HHS Performing Arts Center')
    expect(event('2026-registration-july-30').note).toBe('11 a.m.–7 p.m.')
    expect(event('2026-online-registration')).toMatchObject({ dateStart: '2026-07-17', sourceId: 'hallsville-back-to-school' })
    expect(events.filter(e => e.eventType === 'MEET_THE_TEACHER')).toHaveLength(3)
  })

  it('distinguishes TVAH and does not invent its own route or assign it campus dates', () => {
    expect(calendar.excludedCampuses).toEqual(['Texas Virtual Academy at Hallsville (TVAH)'])
    expect(calendar.calendarScope).toContain('excludes Texas Virtual Academy')
    expect(calendar.sources.find(s => s.id === 'hallsville-tvah-calendar')?.url).toBe('https://tvah.k12.com/academic-calendar/')
    expect(calendar.faqs.find(f => f.question.includes('apply to Texas Virtual Academy'))?.answer).toMatch(/^No\./)
  })

  it('covers independent family questions without template filler or invented assignments', () => {
    expect(calendar.faqs).toHaveLength(34)
    expect(new Set(calendar.faqs.map(f => f.question)).size).toBe(34)
    for (const intent of ['first day', 'last day', 'Fall Break', 'Thanksgiving Break', 'Christmas Break', 'Presidents', 'Spring Break', 'Easter Monday', 'early-release dates', 'What time', 'grading periods', 'testing', 'graduation', 'new student registration', 'returning students', 'Meet the Teacher', 'freshman orientation', 'pep rally', 'student make-up', 'weather closures', 'download']) {
      expect(calendar.faqs.some(f => f.question.toLowerCase().includes(intent.toLowerCase())), intent).toBe(true)
    }
    expect(calendar.faqs.find(f => f.question.includes('weather closures'))?.answer).toContain('5 a.m.')
    expect(JSON.stringify(calendar.faqs)).not.toMatch(/STAAR|TELPAS|guaranteed|source was supplied|reviewed calendar page/)
    expect(JSON.stringify([calendar.hero, calendar.editorialSummary])).not.toMatch(/comprehensive|stay informed|plan ahead|whether you|important dates and more/i)
    expect(events.filter(e => e.note === null).every(e => e.noteBasis === undefined)).toBe(true)
  })

  it('answers the three added intents and avoids the source’s contradictory bus-time wording', () => {
    expect(calendar.faqs.find(f => f.question === 'When do students return after Fall Break?')?.answer).toContain('Wednesday, October 21, 2026')
    const documents = calendar.faqs.find(f => f.question.startsWith('What should families bring'))!
    expect(documents.answer).toContain('Harrison County Tax Statement')
    expect(documents.answer).toContain('utility bills are not accepted')
    expect(documents.answer).toContain('birth certificate')
    const delayed = calendar.faqs.find(f => f.question.includes('delayed starts'))!
    expect(delayed.answer).toContain('typical two-hour delay')
    expect(delayed.answer).toContain('day’s district notice')
    expect(delayed.answer).not.toMatch(/pickup.*(?:earlier|later)/)
    expect(calendar.faqs.find(f => f.question.includes('Christmas Break, and'))?.answer).toMatch(/^Students have no regular classes from December 18, 2026, through January 5, 2027/)
  })

  it('keeps final-date evidence derived and makes June office/testing overlaps explicit', () => {
    const final = event('2027-may-early-release')
    expect(final.note).toContain('does not print a separate “Last Day of School” label')
    expect(final.noteBasis).toBe('derived')
    expect(final.finalStudentDateBasis).toBe('derived')
    for (const id of ['2027-06-14-testing', '2027-06-21-testing']) {
      expect(event(id).note).toContain('both testing and district/campus office closure')
      expect(event(id).note).toContain('does not identify the participating grades or subjects')
    }
    expect(event('2026-registration-july-29').note).toBe('9 a.m.–5 p.m.')
    expect(event('2026-community-pep-rally').note).toBe('6–8 p.m.')
    expect(calendar.hero.desktopDescription).toContain('Spring Break is March 15–19')
    expect(calendar.seo.description).toContain('May 27 last regular day')
    expect(calendar.seo.description).toContain('Spring Break Mar. 15–19')
  })

  it('excludes the single-day winter holiday from the Staff Day subset using all classifications', () => {
    const january = event('2027-christmas-break-january')
    expect(january.eventTypes).toEqual(['WINTER_BREAK', 'HOLIDAY'])
    const changed = structuredClone(calendar)
    const changedJanuary = changed.events.find(e => e.id === january.id)!
    Object.assign(changedJanuary, { eventType: 'HOLIDAY', eventTypes: ['HOLIDAY', 'WINTER_BREAK'] })
    expect(calculateCalendarStatistics(changed)).toEqual(calendar.statistics)
    expect(calculateCalendarStatistics(calendar).find(s => s.id === 'student-no-school-days')).toMatchObject({ label: 'Student days off for in-year Staff Days', value: '7 days' })
  })

  it('exports all occurrences with exclusive ICS end dates and the explicit TVAH exclusion', () => {
    const ics = readFileSync(`test/fixtures${calendar.actions.staticIcsUrl}`, 'utf8').replace(/\r\n /g, '')
    expect((ics.match(/BEGIN:VEVENT/g) || []).length).toBe(40)
    expect(ics).toContain('X-TXSC-EXCLUDED-CAMPUSES:Texas Virtual Academy at Hallsville (TVAH)')
    const final = ics.split('BEGIN:VEVENT').find(e => e.includes('UID:hallsville-2027-may-early-release@'))!
    expect(final).toContain('CATEGORIES:EARLY_RELEASE,SEMESTER_END,GRADING_PERIOD_END')
    expect(final).toContain('DTSTART;VALUE=DATE:20270527')
    expect(final).toContain('DTEND;VALUE=DATE:20270528')
    expect(final).toContain('12:30 p.m.')
    const summer = ics.split('BEGIN:VEVENT').find(e => e.includes('UID:hallsville-2027-06-14-testing@'))!
    expect(summer).toContain('DTEND;VALUE=DATE:20270619')
    expect(ics).not.toContain('SUMMARY:Staff Make-up')
  })
})
