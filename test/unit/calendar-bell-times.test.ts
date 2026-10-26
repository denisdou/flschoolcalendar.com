import { mount, shallowMount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CalendarBellTimes from '../../app/components/calendar/CalendarBellTimes.vue'
import CalendarSectionNav from '../../app/components/calendar/CalendarSectionNav.vue'
import DistrictCalendarPage from '../../app/components/calendar/DistrictCalendarPage.vue'
import { getSchoolHoursRows } from '../../shared/utils/schoolHours'
import type { CalendarSchoolHours, DistrictRecord } from '../../shared/types/content'
import corpusRecord from '../fixtures/districts/corpus-christi-isd.json'
import midlandRecord from '../fixtures/districts/midland-isd.json'

const record = corpusRecord as unknown as DistrictRecord
const calendar = record.schoolYears['2026-2027']!
const heading = 'Corpus Christi ISD 2026-2027 school hours & bell times'

describe('stored school hours and bell-time navigation', () => {
  it('shows a note shared by every schedule once and leaves the stored rows intact', () => {
    const note = 'Current hours; confirm your campus schedule.'
    const hours = [
      { scope: 'Elementary', regularHours: '8:00 a.m.-3:00 p.m.', note },
      { scope: 'Middle', regularHours: '8:30 a.m.-3:30 p.m.', note: ` ${note} ` },
    ]
    const wrapper = mount(CalendarBellTimes, { props: { hours, sources: [], heading } })
    expect(wrapper.findAll('.calendar-bell-times-note')).toHaveLength(1)
    expect(wrapper.find('.calendar-bell-times-shared-note').text()).toBe(note)
    expect(wrapper.find('.calendar-bell-times-list').text()).not.toContain(note)
    expect(hours[1]!.note).toBe(` ${note} `)
    wrapper.unmount()
  })

  it('keeps partial, different and single-row caveats within their applicable rows', () => {
    const note = 'Confirm the campus schedule.'
    for (const hours of [
      [{ scope: 'Elementary', regularHours: '8:00 a.m.-3:00 p.m.', note }, { scope: 'Middle', regularHours: '9:00 a.m.-4:00 p.m.' }],
      [{ scope: 'Elementary', regularHours: '8:00 a.m.-3:00 p.m.', note }, { scope: 'Middle', regularHours: '9:00 a.m.-4:00 p.m.', note: 'Friday hours differ.' }],
      [{ scope: 'Elementary', regularHours: '8:00 a.m.-3:00 p.m.', note }],
    ]) {
      const wrapper = mount(CalendarBellTimes, { props: { hours, sources: [], heading } })
      expect(wrapper.find('.calendar-bell-times-shared-note').exists()).toBe(false)
      expect(wrapper.find('.calendar-bell-times-row').text()).toContain(note)
      expect(wrapper.findAll('.calendar-bell-times-note')).toHaveLength(hours.filter(row => row.note).length)
      wrapper.unmount()
    }
  })

  it('renders the current Corpus Christi schedule and links its specific official source', () => {
    const wrapper = mount(CalendarBellTimes, { props: { hours: calendar.schoolHours, sources: calendar.sources, heading } })
    expect(wrapper.find('#bell-times').attributes('aria-labelledby')).toBe('bell-times-heading')
    expect(wrapper.find('h2').text()).toBe(heading)
    expect(wrapper.findAll('.calendar-bell-times-row')).toHaveLength(4)
    expect(wrapper.text()).toContain('Middle schools except Metro Prep')
    expect(wrapper.text()).not.toContain('8:30 a.m.-3:50 p.m.')
    expect(wrapper.text()).toContain('High schools and Metro Prep')
    expect(wrapper.text()).toContain('8:50 a.m.-4:10 p.m.')
    expect(wrapper.text()).toContain('Official schedule')
    expect(wrapper.findAll('.calendar-bell-times-source')).toHaveLength(2)
    expect(wrapper.findAll('a')).toHaveLength(2)
    expect(wrapper.findAll('.calendar-bell-times-sources time')).toHaveLength(2)
    expect(wrapper.find('.calendar-bell-times-sources time').attributes('datetime')).toBe('2026-07-22')
    expect(wrapper.find('.calendar-bell-times-sources').text()).toContain('Published July 22, 2026')
    expect(wrapper.find('.calendar-bell-times-sources a').attributes('href')).toBe('https://www.ccisd.us/live_feeds/12679849')
    expect(wrapper.findAll('.calendar-bell-times-sources a')[1]!.attributes('href')).toBe('https://www.ccisd.us/article/3112104')
    expect(wrapper.findAll('.calendar-bell-times-sources time')[1]!.attributes('datetime')).toBe('2026-09-03')
    expect(wrapper.find('.calendar-bell-times-sources').text()).toContain('Published September 3, 2026')
    const rows = wrapper.findAll('.calendar-bell-times-row')
    expect(rows[2]!.text()).toContain('8:50 a.m.-4:10 p.m.')
    expect(rows[2]!.find('.calendar-bell-times-effective').text()).toBe('School dates: from September 21, 2026')
    expect(rows[2]!.text()).not.toContain('May 28, 2027')
    expect(wrapper.text()).not.toContain('Opening schedule only')
    expect(wrapper.findAll('.calendar-bell-times-row').every(row => !row.find('a').exists())).toBe(true)
    expect(wrapper.find('a').attributes('href')).toBe('https://www.ccisd.us/live_feeds/12679849')
    expect(wrapper.text()).not.toContain('Early release')
  })

  it('shows one-sided effective dates and omits the date line on legacy schedules', () => {
    const wrapper = mount(CalendarBellTimes, { props: {
      hours: [
        { scope: 'From date', regularHours: '8:00 a.m.-3:00 p.m.', effectiveFrom: '2026-09-21' },
        { scope: 'Through date', regularHours: '8:00 a.m.-3:00 p.m.', effectiveThrough: '2026-09-18' },
        { scope: 'Legacy', regularHours: '8:00 a.m.-3:00 p.m.' },
      ], sources: [], heading,
    } })
    const rows = wrapper.findAll('.calendar-bell-times-row')
    expect(rows[0]!.find('.calendar-bell-times-effective').text()).toBe('School dates: from September 21, 2026')
    expect(rows[1]!.find('.calendar-bell-times-effective').text()).toBe('School dates: through September 18, 2026')
    expect(rows[2]!.find('.calendar-bell-times-effective').exists()).toBe(false)
  })

  it('groups shared sources in the footer and scopes different evidence to the relevant rows', () => {
    const source = calendar.sources.find(source => source.id === 'corpus-christi-2026-2027-bell-schedule')!
    const wrapper = mount(CalendarBellTimes, {
      props: {
        hours: [
          { scope: 'Elementary', regularHours: '8:00 a.m.-3:00 p.m.', sourceId: source.id, basis: 'official' },
          { scope: 'Middle school', regularHours: '8:30 a.m.-3:30 p.m.', sourceId: source.id, basis: 'official' },
          { scope: 'High school', regularHours: '9:00 a.m.-4:00 p.m.', sourceId: source.id, basis: 'derived' },
          { scope: 'Other program', regularHours: '10:00 a.m.-2:00 p.m.' },
        ],
        sources: [source], heading,
      },
    })
    const groups = wrapper.findAll('.calendar-bell-times-source')
    expect(groups).toHaveLength(2)
    expect(groups[0]!.find('.calendar-bell-times-source-scope').text()).toBe('Elementary; Middle school')
    expect(groups[0]!.text()).toContain('Official schedule')
    expect(groups[1]!.find('.calendar-bell-times-source-scope').text()).toBe('High school')
    expect(groups[1]!.text()).toContain('Derived from official information')
    expect(wrapper.find('.calendar-bell-times-sources').text()).not.toContain('Other program')
  })

  it('keeps distinct source links and hides the footer when no provenance is stored', () => {
    const first = calendar.sources.find(source => source.id === 'corpus-christi-2026-2027-bell-schedule')!
    const second = { ...first, id: 'campus-schedule', label: 'Campus schedule', url: 'https://example.com/campus', publishedAt: null }
    const wrapper = mount(CalendarBellTimes, {
      props: {
        hours: [
          { scope: 'Elementary', regularHours: '8:00 a.m.-3:00 p.m.', sourceId: first.id, basis: 'official' },
          { scope: 'Campus', regularHours: '9:00 a.m.-4:00 p.m.', sourceId: second.id, basis: 'official' },
        ],
        sources: [first, second], heading,
      },
    })
    expect(wrapper.findAll('.calendar-bell-times-sources a').map(link => link.attributes('href'))).toEqual([first.url, second.url])
    expect(wrapper.findAll('.calendar-bell-times-source')[1]!.find('time').exists()).toBe(false)
    const unreferenced = mount(CalendarBellTimes, { props: { hours: [{ scope: 'Example', regularHours: '8:00 a.m.-3:00 p.m.' }], sources: [], heading } })
    expect(unreferenced.find('.calendar-bell-times-sources').exists()).toBe(false)
  })

  it('shows only stored schedule variants and preserves session-specific notes', () => {
    const hours: CalendarSchoolHours[] = [
      { scope: 'High school', regularHours: '8:50 a.m.-4:15 p.m.', earlyReleaseTime: '1:00 p.m.', lateArrivalHours: '10:00 a.m.-4:15 p.m.', examDismissalHours: '12:00 p.m.' },
      { scope: 'Half-day Pre-K AM', earlyReleaseHours: '7:30-10:15 a.m.', note: 'No half-day Pre-K PM classes on early-release days.' },
    ]
    const wrapper = mount(CalendarBellTimes, { props: { hours, sources: [], heading } })
    expect(wrapper.text()).toContain('Early release')
    expect(wrapper.text()).toContain('1:00 p.m.')
    expect(wrapper.text()).toContain('Late arrival')
    expect(wrapper.text()).toContain('Exam dismissal')
    expect(wrapper.findAll('.calendar-bell-times-row')[1]!.text()).not.toContain('Regular hours')
    expect(wrapper.text()).toContain('No half-day Pre-K PM classes on early-release days.')
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('adapts Midland stored full-day and half-day sessions without inferring attendance rules', () => {
    const program = midlandRecord.schoolYears['2026-2027-pre-k-academy'].schoolHours
    expect(getSchoolHoursRows(program)).toEqual([
      { scope: 'Full-day schedule', regularHours: '7:30 a.m.-3:30 p.m.', sourceId: program.sourceId, basis: 'official' },
      { scope: 'Half-day schedule', regularHours: '7:30 a.m.-12:00 p.m.', sourceId: program.sourceId, basis: 'official' },
    ])
  })

  it('does not display empty rows, notes-only rows or invalid program clocks', () => {
    expect(getSchoolHoursRows(undefined)).toEqual([])
    expect(getSchoolHoursRows(null)).toEqual([])
    expect(getSchoolHoursRows([])).toEqual([])
    expect(getSchoolHoursRows([{ scope: 'Example', note: 'Ask your campus.' }, { scope: ' ', regularHours: '8:00 a.m.' }])).toEqual([])
    expect(getSchoolHoursRows({ fullDay: { start: '25:00', end: '15:30' } })).toEqual([])
    const wrapper = mount(CalendarBellTimes, { props: { hours: [], sources: [], heading } })
    expect(wrapper.find('#bell-times').exists()).toBe(false)
  })

  it('does not invent a source or link to an unsafe source URL', () => {
    const wrapper = mount(CalendarBellTimes, {
      props: {
        hours: [{ scope: 'Example', regularHours: '8:00 a.m.-3:00 p.m.', sourceId: 'unsafe' }],
        sources: [{ id: 'unsafe', label: 'Not a valid official URL', type: 'official-webpage', url: 'javascript:alert(1)', publishedAt: null, retrievedAt: '2026-10-04' }],
        heading,
      },
    })
    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Official schedule')
  })

  it('adds the TOC anchor only when bell-time rows exist', () => {
    const shown = mount(CalendarSectionNav, { props: { hasFaq: true, hasRelatedCalendars: false, hasBellTimes: true } })
    expect(shown.find('a[href="#bell-times"]').text()).toBe('Bell times')
    const hidden = mount(CalendarSectionNav, { props: { hasFaq: true, hasRelatedCalendars: false } })
    expect(hidden.find('a[href="#bell-times"]').exists()).toBe(false)
  })

  it('keeps bell data available without adding a bell-time module to the reference detail layout', () => {
    const wrapper = shallowMount(DistrictCalendarPage, {
      props: { district: record.district, calendar, calendars: [calendar], relatedResources: [], otherDistricts: [], nearbyDistricts: [] },
    })
    expect(wrapper.findComponent(CalendarSectionNav).exists()).toBe(false)
    expect(wrapper.findComponent(CalendarBellTimes).exists()).toBe(false)
    expect(getSchoolHoursRows(calendar.schoolHours).length).toBeGreaterThan(0)
    wrapper.unmount()
  })
})
