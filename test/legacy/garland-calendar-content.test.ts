import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MonthlyCalendar from '../../app/components/calendar/MonthlyCalendar.vue'
import recordJson from '../fixtures/districts/garland-isd.json'
import type { DistrictRecord } from '../../shared/types/content'

const record = recordJson as unknown as DistrictRecord
const currentCalendar = record.schoolYears['2026-2027']!
const futureCalendar = record.schoolYears['2027-2028']!

describe('Garland ISD calendar content', () => {
  it('keeps official breaks separate from adjacent student holidays', () => {
    expect(currentCalendar.events.find(event => event.id === 'garland-2026-fall-break')).toMatchObject({
      dateStart: '2026-10-12',
      dateEnd: '2026-10-16',
      eventType: 'FALL_BREAK',
      basis: 'official',
    })
    expect(currentCalendar.events.find(event => event.id === 'garland-2026-october-19-student-holiday')).toMatchObject({
      dateStart: '2026-10-19',
      dateEnd: null,
      eventType: 'NON_STUDENT_DAY',
      basis: 'official',
    })
    expect(currentCalendar.events.find(event => event.id === 'garland-2026-winter-break')).toMatchObject({
      dateStart: '2026-12-21',
      dateEnd: '2027-01-01',
      eventType: 'WINTER_BREAK',
      basis: 'official',
    })
    expect(currentCalendar.events.find(event => event.id === 'garland-2027-january-4-student-holiday')).toMatchObject({
      dateStart: '2027-01-04',
      dateEnd: null,
      eventType: 'NON_STUDENT_DAY',
      basis: 'official',
    })

    expect(futureCalendar.events.find(event => event.id === 'garland-2027-2028-fall-break')).toMatchObject({
      dateStart: '2027-10-11',
      dateEnd: '2027-10-15',
      eventType: 'FALL_BREAK',
      basis: 'official',
    })
    expect(futureCalendar.events.find(event => event.id === 'garland-2027-2028-winter-break')).toMatchObject({
      dateStart: '2027-12-20',
      dateEnd: '2027-12-31',
      eventType: 'WINTER_BREAK',
      basis: 'official',
    })
  })

  it('stores all grading-period starts with one event type', () => {
    const currentStarts = currentCalendar.events.filter(event => event.name.endsWith('Grading Period Begins'))
    const futureStarts = futureCalendar.events.filter(event => event.name.endsWith('Grading Period Begins'))

    expect(currentStarts).toHaveLength(4)
    expect(futureStarts).toHaveLength(4)
    expect(currentStarts.every(event => event.eventType === 'GRADING_PERIOD_START' && event.basis === 'official')).toBe(true)
    expect(futureStarts.every(event => event.eventType === 'GRADING_PERIOD_START' && event.basis === 'official')).toBe(true)
    expect(currentStarts.map(event => event.dateStart)).toEqual(['2026-08-10', '2026-10-20', '2027-01-05', '2027-03-22'])
    expect(futureStarts.map(event => event.dateStart)).toEqual(['2027-08-09', '2027-10-19', '2028-01-04', '2028-03-20'])
  })

  it('does not treat A/B return dates as grading-period starts', () => {
    expect(currentCalendar.events.find(event => event.id === 'garland-2027-high-school-february-return')).toMatchObject({
      dateStart: '2027-02-17',
      eventType: 'SCHOOL_MILESTONE',
      name: 'High School Returns on an A Day',
    })
  })

  it('describes the middle-school rotation without an unsupported cause', () => {
    const pattern = currentCalendar.abBlockSchedules?.middleSchool?.regularPattern

    expect(pattern).toContain('differs from the high school weekday pattern')
    expect(pattern).not.toMatch(/balance instructional days/i)
  })

  it('uses district terminology and parent-facing FAQ language', () => {
    expect(currentCalendar.seo.description).toContain('early-dismissal times')
    expect(futureCalendar.seo.description).toContain('early-dismissal times')
    expect(futureCalendar.seo.title).toBe('Garland ISD School Calendar 2027-28: Breaks & Holidays')
    expect(currentCalendar.faqs).toContainEqual({
      question: 'How long is Garland ISD Fall Break in 2026?',
      answer: 'Fall Break itself is five school days, October 12-16. Monday, October 19 is a separate staff-development/student-holiday, so students return Tuesday, October 20.',
    })
    expect(futureCalendar.faqs.some(faq => faq.question === 'What other days are Garland ISD students off in 2027-28?')).toBe(true)
  })

  it('publishes current report-card guidance without predicting future dates', () => {
    const currentFaq = currentCalendar.faqs.find(faq => faq.question === 'When are Garland ISD report cards posted in 2026-27?')
    const futureFaq = futureCalendar.faqs.find(faq => faq.question === 'Where does Garland ISD post progress-report and report-card dates?')

    expect(currentFaq?.answer).toContain('October 20, 2026, for elementary and October 21 for middle/high school')
    expect(currentFaq?.answer).toContain('May 27 for elementary and June 4 for middle/high school')
    expect(futureFaq?.answer).toContain('The 2027-28 academic PDF itself does not list those dates')
    expect(JSON.stringify([currentCalendar.editorialSummary, futureCalendar.editorialSummary])).not.toMatch(/staff-development\/student-holiday/i)
  })

  it('does not repeat event names in low-value notes', () => {
    const redundantNoteIds = [
      'garland-2026-thanksgiving-break',
      'garland-2026-high-school-thanksgiving-return',
      'garland-2027-spring-break',
      'garland-2028-spring-break',
    ]

    for (const id of redundantNoteIds) {
      const event = [...currentCalendar.events, ...futureCalendar.events].find(candidate => candidate.id === id)
      expect(event?.note).toBeNull()
    }
  })

  it('uses parent-facing language and does not infer a future A/B rotation', () => {
    const visibleText = JSON.stringify({
      hero: futureCalendar.hero,
      editorialSummary: futureCalendar.editorialSummary,
      comparativeInsights: futureCalendar.comparativeInsights,
      faqs: futureCalendar.faqs,
      about: futureCalendar.about,
    })

    expect(visibleText).not.toMatch(/supplied materials|supplied files|this route|stored as student-year events|event list/i)
    expect(visibleText).not.toMatch(/when it is published|has not yet been posted/i)
    expect(visibleText).toContain('A/B Block Schedule page currently lists 2026-27 only')
    expect(futureCalendar.sources.some(source => source.id === 'garland-isd-ab-block-page')).toBe(true)
  })

  it('keeps same-day facts canonical and groups them in the calendar tooltip', () => {
    const wrapper = mount(MonthlyCalendar, {
      props: {
        districtName: record.district.name,
        events: currentCalendar.events,
        firstDay: currentCalendar.firstDay,
        lastDay: currentCalendar.lastDay,
        timeZone: record.district.timeZone,
      },
    })

    const tooltip = wrapper.find('time[datetime="2027-05-27"] .month-day-tooltip').text()
    expect(tooltip).toContain('Fourth Grading Period Ends')
    expect(tooltip).toContain('High School Last Day - B Day')
    expect(tooltip).toContain('Last Day of Classes')
    expect(tooltip).toContain('Last-Day Early Dismissal')
    expect(tooltip).toContain('Middle School Last Day - A Day')
    wrapper.unmount()
  })

  it('keeps every no-school id resolvable after splitting events', () => {
    for (const calendar of [currentCalendar, futureCalendar]) {
      const eventIds = new Set(calendar.events.map(event => event.id))
      expect(calendar.noSchoolDayEventIds.every(id => eventIds.has(id))).toBe(true)
    }
  })
})
