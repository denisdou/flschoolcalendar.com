import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import MonthlyCalendar from '../../app/components/calendar/MonthlyCalendar.vue'
import record from '../fixtures/districts/mesquite-isd.json'
import type { CalendarEvent } from '../../shared/types/content'
// @ts-ignore The offline checker is a dependency-free Node module.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore The statistics calculator is a dependency-free Node module.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const calendar = record.schoolYears['2026-2027']
const events = calendar.events as CalendarEvent[]
const event = (id: string) => events.find(item => item.id === id)!
const faq = (text: string) => calendar.faqs.find(item => item.question.includes(text))!

describe('Mesquite ISD official events and derived attendance boundaries', () => {
  it('passes the scoped content gate and preserves the approved and derived year boundaries', () => {
    expect(auditRecords([{ filename: 'mesquite-isd.json', record }])).toEqual([])
    expect(calendar.firstDay).toBe('2026-08-11')
    expect(calendar.firstDayBasis).toBe('official')
    expect(calendar.lastDay).toBe('2027-05-28')
    expect(calendar.lastDayBasis).toBe('derived')
    expect(events).toHaveLength(26)
    expect(new Set(events.map(item => item.id)).size).toBe(26)
    expect(calendar.seo.title).toBe('Mesquite ISD Calendar 2026-27: Breaks, Holidays & Key Dates')
    expect(calendar.seo.description).toContain('starts school Aug. 11, 2026')
    expect(calendar.seo.title.length).toBeLessThanOrEqual(60)
    expect(calendar.seo.description.length).toBeLessThanOrEqual(160)
  })

  it('splits official Winter Break from January 4 while retaining the derived planning range', () => {
    const winter = event('mesquite-2026-winter-break')
    const jan4 = event('mesquite-2027-january-4-student-holiday')
    expect(winter).toMatchObject({ dateStart: '2026-12-21', dateEnd: '2027-01-01', name: 'Winter Break', basis: 'official' })
    expect(jan4).toMatchObject({ dateStart: '2027-01-04', dateEnd: null, eventType: 'NON_STUDENT_DAY', basis: 'official' })
    expect(calendar.noSchoolDayEventIds).toContain(winter.id)
    expect(calendar.noSchoolDayEventIds).toContain(jan4.id)
    expect(calendar.keyDates.find(item => item.eventType === 'WINTER_BREAK')).toMatchObject({ dateEnd: '2027-01-01', basis: 'official' })
    expect(calendar.breaks.find(item => item.dateStart === '2026-12-21')).toMatchObject({
      dateEnd: '2027-01-04', nextStudentAttendanceDate: '2027-01-05', schoolWeekdaysOff: 11,
    })
    expect(calendar.hero.mobileDescription).not.toContain('winter recess through January 4')
    expect(calendar.hero.desktopDescription).toContain('January 4 is a student holiday for instructional alignment')
  })

  it('does not infer an official semester boundary from the winter return', () => {
    expect(events.some(item => item.eventType === 'SEMESTER_START')).toBe(false)
    expect(event('mesquite-2027-students-return-january-5')).toMatchObject({
      dateStart: '2027-01-05', eventType: 'SCHOOL_MILESTONE', basis: 'derived', eventTypeBasis: 'derived',
    })
    expect(calendar.editorialSummary.paragraphs.join(' ')).not.toContain('spring semester')
  })

  it('keeps all three May 28 semantics and the two June graduation groups separate', () => {
    expect(events.filter(item => item.dateStart === '2027-05-28').map(item => item.eventType)).toEqual([
      'GRADING_PERIOD_END', 'CALENDAR_END', 'EARLY_RELEASE',
    ])
    expect(event('mesquite-2027-last-day').basis).toBe('derived')
    expect(event('mesquite-2027-june-4-graduations').note).toContain('Mesquite High School, West Mesquite High School, and Poteet High School')
    expect(event('mesquite-2027-june-5-graduations').note).toContain('Vroonland Vanguard High School, John Horn High School, and North Mesquite High School')
    for (const item of events.filter(item => item.id.includes('graduations'))) {
      expect(item.note).not.toContain('should be confirmed')
      expect(item.noteBasis).toBe('official')
      expect(item.noteSourceIds).toContain('mesquite-isd-calendar-page')
    }
  })

  it('uses the holiday legend for April 16 and reproduces the confirmed closure statistics', () => {
    expect(event('mesquite-2027-bad-weather-day')).toMatchObject({ eventType: 'HOLIDAY', schoolStatus: 'no-classes' })
    expect(calendar.noSchoolDayEventIds).toContain('mesquite-2027-bad-weather-day')
    expect(calculateCalendarStatistics(calendar)).toEqual(calendar.statistics)
    expect(calendar.statistics.find(item => item.id === 'total-no-school-weekdays')?.value).toBe('37 weekdays')
    expect(calendar.statistics.find(item => item.id === 'long-weekends')?.value).toBe('9')
    expect(calendar.statistics.find(item => item.id === 'student-no-school-days')?.value).toBe('7 days')
    expect(calendar.statistics.find(item => item.id === 'longest-no-school-stretch')?.value).toBe('17 consecutive days')
    expect(calendar.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value: '172 days', basis: 'derived' })
  })

  it('does not present Welcome Day attendance or weather recovery as explicit official policy', () => {
    expect(event('mesquite-2026-pre-k-kindergarten-welcome-day')).toMatchObject({ schoolStatus: 'not-applicable', schoolStatusBasis: 'derived' })
    expect(event('mesquite-2027-bad-weather-day')).toMatchObject({
      eventTypeBasis: 'official', schoolStatusBasis: 'official', basis: 'official', noteBasis: 'official',
    })
    expect(event('mesquite-2027-bad-weather-day').note).toContain('Student/Staff Holiday')
    expect(event('mesquite-2026-pre-k-kindergarten-welcome-day')).toMatchObject({
      note: 'Pre-K & Kinder Welcome Day runs from 8–10 a.m.', noteBasis: 'official',
      noteSourceIds: ['mesquite-isd-school-basics-page'], timeSourceId: 'mesquite-isd-school-basics-page',
    })
    expect(calendar.sources.find(item => item.id === 'mesquite-isd-school-basics-page')).toMatchObject({
      type: 'official-webpage', url: 'https://www.mesquiteisd.org/235429_2', retrievedAt: '2026-10-06',
    })
    expect(faq('Pre-K & Kinder Welcome Day').answer).toContain('Monday, August 10, from 8–10 a.m.')
    expect(faq('April 16, 2027').answer).toBe('No. The published district calendar marks Friday, April 16, as a Bad Weather Day and a student/staff holiday.')
    expect(calendar.editorialSummary.paragraphs[2]).toContain('The calendar marks April 16 as both a Bad Weather Day and a student/staff holiday.')
    expect(JSON.stringify(calendar)).not.toMatch(/does not specify (?:student attendance|whether students will attend)|reserved for bad-weather recovery|may require attendance/)
    expect(faq('Labor Day 2026').answer).toContain('September 7, 2026')
    expect(calendar.editorialSummary.paragraphs.join(' ')).not.toContain('could become an attendance day')
    expect(JSON.stringify(calendar.events)).not.toMatch(/winter-break-and-january-holiday|second-semester-start/)
    expect(calendar.noSchoolDayEventIds).toContain('mesquite-2026-winter-break')
    expect(faq('last day of school').answer).toContain('final scheduled student day on the published calendar')
  })

  it('keeps independent date-query FAQs without pipeline or disclaimer questions', () => {
    expect(calendar.faqs).toHaveLength(27)
    expect(new Set(calendar.faqs.map(item => item.question)).size).toBe(27)
    for (const text of ['September 21, 2026', 'November 2–3, 2026', 'February 1–2, 2027', 'March 1, 2027', 'January 4, 2027']) {
      expect(faq(text).answer).toMatch(/^No\./)
    }
    expect(faq('Winter Break in 2026-27').answer).toBe('Winter Break runs December 21, 2026, through January 1, 2027.')
    expect(faq('classes resume after Winter Break').answer).toContain('January 5, 2027')
    expect(faq('calendar PDF').answer).toContain('printable list of dates')
    expect(calendar.faqs.some(item => /2027-2028|revise calendar dates/.test(item.question))).toBe(false)
    expect(JSON.stringify(calendar.faqs)).not.toMatch(/fully reviewed|English printable versions/)
    expect(calendar.about.disclaimer).toContain('Calendar dates, bad-weather decisions and dismissal schedules can change')
  })

  it('keeps A Days within source wording, answers the Memorial Day query and uses valid JSON URLs', () => {
    expect(faq('bold dates').answer).toBe('Bold dates mark A Days on the district calendar. Bold formatting by itself does not mean school is closed or that students are released early.')
    expect(JSON.stringify(calendar)).not.toMatch(/secondary block schedul/)
    expect(faq('Memorial Day 2027').answer).toBe('No. Monday, May 31, is marked as Memorial Day Holiday and falls after the final scheduled student day on May 28.')
    const raw = readFileSync('test/fixtures/districts/mesquite-isd.json', 'utf8')
    expect(JSON.parse(raw)).toEqual(record)
    for (const character of [':', '.']) expect(raw).not.toContain(String.fromCharCode(92) + character)
    for (const source of calendar.sources) expect(new URL(source.url).href).toBe(source.url)
  })

  it('preserves school hours, Pre-K sessions and sourced early-release clock times', () => {
    expect(faq('two Pre-K 3 sessions').answer).toContain('7:50–11:05 a.m.')
    expect(faq('two Pre-K 3 sessions').answer).toContain('12:05–3:20 p.m.')
    expect(faq('regular Mesquite ISD school hours').answer).toContain('Vanguard runs 9:00 a.m.–4:30 p.m.')
    for (const item of events.filter(item => item.eventType === 'EARLY_RELEASE')) {
      expect(item.gradeScope).toBe('All schools')
      expect(item.timeSourceId).toBe('mesquite-isd-school-hours-page')
      for (const clock of ['12:25 p.m.', '12:45 p.m.', '1:05 p.m.', '1:35 p.m.']) expect(item.note).toContain(clock)
    }
    const wrapper = mount(MonthlyCalendar, {
      props: { districtName: record.district.shortName, events, firstDay: calendar.firstDay, lastDay: calendar.lastDay },
    })
    try {
      expect(wrapper.find('time[datetime="2027-01-04"]').element.parentElement?.classList.contains('month-day--holiday')).toBe(true)
      expect(wrapper.find('time[datetime="2027-04-16"]').element.parentElement?.classList.contains('month-day--holiday')).toBe(true)
    }
    finally {
      wrapper.unmount()
    }
  })
})
