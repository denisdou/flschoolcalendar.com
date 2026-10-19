import { mount } from '@vue/test-utils'
import { h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MonthlyCalendar from '../../app/components/calendar/MonthlyCalendar.vue'

describe('monthly calendar current date', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not bake the build date into server-rendered HTML', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-09T12:00:00Z'))

    const html = await renderToString(h(MonthlyCalendar, {
      districtName: 'Example Independent School District',
      events: [],
      firstDay: '2026-08-01',
      lastDay: '2027-06-30',
    }))

    expect(html).not.toContain('month-calendar--current')
    expect(html).not.toContain('aria-current="date"')
    expect(html).not.toContain('Current month')
  })

  it('uses Eastern Time when highlighting today and the current month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T03:30:00Z'))

    const wrapper = mount(MonthlyCalendar, {
      props: {
        districtName: 'Example Independent School District',
        events: [],
        firstDay: '2026-08-01',
        lastDay: '2026-09-30',
      },
    })
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Eastern Time (America/New_York)')
    expect(wrapper.find('.month-calendar--current h3').text()).toBe('August 2026')
    expect(wrapper.find('time[aria-current="date"]').attributes('datetime')).toBe('2026-08-31')
    expect(wrapper.find('.current-month-jump').attributes('href')).toBe('#current-calendar-month')
    expect(wrapper.find('#current-calendar-month h3').text()).toBe('August 2026')

    wrapper.unmount()
  })

  it('refreshes the current month after a mounted page crosses into a new month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T03:59:00Z'))

    const wrapper = mount(MonthlyCalendar, {
      props: {
        districtName: 'Example Independent School District',
        events: [],
        firstDay: '2026-08-01',
        lastDay: '2026-09-30',
      },
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.month-calendar--current h3').text()).toBe('August 2026')

    vi.setSystemTime(new Date('2026-09-01T04:01:00Z'))
    window.dispatchEvent(new Event('focus'))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.month-calendar--current h3').text()).toBe('September 2026')
    expect(wrapper.find('time[aria-current="date"]').attributes('datetime')).toBe('2026-09-01')

    wrapper.unmount()
  })

  it('formats date-only district events in Central Time without shifting the day', () => {
    const wrapper = mount(MonthlyCalendar, {
      props: {
        districtName: 'Example Independent School District',
        firstDay: '2026-08-01',
        lastDay: '2026-08-31',
        events: [{
          id: 'example-last-day',
          dateStart: '2026-08-31',
          dateEnd: null,
          eventType: 'LAST_DAY',
          name: 'Last Day of School',
          schoolStatus: 'schools-open',
          sourceId: 'example-source',
          note: null,
        }],
      },
    })

    const eventDates = wrapper.findAll('time[datetime="2026-08-31"]')
    expect(eventDates.some(element => element.text().includes('Aug 31'))).toBe(true)
    expect(wrapper.find('.month-calendar h3').text()).toBe('August 2026')

    wrapper.unmount()
  })
})
