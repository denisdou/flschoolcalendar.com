import { mount } from '@vue/test-utils'
import { h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CalendarEvent } from '../../shared/types/content'
import CalendarBreakCountdown from '../../app/components/calendar/CalendarBreakCountdown.vue'

const events: CalendarEvent[] = [
  {
    id: 'staff-development-day',
    name: 'Staff Development Day (No School)',
    dateStart: '2026-09-21',
    dateEnd: null,
    eventType: 'NON_STUDENT_DAY',
    schoolStatus: 'no-students',
    sourceId: 'official-calendar',
    note: null,
  },
  {
    id: 'student-holiday',
    name: 'Student Holiday / No School',
    dateStart: '2026-10-12',
    dateEnd: null,
    eventType: 'HOLIDAY',
    schoolStatus: 'no-classes',
    sourceId: 'official-calendar',
    note: null,
  },
  {
    id: 'veterans-day',
    name: 'Veterans Day',
    dateStart: '2026-11-11',
    dateEnd: null,
    eventType: 'HOLIDAY',
    schoolStatus: 'no-classes',
    sourceId: 'official-calendar',
    note: null,
  },
  {
    id: 'thanksgiving-break',
    name: 'Thanksgiving Break',
    dateStart: '2026-11-23',
    dateEnd: '2026-11-27',
    eventType: 'THANKSGIVING_BREAK',
    schoolStatus: 'no-classes',
    sourceId: 'official-calendar',
    note: null,
  },
]

describe('next no-school day or break countdown', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not bake a build-time countdown into server-rendered HTML', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-11T20:00:00Z'))

    const html = await renderToString(h(CalendarBreakCountdown, { events }))

    expect(html).toContain('Checking the current school calendar')
    expect(html).not.toContain('In 32 calendar days')
    expect(html).toContain('calendar-break-countdown-value--placeholder')
  })

  it('selects the next districtwide no-school date in Eastern Time', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T20:00:00Z'))

    const wrapper = mount(CalendarBreakCountdown, { props: { events } })
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Staff Development Day (No School)')
    expect(wrapper.text()).toContain('In 11 calendar days')
    expect(wrapper.text()).not.toContain('Student Holiday / No School')
    expect(wrapper.text()).not.toContain('Veterans Day')
    expect(wrapper.text()).toContain('America/New_York')
    wrapper.unmount()
  })

  it('shows a districtwide holiday as no school today', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-11T20:00:00Z'))

    const wrapper = mount(CalendarBreakCountdown, { props: { events } })
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Veterans Day')
    expect(wrapper.text()).toContain('No school today')
    wrapper.unmount()
  })

  it('shows when a listed break is in progress', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-25T20:00:00Z'))

    const wrapper = mount(CalendarBreakCountdown, { props: { events } })
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Current school break')
    expect(wrapper.text()).toContain('Happening now · ends in 2 calendar days')
    wrapper.unmount()
  })

  it('does not invent another break after the final listed break', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-12-01T20:00:00Z'))

    const wrapper = mount(CalendarBreakCountdown, { props: { events } })
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('No more no-school days or breaks are listed for this school year.')
    expect(wrapper.find('.calendar-break-countdown-value--placeholder').exists()).toBe(true)
    wrapper.unmount()
  })
})
