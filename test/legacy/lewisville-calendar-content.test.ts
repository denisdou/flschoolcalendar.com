import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CalendarEventsTable from '../../app/components/calendar/CalendarEventsTable.vue'
import record from '../fixtures/districts/lewisville-isd.json'
import type { CalendarEvent } from '../../shared/types/content'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore The offline checker is a dependency-free Node module.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore The statistics calculator is a dependency-free Node module.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const calendar = record.schoolYears['2026-2027']
const events = calendar.events as CalendarEvent[]
const event = (id: string) => events.find(item => item.id === id)!

describe('Lewisville ISD source and derived calendar boundaries', () => {
  it('passes the publishing gate with chronological events and valid closure references', () => {
    expect(auditRecords([{ filename: 'lewisville-isd.json', record }])).toEqual([])
    const dates = events.map(item => item.dateStart)
    expect(dates).toEqual([...dates].sort())
    expect(new Set(events.map(item => item.id)).size).toBe(events.length)
    for (const id of calendar.noSchoolDayEventIds) {
      expect(['no-classes', 'no-students']).toContain(event(id).schoolStatus)
    }
  })

  it('keeps October holidays atomic and the continuous interval in breaks', () => {
    expect(event('lewisville-2026-october-9-student-holiday')).toMatchObject({
      dateStart: '2026-10-09', dateEnd: null, name: 'Student Holiday, Staff Day', dateBasis: 'official',
    })
    expect(event('lewisville-2026-october-12-holiday')).toMatchObject({
      dateStart: '2026-10-12', dateEnd: null, name: 'Holiday', dateBasis: 'official',
    })
    expect(events.some(item => item.id === 'lewisville-2026-october-break')).toBe(false)
    expect(calendar.breaks.find(item => item.name === 'October Student Break')).toMatchObject({
      dateStart: '2026-10-09', dateEnd: '2026-10-12', nextStudentAttendanceDate: '2026-10-13',
    })
  })

  it('separates the official winter holiday block from the January staff day', () => {
    expect(event('lewisville-2026-winter-break')).toMatchObject({
      dateStart: '2026-12-21', dateEnd: '2027-01-01', name: 'Holiday', dateBasis: 'official',
    })
    expect(event('lewisville-2027-january-4-staff-day')).toMatchObject({
      dateStart: '2027-01-04', dateEnd: null, name: 'Staff Day', schoolStatus: 'no-students',
      nameBasis: 'official', dateBasis: 'official', schoolStatusBasis: 'derived',
    })
    expect(event('lewisville-2027-third-nine-weeks-start').name).toBe('Students Return')
  })

  it.each(['lewisville-2026-thanksgiving-break', 'lewisville-2026-winter-break', 'lewisville-2027-spring-break'])(
    'distinguishes the official Holiday label from editorial classification: %s', (id) => {
      expect(event(id)).toMatchObject({
        name: 'Holiday', officialLabel: 'Holiday', nameBasis: 'official', dateBasis: 'official',
        displayNameBasis: 'derived', eventTypeBasis: 'derived',
      })
      expect(event(id)).not.toHaveProperty('basis')
    },
  )

  it('merges the inferred final date into the official early-release event', () => {
    expect(calendar.lastDayBasis).toBe('derived')
    expect(events.filter(item => item.dateStart === '2027-05-21')).toHaveLength(1)
    expect(events.some(item => item.id === 'lewisville-2027-final-student-day')).toBe(false)
    expect(event('lewisville-2027-may-21-early-release')).toMatchObject({
      dateStart: '2027-05-21', eventType: 'EARLY_RELEASE', dateBasis: 'official', schoolStatus: 'early-dismissal',
      isFinalStudentDate: true, finalStudentDateBasis: 'derived',
      eventTypes: ['EARLY_RELEASE', 'GRADING_PERIOD_END', 'SEMESTER_END'],
      eventTypesBasis: { EARLY_RELEASE: 'official', GRADING_PERIOD_END: 'derived', SEMESTER_END: 'derived' },
    })
  })

  it('scopes the DOI and holiday FAQs without inventing a reason for choosing August 12', () => {
    expect(calendar.faqs).toHaveLength(18)
    expect(calendar.faqs.some(item => item.question.startsWith('Why does Lewisville ISD start'))).toBe(false)
    expect(calendar.faqs.find(item => item.question === 'How can Lewisville ISD start school before the fourth Monday in August?')?.answer)
      .toContain('District of Innovation plan exempts the district')
    expect(calendar.faqs.some(item => item.question === 'Which single-day holidays fall during the Lewisville ISD student school year in 2026-27?')).toBe(true)
    expect(calendar.seo.title).toBe('Lewisville ISD Calendar 2026-27: Holidays & Breaks')
    expect(calendar.seo.description).toContain('final listed student day')
    expect(calendar.seo.description).toContain('early-release dates')
    expect(calendar.hero.mobileDescription).toContain('final listed student day')
    expect(calendar.hero.desktopDescription).toContain('Students are off November 23–27 for Thanksgiving week')
    expect(calendar.editorialSummary.paragraphs).toHaveLength(4)
  })

  it('uses field-level provenance and represents all four grading boundaries symmetrically', () => {
    for (const item of events) {
      expect(item).not.toHaveProperty('basis')
      expect(item.dateBasis).toBe('official')
      expect(['official', 'derived']).toContain(item.nameBasis)
      expect(['official', 'derived']).toContain(item.eventTypeBasis)
    }
    expect(events.filter(item => hasEventType(item, 'GRADING_PERIOD_START')).map(item => item.dateStart))
      .toEqual(['2026-08-12', '2026-10-13', '2027-01-05', '2027-03-22'])
    expect(events.filter(item => hasEventType(item, 'GRADING_PERIOD_END')).map(item => item.dateStart))
      .toEqual(['2026-10-08', '2026-12-18', '2027-03-12', '2027-05-21'])
    for (const id of ['lewisville-2026-first-nine-weeks-end', 'lewisville-2026-second-nine-weeks-start', 'lewisville-2027-third-nine-weeks-end', 'lewisville-2027-fourth-nine-weeks-start']) {
      expect(event(id)).toMatchObject({ nameBasis: 'derived', eventTypeBasis: 'derived', dateBasis: 'official' })
    }
  })

  it('renders one final-date row without declaring a separately published last day', () => {
    const wrapper = mount(CalendarEventsTable, {
      props: { events: events.filter(item => item.dateStart === '2027-05-21'), districtName: 'Lewisville ISD', schoolYear: '2026-2027' },
    })
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.text()).toContain('Final shown / early dismissal')
    expect(wrapper.text()).not.toContain('School closes')
    wrapper.unmount()
  })

  it.each([
    { finalStudentDateBasis: undefined },
    { finalStudentDateBasis: 'official' },
    { isFinalStudentDate: 'true' },
    { dateStart: '2027-05-20' },
    { dateEnd: '2027-05-22' },
    { schoolStatus: 'no-classes' },
    { isDateConfirmed: false },
  ])('rejects an unsafe merged final-date marker: %j', (overrides) => {
    const copy = structuredClone(record)
    const item = copy.schoolYears['2026-2027'].events.find(item => item.id === 'lewisville-2027-may-21-early-release')!
    Object.assign(item, overrides)
    expect(auditRecords([{ filename: 'lewisville-isd.json', record: copy }]).some((issue: { severity: string }) => issue.severity === 'error')).toBe(true)
  })

  it.each([
    null,
    { EARLY_RELEASE: 'guessed', GRADING_PERIOD_END: 'derived', SEMESTER_END: 'derived' },
    { EARLY_RELEASE: 'official' },
    { EARLY_RELEASE: 'derived', GRADING_PERIOD_END: 'derived', SEMESTER_END: 'derived' },
    { EARLY_RELEASE: 'official', GRADING_PERIOD_END: 'derived', SEMESTER_END: 'derived', LAST_DAY: 'official' },
  ])('rejects incomplete or conflicting classification provenance: %j', (basis) => {
    const copy = structuredClone(record)
    Object.assign(copy.schoolYears['2026-2027'].events.find(item => item.id === 'lewisville-2027-may-21-early-release')!, { eventTypesBasis: basis })
    expect(auditRecords([{ filename: 'lewisville-isd.json', record: copy }]).some((issue: { code: string }) =>
      ['INVALID_EVENT_TYPES_BASIS', 'CONFLICTING_EVENT_TYPE_BASIS'].includes(issue.code))).toBe(true)
  })

  it('preserves conditional weather attendance without an unconditional false attendance flag', () => {
    const weather = event('lewisville-2027-march-29-bad-weather-day')
    expect(weather).toMatchObject({
      schoolStatus: 'conditional-attendance', mayBecomeAttendanceDay: true,
      countsAsStudentAttendanceDayUnderPublishedSchedule: false,
    })
    expect(weather).not.toHaveProperty('countsAsStudentAttendanceDay')
    expect(calendar.noSchoolDayEventIds).not.toContain(weather.id)
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
    expect(calendar.statistics.find(item => item.id === 'student-attendance-days')?.value).toBe('174 days')
    expect(calendar.statistics.find(item => item.id === 'total-no-school-weekdays')?.value).toBe('28 weekdays')
    expect(calendar.statistics.find(item => item.id === 'student-no-school-days')?.value).toBe('4 days')
  })

  it('includes sourced ECC and ECSE hours and separates early-release dates from dismissal times', () => {
    expect(calendar.schoolHours.find(item => item.scope === 'Early Childhood Centers')).toMatchObject({
      regularHours: '7:25 a.m.–2:50 p.m.', earlyReleaseTime: '11:30 a.m.', sourceId: 'lewisville-isd-school-hours',
    })
    expect(calendar.schoolHours.find(item => item.scope === 'Early Childhood Center half-day ECSE')).toMatchObject({
      earlyReleaseHours: 'Morning 7:25–9:30 a.m.; afternoon 9:30–11:35 a.m.',
    })
    expect(calendar.faqs.some(item => item.question.startsWith('When are Lewisville ISD early-release'))).toBe(true)
    expect(calendar.faqs.some(item => item.question.startsWith('What time does Lewisville ISD dismiss'))).toBe(true)
    expect(calendar.faqs.some(item => item.question.includes('2027-2028, 2028-2029'))).toBe(false)
  })
})
