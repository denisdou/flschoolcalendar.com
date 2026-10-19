import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { DistrictCalendar } from '../../shared/types/content'
import CalendarYearStatistics from '../../app/components/calendar/CalendarYearStatistics.vue'

function calendar(overrides: Partial<DistrictCalendar> = {}): DistrictCalendar {
  return {
    schoolYear: '2026-2027',
    status: 'official',
    indexable: true,
    createdAt: '2026-09-30',
    publishedAt: '2026-09-30',
    verifiedAt: '2026-09-30',
    contentUpdatedAt: '2026-09-30',
    lastOfficialRevisionAt: null,
    firstDay: '2026-08-03',
    lastDay: '2026-08-07',
    seo: { title: 'Example ISD calendar', description: 'Example calendar.' },
    hero: { heading: 'Example ISD calendar', mobileDescription: 'Summary.', desktopDescription: 'Summary.' },
    editorialSummary: { heading: 'Overview', paragraphs: [], highlights: [] },
    keyDates: [],
    actions: { staticIcsUrl: null, googleCalendarUrl: null, appleCalendarUrl: null, officialPdfUrl: null, officialCalendarUrl: null },
    highlights: [],
    statistics: [],
    comparativeInsights: [],
    events: [],
    breaks: [],
    noSchoolDayEventIds: [],
    nearbyComparison: null,
    revisions: [],
    about: { dataSource: '', processing: '', updates: '', disclaimer: '' },
    faqs: [],
    sources: [],
    relatedResources: [],
    ...overrides,
  }
}

describe('school year statistics provenance', () => {
  it('renders a stored official figure with its source explanation', () => {
    const wrapper = mount(CalendarYearStatistics, {
      props: {
        calendar: calendar({
          statistics: [{
            id: 'student-attendance-days',
            label: 'Student attendance days',
            value: '175 days',
            basis: 'official',
            explanation: 'The official calendar prints a total of 175 student days.',
          }],
        }),
      },
    })

    expect(wrapper.text()).toContain('Student attendance days')
    expect(wrapper.text()).toContain('175 days')
    expect(wrapper.text()).toContain('Official figure')
    expect(wrapper.text()).toContain('The official calendar prints a total of 175 student days.')
  })

  it('marks a stored calculation separately from an official figure', () => {
    const wrapper = mount(CalendarYearStatistics, {
      props: {
        calendar: calendar({
          statistics: [{
            id: 'long-weekends',
            label: 'Long weekends',
            value: '4',
            basis: 'derived',
            explanation: 'Counted from the official no-class dates stored in this calendar.',
          }],
        }),
      },
    })

    expect(wrapper.text()).toContain('Long weekends')
    expect(wrapper.text()).toContain('Calculated from official dates')
    expect(wrapper.text()).toContain('Counted from the official no-class dates stored in this calendar.')
  })

  it('does not calculate anything while rendering', () => {
    const wrapper = mount(CalendarYearStatistics, {
      props: { calendar: calendar() },
    })

    expect(wrapper.find('.calendar-year-statistics').exists()).toBe(false)
  })
})
