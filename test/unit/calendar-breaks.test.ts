import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CalendarBreaks from '../../app/components/calendar/CalendarBreaks.vue'
import type { CalendarBreak } from '../../shared/types/content'
import record from '../fixtures/districts/corpus-christi-isd.json'

const breaks = record.schoolYears['2026-2027'].breaks as CalendarBreak[]

describe('breaks and intersession planning windows', () => {
  it('does not present intersession as six confirmed weekdays off', () => {
    const wrapper = mount(CalendarBreaks, { props: { breaks } })
    const october = wrapper.findAll('.break-item')[0]!
    expect(october.text()).not.toContain('School weekdays off')
    expect(october.text()).not.toContain('6 weekdays')
    expect(october.text()).toContain('not a confirmed no-attendance break for every student')
    expect(october.text()).toContain("Follow your school's participation instructions")
    expect(october.text()).toContain('Students return')
    expect(wrapper.text()).not.toContain('Multi-day closures')
  })

  it('keeps confirmed holiday counts and omits notes when none are stored', () => {
    const wrapper = mount(CalendarBreaks, { props: { breaks: [breaks[1]!] } })
    expect(wrapper.find('.source-label').text()).toBe('Students return')
    expect(wrapper.text()).toContain('School weekdays off')
    expect(wrapper.find('.source-item .text-data').text()).toBe('5')
    expect(wrapper.text()).not.toContain('participation')
  })

  it('does not show a blank closure count when a legacy row omits the field', () => {
    const row = { ...breaks[0] } as unknown as Record<string, unknown>
    delete row.schoolWeekdaysOff
    const wrapper = mount(CalendarBreaks, { props: { breaks: [row as unknown as CalendarBreak] } })
    expect(wrapper.text()).not.toContain('School weekdays off')
  })
})
