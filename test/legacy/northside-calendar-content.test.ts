import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MonthlyCalendar from '../../app/components/calendar/MonthlyCalendar.vue'
import record from '../fixtures/districts/northside-isd.json'
import type { CalendarEvent } from '../../shared/types/content'
// @ts-ignore Dependency-free Node checks are also used by the offline publishing gate.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Shared offline statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const years = [
  { year: '2026-2027', first: '2026-08-10', last: '2027-05-26', exchange: ['2026-10-09', '2026-10-12'], feb: ['2027-02-12', '2027-02-15'], spring: ['2027-03-26', '2027-03-29'], weather: '2027-02-16', fallEnd: '2026-10-13', winterEnd: '2027-01-01', returnDate: 'January 5' },
  { year: '2027-2028', first: '2027-08-09', last: '2028-05-24', exchange: ['2027-10-08', '2027-10-11'], feb: ['2028-02-18', '2028-02-21'], spring: ['2028-04-14', '2028-04-17'], weather: '2028-02-22', fallEnd: '2027-10-12', winterEnd: '2027-12-31', returnDate: 'January 4' },
] as const

describe('Northside ISD source events and derived family planning', () => {
  it('passes the publishing gate without changing approved year boundaries', () => {
    expect(auditRecords([{ filename: 'northside-isd.json', record }])).toEqual([])
    for (const row of years) {
      const c = record.schoolYears[row.year]
      expect(c.firstDay).toBe(row.first)
      expect(c.lastDay).toBe(row.last)
      expect(c.lastDayBasis).toBe('official')
      expect(c.seo.title).toBe(`Northside ISD Calendar ${row.year}: Holidays & Breaks`)
      expect(c.seo.description).toContain('fall break')
      expect(c.seo.description.length).toBeLessThanOrEqual(160)
      expect(c.events).toHaveLength(23)
      expect(new Set(c.events.map(e => e.id)).size).toBe(23)
    }
  })

  it('keeps six holiday pairs as twelve single-date events rather than official weekend ranges', () => {
    for (const row of years) {
      const c = record.schoolYears[row.year]
      for (const date of [...row.exchange, ...row.feb, ...row.spring]) {
        const e = c.events.find(e => e.dateStart === date)!
        expect(e.dateEnd).toBeNull()
        expect(e.basis).toBe('official')
        expect(e.note).toBeNull()
        expect(c.noSchoolDayEventIds).toContain(e.id)
        expect(e.eventType).toBe((row.exchange as readonly string[]).includes(date) ? 'NON_STUDENT_DAY' : 'HOLIDAY')
      }
      expect(c.events.filter(e => e.dateEnd).map(e => e.eventType)).toEqual(['THANKSGIVING_BREAK', 'WINTER_BREAK', 'SPRING_BREAK'])
      expect(c.events.some(e => /holiday-weekend|exchange-holidays/.test(e.id))).toBe(false)
      expect(c.events.filter(e => e.eventType === 'HOLIDAY').every(e => e.name === 'Holiday')).toBe(true)
    }
  })

  it('retains derived planning ranges and separates Winter Break from January planning', () => {
    for (const row of years) {
      const c = record.schoolYears[row.year]
      expect(c.breaks).toHaveLength(6)
      expect(c.breaks[0]).toMatchObject({ name: 'Fall Break', dateStart: row.exchange[0], dateEnd: row.fallEnd, schoolWeekdaysOff: 3, schoolWeekdaysOffBasis: 'derived' })
      expect(c.events.find(e => e.eventType === 'WINTER_BREAK')?.dateEnd).toBe(row.winterEnd)
      expect(c.hero.desktopDescription).toContain(row.returnDate)
      expect(c.hero.mobileDescription).not.toContain('winter break through early January')
      expect(c.breaks.find(b => b.name === 'February Holiday Weekend')?.nextStudentAttendanceDate).toBeNull()
    }
  })

  it('makes the February baseline explicit without permanently excluding a possible make-up date', () => {
    for (const row of years) {
      const c = record.schoolYears[row.year]
      const e = c.events.find(e => e.dateStart === row.weather)! as CalendarEvent
      expect(e).toMatchObject({
        eventType: 'RESERVED_ATTENDANCE_DAY', eventTypeBasis: 'derived', schoolStatus: 'conditional-attendance', schoolStatusBasis: 'derived',
        name: 'Bad Weather Makeup Day / Student Holiday / Staff Development',
        nameBasis: 'derived', basis: 'official', noteBasis: 'derived',
        countsAsStudentAttendanceDayUnderPublishedSchedule: false, countsAsStudentAttendanceDayUnderPublishedScheduleBasis: 'derived',
        scheduledAsNoSchool: true, scheduledAsNoSchoolBasis: 'derived', mayBecomeAttendanceDay: true, mayBecomeAttendanceDayBasis: 'derived',
      })
      expect(e.officialLabel).toBe('Bad Weather Makeup Day / Student Holiday / Staff Dev.')
      expect(e.countsAsStudentAttendanceDay).toBeUndefined()
      expect(c.noSchoolDayEventIds).not.toContain(e.id)
    }
  })

  it('omits provenance for absent notes and cites the workshop terminology in both years', () => {
    for (const row of years) {
      const c = record.schoolYears[row.year]
      for (const event of c.events) {
        if (event.note === null) expect(event).not.toHaveProperty('noteBasis')
      }
      const source = c.sources.find(s => s.id === 'nisd-2025-12-02-calendar-workshop-minutes')
      expect(source).toMatchObject({
        label: 'Northside ISD December 2, 2025 Board Workshop Minutes',
        type: 'official-pdf', publishedAt: null, retrievedAt: '2026-10-06',
        url: 'https://www.nisd.net/sites/default/files/attachments/bp_nisd_attachments/2026/12.2.25-approved-c-workshop-minutes.pdf',
      })
      expect(c.relatedResources.some(r => r.href === source?.url)).toBe(true)
      expect(c.about.dataSource).toContain('Fall Break and February Break')
    }
  })

  it('does not imply that every campus has a calendar on the official calendars page', () => {
    for (const row of years) {
      const c = record.schoolYears[row.year]
      expect(c.editorialSummary.paragraphs[2]).toContain('participating campuses')
      expect(c.faqs.find(f => /conference and report-card/.test(f.question))?.answer).toContain('where available')
      expect(c.faqs.find(f => /Do all Northside ISD schools/.test(f.question))?.answer).toContain('where available')
      expect(c.hero.desktopDescription).not.toContain('listed bad-weather')
    }
    expect(record.schoolYears['2026-2027'].hero.mobileDescription).not.toContain('The calendar adds')
  })

  it('supports the new fall-break context with an official newsletter and consistent verification dates', () => {
    expect(record.calendarDiscovery.lastCheckedAt).toBe('2026-10-06')
    for (const row of years) {
      const c = record.schoolYears[row.year]
      expect(c.sources.find(s => s.id === 'nisd-calendar-approval-newsletter')).toMatchObject({ url: 'https://www.nisd.net/newsletter/141486', publishedAt: '2025-12-11', retrievedAt: '2026-10-06' })
      expect(c.sources.every(s => s.retrievedAt === c.verifiedAt)).toBe(true)
      expect(c.contentUpdatedAt).toBe(c.verifiedAt)
      expect(c.editorialSummary.paragraphs.join(' ')).toContain(row.year === '2026-2027' ? 'introduced a short October fall break' : 'The short October fall break returns in 2027-2028.')
    }
  })

  it('answers family queries without event-list implementation explanations', () => {
    for (const row of years) {
      const c = record.schoolYears[row.year]
      expect(c.faqs).toHaveLength(14)
      expect(new Set(c.faqs.map(f => f.question)).size).toBe(14)
      expect(c.faqs.some(f => f.question.includes('fall break'))).toBe(true)
      expect(c.faqs.some(f => f.question.includes('February break'))).toBe(true)
      expect(c.faqs.some(f => f.question.includes('Do all Northside ISD schools'))).toBe(true)
      expect(c.faqs.map(f => f.question)).toEqual(expect.arrayContaining([
        `When is Northside ISD Thanksgiving break in ${row.first.slice(0, 4)}?`,
        `When is Northside ISD winter break in ${row.year}?`,
        `When do Northside ISD grading periods end in ${row.year}?`,
        'Do all Northside ISD schools follow the district academic calendar?',
      ]))
      expect(JSON.stringify(c.faqs)).not.toMatch(/event list|student events|event scope|This record|student calendar event/)
      expect(c.faqs.find(f => /Is there school.*November/.test(f.question))?.answer).toMatch(/^No\./)
    }
  })

  it('uses year-specific fall-break prose without repeating October in the mobile sentence', () => {
    const c = record.schoolYears['2027-2028']
    expect(c.hero.mobileDescription).toBe('Students start August 9 and finish May 24. Fall break runs October 8–12, and a January 3 teacher planning day means classes resume after winter break on January 4.')
    expect(c.editorialSummary.paragraphs[0]).toContain('The short October fall break returns in 2027-2028. October 8 and 11 are student holidays for teacher exchange')
    expect(c.editorialSummary.paragraphs[0]).not.toContain('introduced a short October fall break for its 2026-2027')
  })

  it('preserves attendance counts when reclassifying exchange days as individual non-student days', () => {
    for (const row of years) {
      const c = record.schoolYears[row.year]
      expect(calculateCalendarStatistics(c)).toEqual(c.statistics)
      const value = (id: string) => c.statistics.find(s => s.id === id)?.value
      expect(value('student-attendance-days')).toBe('174 days')
      expect(value('total-no-school-weekdays')).toBe('33 weekdays')
      expect(value('student-no-school-days')).toBe('6 days')
      expect(value('long-weekends')).toBe('5')
      expect(value('longest-no-school-stretch')).toBe('17 consecutive days')
    }
  })

  it('renders both October exchange dates and their weekend gap without manufacturing an official event', () => {
    const c = record.schoolYears['2026-2027']
    const wrapper = mount(MonthlyCalendar, { props: { districtName: record.district.shortName, events: c.events, firstDay: c.firstDay, lastDay: c.lastDay } })
    try {
      for (const date of ['2026-10-09', '2026-10-12', '2026-10-13']) {
        expect(wrapper.find(`time[datetime="${date}"]`).element.parentElement?.classList.contains('month-day--holiday')).toBe(true)
      }
      for (const date of ['2026-10-10', '2026-10-11']) {
        expect(wrapper.find(`time[datetime="${date}"]`).element.parentElement?.classList.contains('month-day--holiday')).toBe(false)
      }
    }
    finally { wrapper.unmount() }
  })
})
