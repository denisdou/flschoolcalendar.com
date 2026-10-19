import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CalendarEventsTable from '../../app/components/calendar/CalendarEventsTable.vue'
import type { CalendarEvent } from '../../shared/types/content'
import record from '../fixtures/districts/denton-isd.json'
import episdRecord from '../fixtures/districts/el-paso-isd.json'
import pasadenaRecord from '../fixtures/districts/pasadena-isd.json'
import prosperRecord from '../fixtures/districts/prosper-isd.json'
import { getEventTypes, hasEventType } from '../../shared/utils/eventTypes.mjs'

describe('multi-classification event presentation', () => {
  it('groups Prosper semester-end release and grading milestones by date', () => {
    const events = prosperRecord.schoolYears['2026-2027'].events.filter(event => ['2026-12-18', '2027-05-20'].includes(event.dateStart)) as CalendarEvent[]
    const wrapper = mount(CalendarEventsTable, { props: { events, districtName: 'Prosper ISD', schoolYear: '2026-2027' } })
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(wrapper.findAll('.calendar-event-row--early-release')).toHaveLength(2)
    expect(rows[0]!.text()).toContain('Second Nine Weeks Ends')
    expect(rows[1]!.text()).toContain('Fourth Nine Weeks Ends')
    expect(rows[1]!.text()).toContain('Last day / early dismissal')
    wrapper.unmount()
  })

  it('finds both Pasadena early-release dates and renders the compound last day once', () => {
    const events = pasadenaRecord.schoolYears['2026-2027'].events as CalendarEvent[]
    const shortened = events.filter(event => hasEventType(event, 'EARLY_RELEASE'))
    expect(shortened.map(event => event.dateStart)).toEqual(['2026-12-18', '2027-05-21'])
    const wrapper = mount(CalendarEventsTable, { props: { events: shortened, districtName: 'Pasadena ISD', schoolYear: '2026-2027' } })
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    expect(wrapper.findAll('.calendar-event-row--early-release')).toHaveLength(2)
    const last = wrapper.findAll('tbody tr').find(row => row.find('time').attributes('datetime') === '2027-05-21')!
    expect(last.text()).toContain('Last day / early dismissal')
    expect(last.find('.badge--early-release').exists()).toBe(true)
    wrapper.unmount()
  })

  it('renders May 27 once with both last-day and early-dismissal meaning', () => {
    const events = record.schoolYears['2026-2027'].events.filter(event => ['2026-12-17', '2026-12-18', '2027-05-26', '2027-05-27'].includes(event.dateStart)) as CalendarEvent[]
    const wrapper = mount(CalendarEventsTable, { props: { events, districtName: 'Denton ISD', schoolYear: '2026-2027' } })
    expect(wrapper.findAll('tbody tr')).toHaveLength(4)
    expect(wrapper.findAll('.calendar-event-row--early-release')).toHaveLength(4)
    const last = wrapper.findAll('tbody tr').find(row => row.find('time').attributes('datetime') === '2027-05-27')!
    expect(last.text()).toContain('Last Day / End of Grading Period')
    expect(last.text()).toContain('Last day / early dismissal')
    expect(last.find('.badge--early-release').exists()).toBe(true)
    wrapper.unmount()
  })

  it('keeps legacy last-day status without adding an early-dismissal label', () => {
    const event = { ...record.schoolYears['2026-2027'].events.find(event => event.id === 'denton-2027-last-day')!, eventTypes: undefined, schoolStatus: 'schools-open' } as CalendarEvent
    const wrapper = mount(CalendarEventsTable, { props: { events: [event], districtName: 'Example ISD', schoolYear: '2026-2027' } })
    expect(wrapper.text()).toContain('School closes')
    expect(wrapper.find('.calendar-event-row--early-release').exists()).toBe(false)
    wrapper.unmount()
  })

  it('preserves EPISD semester, grading and participant classifications', () => {
    const calendar = episdRecord.schoolYears['2026-2027']
    const events = calendar.events as CalendarEvent[]
    const event = (id: string) => events.find(item => item.id === id)!

    expect(getEventTypes(event('episd-2026-first-day'))).toEqual(['FIRST_DAY', 'SEMESTER_START', 'GRADING_PERIOD_START'])
    expect(getEventTypes(event('episd-2026-second-grading-period-end'))).toEqual(['GRADING_PERIOD_END', 'SEMESTER_END'])
    expect(getEventTypes(event('episd-2027-second-semester-start'))).toEqual(['SEMESTER_START', 'GRADING_PERIOD_START'])
    expect(getEventTypes(event('episd-2027-last-day'))).toEqual(['LAST_DAY', 'SEMESTER_END', 'GRADING_PERIOD_END'])
    expect(event('episd-2026-winter-eoc-window')).toMatchObject({
      participantScope: 'Students assigned to EOC testing',
      participantScopeBasis: 'derived',
    })
    expect(event('episd-2026-winter-eoc-window').gradeScope).toBeUndefined()
    expect(events.filter(item => item.participantScope === 'Students assigned to ADSY intersession').every(item => item.schoolStatus === 'program-specific')).toBe(true)
  })
})
