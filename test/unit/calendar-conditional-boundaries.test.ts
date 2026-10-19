import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CalendarQuickLook from '../../app/components/calendar/CalendarQuickLook.vue'
import CalendarNotes from '../../app/components/calendar/CalendarNotes.vue'
import type { DistrictCalendar } from '../../shared/types/content'
import record from '../fixtures/districts/san-antonio-isd.json'
// @ts-ignore The production checker is a dependency-free Node module.
import { auditRecords } from '../../scripts/check-content-quality.mjs'

const calendar = record.schoolYears['2026-2027-third-future-schools'] as DistrictCalendar

describe('conditional last student day', () => {
  it('keeps the no-make-up condition visible in highlights and the school-year overview', () => {
    const quickLook = mount(CalendarQuickLook, { props: {
      dates: calendar.keyDates, lastDayConditional: calendar.lastDayConditional,
    } })
    expect(quickLook.text()).toContain('Last day without make-up days')
    quickLook.unmount()

    const notes = mount(CalendarNotes, {
      props: { district: record.district, calendar },
      global: { stubs: { CalendarPlanningNotice: true, CalendarYearStatistics: true } },
    })
    expect(notes.find('.calendar-notes-summary').text()).toContain('If no make-up days are needed')
    notes.unmount()
  })

  it('preserves the ordinary last-day label for unconditional calendars', () => {
    const quickLook = mount(CalendarQuickLook, { props: {
      dates: record.schoolYears['2026-2027'].keyDates,
    } })
    expect(quickLook.findAll('dt').at(-1)!.text()).toBe('Last day')
    quickLook.unmount()
  })

  it('rejects missing and unmarked last-day conditions', () => {
    const clone = structuredClone(record)
    const target = clone.schoolYears['2026-2027-third-future-schools'] as DistrictCalendar
    delete target.lastDayCondition
    expect(auditRecords([{ filename: 'san-antonio-isd.json', record: clone }]).some(
      (issue: { path: string; severity: string }) => issue.path.endsWith('.lastDayCondition') && issue.severity === 'error',
    )).toBe(true)
    target.lastDayCondition = 'If no make-up days are needed'
    target.lastDayConditional = false
    expect(auditRecords([{ filename: 'san-antonio-isd.json', record: clone }]).some(
      (issue: { code: string }) => issue.code === 'UNMARKED_LAST_DAY_CONDITION',
    )).toBe(true)
  })
})
