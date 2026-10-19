import { readFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import record from '../fixtures/districts/aldine-isd.json'
import type { CalendarEvent } from '../../shared/types/content'
import CalendarEventsTable from '../../app/components/calendar/CalendarEventsTable.vue'
import MonthlyCalendar from '../../app/components/calendar/MonthlyCalendar.vue'
// @ts-ignore Dependency-free build-time calculator, not part of the application bundle.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const traditional = record.schoolYears['2026-2027']
const adsy = record.schoolYears['2026-2027-adsy']

describe('Aldine ISD source-conflict handling', () => {
  it('does not turn disputed October 5 or January 5 into confirmed closures', () => {
    expect(adsy.attendanceUncertaintyDates).toEqual(['2026-10-05', '2027-01-05'])
    expect(adsy.events.some(event => adsy.attendanceUncertaintyDates.includes(event.dateStart))).toBe(false)
    expect(adsy.noSchoolDayEventIds.some(id => /october-5|january-5/.test(id))).toBe(false)
    expect(adsy.breaks.find(item => item.name === 'Midwinter Break')?.nextStudentAttendanceDate).toBeNull()
    expect(adsy.faqs.find(item => item.question.includes('January 5, 2027'))?.answer).toContain('Families should confirm January 5 attendance')
    expect(adsy.faqs.find(item => item.question.includes('October 5, 2026'))?.answer).toContain('Families should confirm attendance')
  })

  it('keeps whole-calendar campus scope out of narrower event grade scopes', () => {
    expect(adsy.calendarScope).toContain('Ermel Elementary, Harris Elementary and Vines Primary')
    expect(adsy.events.every(event => !('gradeScope' in event))).toBe(true)
    const finalCards = traditional.events.filter(event => 'gradeScope' in event)
    expect(finalCards).toHaveLength(2)
  })

  it('stores reproducible confirmed statistics without publishing a guessed attendance total', () => {
    for (const calendar of [traditional, adsy]) {
      const calculated = calculateCalendarStatistics(calendar)
      expect(calendar.statistics.map(item => [item.id, item.value, item.basis])).toEqual(calculated.map((item: { id: string; value: string; basis: string }) => [item.id, item.value, item.basis]))
      expect(calendar.statistics.every(item => item.explanation.length > 30 && !/^0(?:\s|$)/.test(item.value))).toBe(true)
    }
    expect(traditional.statistics.find(item => item.id === 'student-attendance-days')?.value).toBe('175 days')
    expect(adsy.statistics.some(item => item.id === 'student-attendance-days')).toBe(false)
    expect(adsy.statistics.find(item => item.id === 'total-no-school-weekdays')?.value).toBe('36 weekdays')
    expect(adsy.statistics.find(item => item.id === 'longest-no-school-stretch')?.explanation).toContain('does not establish a return date')
  })

  it('uses English calendar dates and permits the user-approved English availability FAQ', () => {
    expect(traditional.about.dataSource).toContain('English page')
    expect(traditional.about.dataSource).toContain('July 22, 2026')
    expect(traditional.events.find(item => item.id === 'aldine-2027-march-26-student-holiday')?.dateStart).toBe('2027-03-26')
    const availability = traditional.faqs.filter(item => /spanish/i.test(item.question + item.answer))
    expect(availability).toEqual([{
      question: 'Is the Aldine ISD 2026-2027 calendar available in Spanish?',
      answer: 'Yes. The district PDF includes a Spanish-language calendar on page two. Families should use the district’s current Calendar page when checking for later revisions or schedule changes.',
    }])
    expect(JSON.stringify([traditional.about, traditional.relatedResources, adsy.faqs])).not.toMatch(/spanish|bilingual/i)
    expect(adsy.sources.some(source => source.id === 'aldine-2026-june-calendar-amendment')).toBe(true)
  })

  it('matches all 23 ENVI21ON rectangles, including January 6 but not the January 5 half-circle', () => {
    const dates = adsy.events.filter(event => event.name === 'ENVI21ON School Day')
    const expected = [
      '2026-08-05', '2026-08-12', '2026-08-19', '2026-08-26',
      '2026-09-02', '2026-09-16', '2026-09-23',
      '2026-10-07', '2026-10-21', '2026-10-28',
      '2026-11-11', '2026-11-18', '2026-12-02', '2026-12-09',
      '2027-01-06', '2027-01-13', '2027-01-27', '2027-02-03', '2027-02-17', '2027-02-24',
      '2027-03-03', '2027-03-10', '2027-03-31',
    ]
    expect(dates.map(event => event.dateStart)).toEqual(expected)
    expect(dates).toHaveLength(23)
    expect(new Set(dates.map(event => event.dateStart)).size).toBe(23)
    expect(dates.every(event => !event.dateEnd && !event.note && event.schoolStatus === 'schools-open')).toBe(true)
    expect(adsy.highlights.find(item => item.label === 'ENVI21ON school days')?.value).toBe('23 dates')
    const publicCopy = JSON.stringify([adsy.hero, adsy.editorialSummary, adsy.highlights, adsy.comparativeInsights])
    expect(publicCopy).not.toMatch(/\b22 (?:ENVI21ON|dates|separate dates)/)
    expect(publicCopy).not.toContain('23 additional instructional days')
    expect(adsy.faqs.find(item => item.question === 'Which dates are marked as ENVI21ON days?')?.answer).toContain('Sept. 2, 16 and 23;')
    expect(adsy.faqs.find(item => item.question === 'Which dates are marked as ENVI21ON days?')?.answer).toContain('Jan. 6, 13 and 27;')
    expect(adsy.events.find(item => item.id === 'aldine-adsy-2027-classes-resume')?.note).toContain('marked as an ENVI21ON School Day')
  })

  it('merges source navigation FAQs and avoids repeated attendance warnings in the summary', () => {
    expect(traditional.faqs).toHaveLength(17)
    expect(traditional.faqs.filter(item => /Where can families|latest .*calendar/.test(item.question))).toHaveLength(1)
    expect(traditional.faqs.some(item => item.question === 'When is Aldine ISD fall break in 2026?')).toBe(true)
    expect(adsy.editorialSummary.highlights).toContain('First day Monday, July 27')
    expect(adsy.editorialSummary.highlights.some(item => item.includes('Confirm'))).toBe(false)
    expect(adsy.faqs[1]?.question).toBe('What does ADSY mean in Aldine ISD?')
    expect(adsy.editorialSummary.paragraphs[1]).not.toContain('confirmation')
    expect(adsy.highlights.some(item => item.label === 'Attendance dates to confirm')).toBe(false)
    expect(adsy.faqs.find(item => item.question.includes('staff-development'))?.answer).not.toContain('October 5')
  })

  it('gives standalone holidays their own FAQ and labels the two isolated closures accurately', () => {
    const faq = traditional.faqs.find(item => item.question === 'What single-day no-school dates are on the Aldine ISD 2026-2027 calendar?')
    for (const date of ['September 7', 'November 3', 'January 18', 'March 26', 'May 31']) expect(faq?.answer).toContain(date)
    expect(adsy.statistics.find(item => item.id === 'student-no-school-days')).toMatchObject({ label: 'Confirmed standalone no-school dates', value: '2 days' })
  })

  it('uses parent-facing questions and keeps PDF mark interpretation in processing notes', () => {
    expect(traditional.faqs.some(item => item.question === 'When is Aldine ISD’s February student break?')).toBe(true)
    expect(adsy.faqs.some(item => item.question === 'Which ADSY staff-development days are no-school days for students?')).toBe(true)
    expect(adsy.faqs.some(item => item.question === 'When is Thanksgiving break for ADSY students?')).toBe(true)
    expect(JSON.stringify([traditional.faqs, adsy.faqs])).not.toMatch(/midterm break|confirmed student holidays|half-circle|ENVI21ON square/)
    expect(adsy.about.processing).toContain('Nine Weeks Start/End half-circle')
    expect(adsy.editorialSummary.paragraphs[2]).toContain('30 additional instructional days')
    expect(adsy.sources.find(source => source.id === 'aldine-2026-adsy-campus-update')?.url).toBe('https://www.aldineisd.org/2026/07/30/adsy-campuses-welcome-students-back-for-another-year-of-growth-and-learning/')
  })

  it('distinguishes marked ENVI21ON dates from the district program claim without inventing a reconciliation', () => {
    const faq = adsy.faqs.find(item => item.question === 'Why does the ADSY calendar show 23 ENVI21ON days if Aldine ISD says the program adds 30 instructional days?')
    expect(adsy.editorialSummary.paragraphs[2]).toContain('Separately, Aldine ISD says')
    expect(faq?.answer).toContain('23 dates as ENVI21ON School Days')
    expect(faq?.answer).toContain('July 2026 district article')
    expect(faq?.answer).toContain('30 additional instructional days')
    expect(faq?.answer).toContain('do not explain how the two counts relate')
    expect(faq?.answer).toContain('should not be used interchangeably')
    expect(adsy.events.filter(event => event.name === 'ENVI21ON School Day')).toHaveLength(23)
    expect(adsy.statistics.some(item => item.id === 'student-attendance-days')).toBe(false)
  })

  it('makes the ADSY single-day holiday FAQ independent and includes the March recess holiday', () => {
    const faq = adsy.faqs.find(item => item.question === 'Which single-day holidays are no-school days on the ADSY calendar?')
    for (const date of ['September 7', 'January 18', 'March 26', 'May 31']) expect(faq?.answer).toContain(date)
    expect(adsy.faqs.some(item => item.question === 'Which other holidays are no-school days on the ADSY calendar?')).toBe(false)
  })

  it('shows January 6 once in the monthly calendar with both official meanings', () => {
    const events = adsy.events.filter(event => event.dateStart === '2027-01-06')
    expect(events.map(event => event.name)).toEqual(['Classes Resume', 'ENVI21ON School Day'])
    const wrapper = mount(MonthlyCalendar, {
      props: {
        districtName: 'Aldine ISD',
        firstDay: adsy.firstDay,
        lastDay: adsy.lastDay,
        events: events as CalendarEvent[],
      },
    })
    expect(wrapper.findAll('time[datetime="2027-01-06"]')).toHaveLength(1)
    const tooltip = wrapper.find('#month-day-tooltip-2027-01-06')
    expect(tooltip.text()).toContain('Classes Resume')
    expect(tooltip.text()).toContain('ENVI21ON School Day')
    expect(wrapper.findAll('.month-event-list li')).toHaveLength(0)
    wrapper.unmount()
  })

  it('keeps parent-facing copy free of internal data-processing language and duplicate questions', () => {
    for (const calendar of [traditional, adsy]) {
      const text = JSON.stringify([calendar.seo, calendar.hero, calendar.editorialSummary, calendar.faqs, calendar.comparativeInsights])
      expect(text).not.toMatch(/this route|the grid|kept as student events|stored as|this page treats|separate ADSY route/i)
      expect(new Set(calendar.faqs.map(item => item.question.toLowerCase())).size).toBe(calendar.faqs.length)
      expect(calendar.seo.title.length).toBeLessThanOrEqual(60)
      expect(calendar.seo.description.length).toBeLessThanOrEqual(160)
    }
  })

  it('shows the official half-day label without implying an unlisted dismissal time', () => {
    const event = traditional.events.find(item => item.eventType === 'EARLY_RELEASE')!
    const wrapper = mount(CalendarEventsTable, {
      props: { districtName: 'Aldine ISD', schoolYear: '2026-2027', events: [event as CalendarEvent] },
    })
    expect(wrapper.find('.badge').text()).toBe('Half Day for Students')
    expect(wrapper.text()).not.toContain('Early dismissal')
  })

  it('exports canonical student events without disputed closure entries', () => {
    for (const calendar of [traditional, adsy]) {
      const ics = readFileSync(new URL('../fixtures' + calendar.actions.staticIcsUrl, import.meta.url), 'utf8').replace(/\r?\n[ \t]/g, '')
      const blocks = [...ics.matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/g)].map(match => match[1]!)
      expect(blocks).toHaveLength(calendar.events.length)
      for (const event of calendar.events) {
        const block = blocks.find(item => item.includes('UID:' + event.id + '@'))!
        const finish = new Date((event.dateEnd || event.dateStart) + 'T00:00:00Z')
        finish.setUTCDate(finish.getUTCDate() + 1)
        expect(block).toContain('DTSTART;VALUE=DATE:' + event.dateStart.replaceAll('-', ''))
        expect(block).toContain('DTEND;VALUE=DATE:' + finish.toISOString().slice(0, 10).replaceAll('-', ''))
      }
      if (calendar === adsy) {
        expect(ics).not.toContain('aldine-adsy-2026-09-30-envi21on')
        expect(ics).not.toContain('DTSTART;VALUE=DATE:20261005')
        expect(ics).not.toContain('DTSTART;VALUE=DATE:20270105')
      }
      else expect(ics).toContain('School status: Half Day for Students')
    }
  })
})
