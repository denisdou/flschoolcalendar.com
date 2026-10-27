import { mount, shallowMount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CalendarEditorialSummary from '../../app/components/calendar/CalendarEditorialSummary.vue'
import CalendarExtendedTimeOff from '../../app/components/calendar/CalendarExtendedTimeOff.vue'
import CalendarCorrection from '../../app/components/calendar/CalendarCorrection.vue'
import DistrictCalendarPage from '../../app/components/calendar/DistrictCalendarPage.vue'
import CalendarFaq from '../../app/components/calendar/CalendarFaq.vue'
import { selectCalendarFaqs } from '../../shared/utils/calendarFaqSelection'
import { buildExtendedTimeOff } from '../../shared/utils/extendedTimeOff'
import { calendarCorrectionHref } from '../../shared/utils/calendarCorrection'
import { buildDistrictCalendarSchema } from '../../shared/utils/calendarSchema'
import type { DistrictCalendar, DistrictRecord } from '../../shared/types/content'
import hernando from '../../server/data/districts/records/hernando-county-school-district.json'
import hamilton from '../../server/data/districts/records/hamilton-county-school-district.json'

const record = hernando as unknown as DistrictRecord
const calendar = record.schoolYears['2026-2027']!

describe('reference calendar detail functionality', () => {
  it('keeps official break dates separate from weekends and conditional hurricane dates', () => {
    const original = JSON.stringify(calendar)
    const windows = buildExtendedTimeOff(calendar)
    const thanksgiving = windows.find(item => item.start === '2026-11-21')!
    expect(thanksgiving.end).toBe('2026-11-29')
    expect(thanksgiving.days).toBe(9)
    expect(thanksgiving.noSchool).toEqual([{ start: '2026-11-23', end: '2026-11-27' }])
    expect(thanksgiving.conditional).toEqual([{ start: '2026-11-23', end: '2026-11-24' }])
    expect(thanksgiving.weekends).toEqual([{ start: '2026-11-21', end: '2026-11-22' }, { start: '2026-11-28', end: '2026-11-29' }])
    expect(windows.find(item => item.start === '2026-12-19')).toMatchObject({ days: 17, end: '2027-01-04' })
    expect(windows.find(item => item.start === '2027-03-13')).toMatchObject({ end: '2027-03-22', days: 10 })
    expect(JSON.stringify(calendar)).toBe(original)
    const table = mount(CalendarExtendedTimeOff, { props: { calendar, districtName: record.district.name } })
    expect(table.text()).toContain('Possible make-up days:')
    expect(table.text()).toContain('Attendance may change')
    table.unmount()
  })

  it('does not turn an early-dismissal day into time off or create a break from a scoped closure', () => {
    const windows = buildExtendedTimeOff(hamilton.schoolYears['2026-2027'] as DistrictCalendar)
    expect(windows.find(item => item.start === '2027-03-25')).toMatchObject({ end: '2027-04-04', days: 11 })
    const scoped = structuredClone(calendar)
    scoped.events = [{ ...calendar.events[0]!, dateStart: '2026-10-12', dateEnd: '2026-10-16', schoolStatus: 'no-classes', gradeScope: 'Seniors' }]
    expect(buildExtendedTimeOff(scoped)).toEqual([])
  })

  it('respects explicit Saturday instruction and omits unknown attendance weather markers', () => {
    const adjusted = structuredClone(calendar)
    adjusted.events.push({ ...calendar.events[0]!, id: 'saturday-class', dateStart: '2026-11-21', dateEnd: null, eventType: 'SCHOOL_MILESTONE', schoolStatus: 'schools-open', countsAsStudentAttendanceDay: true })
    expect(buildExtendedTimeOff(adjusted).find(item => item.end === '2026-11-29')?.start).toBe('2026-11-22')
    adjusted.events = [{ ...calendar.events[0]!, dateStart: '2026-10-12', dateEnd: '2026-10-16', eventType: 'WEATHER_DAY', schoolStatus: 'unknown', mayBecomeAttendanceDay: true }]
    expect(buildExtendedTimeOff(adjusted)).toEqual([])
  })

  it('expands and collapses notes while preserving their text', async () => {
    const wrapper = mount(CalendarEditorialSummary, { props: { summary: calendar.editorialSummary, heading: 'Calendar Notes', collapsible: true } })
    const button = wrapper.get('button')
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('.calendar-editorial-copy').classes()).toContain('calendar-editorial-copy--collapsed')
    await button.trigger('click')
    expect(button.text()).toBe('Read less')
    expect(button.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('.calendar-editorial-copy').classes()).not.toContain('calendar-editorial-copy--collapsed')
    expect(wrapper.text()).toContain(calendar.editorialSummary.paragraphs[0]!)
    await button.trigger('click')
    expect(button.text()).toBe('Read more')
    wrapper.unmount()
  })

  it('builds a correction email with the right page, year, district and user text without sending it', () => {
    const href = calendarCorrectionHref({ page: 'https://flschoolcalendar.com/hernando/2026-2027/', district: 'Hernando County', schoolYear: '2026-2027', message: 'March 22 & 23: please check\nOfficial source attached.', email: 'parent@example.org' })
    const params = new URLSearchParams(href.split('?')[1])
    expect(params.get('subject')).toContain('Hernando County 2026-2027')
    expect(params.get('body')).toContain('Page: https://flschoolcalendar.com/hernando/2026-2027/')
    expect(params.get('body')).toContain('March 22 & 23: please check\nOfficial source attached.')
    expect(params.get('body')).toContain('Reply email: parent@example.org')
    expect(href).toMatch(/^mailto:corrections@flschoolcalendar.com\?/)
  })

  it('opens a modal correction form, validates fields and supports cancellation', async () => {
    const wrapper = mount(CalendarCorrection, { props: { district: record.district, calendar } })
    const element = wrapper.get('dialog').element as HTMLDialogElement
    const show = vi.spyOn(element, 'showModal')
    const close = vi.spyOn(element, 'close')
    await wrapper.get('.calendar-correction-strip button').trigger('click')
    expect(show).toHaveBeenCalledOnce()
    expect(wrapper.get('textarea').attributes('required')).toBeDefined()
    expect(wrapper.get('input').attributes('type')).toBe('email')
    expect(wrapper.text()).toContain('Send the email there')
    await wrapper.get('button[aria-label="Close correction form"]').trigger('click')
    expect(close).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('uses the reference modules and publishes only the selected visible FAQs', () => {
    const wrapper = shallowMount(DistrictCalendarPage, { props: { district: record.district, calendar, calendars: [calendar], relatedResources: [], nearbyDistricts: [], otherDistricts: [] } })
    const html = wrapper.html()
    expect(html).toContain('calendar-extended-time-off-stub')
    expect(html).toContain('calendar-correction-stub')
    expect(html).not.toMatch(/calendar-bell-times-stub|calendar-break-countdown-stub|calendar-year-statistics-stub/)
    const schema = buildDistrictCalendarSchema({ siteUrl: 'https://flschoolcalendar.com', path: '/hernando/2026-2027/', district: record.district, calendar, discovery: record.calendarDiscovery })
    const selected = selectCalendarFaqs(calendar.faqs)
    expect(wrapper.findComponent(CalendarFaq).props('items')).toEqual(selected)
    const faqSchema = (schema['@graph'] as Array<Record<string, unknown>>).find(node => node['@type'] === 'FAQPage')
    expect(faqSchema?.mainEntity).toEqual(selected.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })))
    expect(selected).toHaveLength(8)
    expect(calendar.faqs.length).toBeGreaterThan(selected.length)
    expect(calendar.faqs.length).toBeGreaterThan(0)
    wrapper.unmount()
  })
})
