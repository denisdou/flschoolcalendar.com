import { describe, expect, it } from 'vitest'
import { conditionalAttendanceDescription, conditionalAttendanceLabel, isConditionalAttendance } from '../../shared/utils/calendarAttendance.mjs'
import type { CalendarEvent } from '../../shared/types/content'

const weather = {
  eventType: 'WEATHER_DAY', schoolStatus: 'no-classes', mayBecomeAttendanceDay: true,
} as CalendarEvent

describe('conditional attendance interpretation shared by UI and ICS', () => {
  it('retains explicit confirmation wording without adding a duplicate caveat', () => {
    const event = { ...weather, schoolStatusLabel: 'Reserved weather day — attendance subject to district confirmation.' }
    expect(isConditionalAttendance(event)).toBe(true)
    expect(conditionalAttendanceLabel(event)).toBe(event.schoolStatusLabel)
    expect(conditionalAttendanceDescription(event)).toBe(event.schoolStatusLabel)
  })

  it('does not trust an unconditional no-school label on a conditional weather date', () => {
    const event = { ...weather, schoolStatusLabel: 'No school' }
    expect(conditionalAttendanceDescription(event)).toBe('Weather-dependent; attendance may change')
  })

  it('preserves a scheduled holiday that may become a school day without duplicating the warning', () => {
    const event = { ...weather, schoolStatusLabel: 'Scheduled holiday; may become a school day' }
    expect(isConditionalAttendance(event)).toBe(true)
    expect(conditionalAttendanceLabel(event)).toBe(event.schoolStatusLabel)
    expect(conditionalAttendanceDescription(event)).toBe(event.schoolStatusLabel)
  })

  it('recognizes a secondary weather type and a conditional status without the flag', () => {
    const event = { ...weather, eventType: 'NON_STUDENT_DAY', eventTypes: ['WEATHER_DAY'], mayBecomeAttendanceDay: undefined, schoolStatus: 'conditional-attendance' } as CalendarEvent
    expect(isConditionalAttendance(event)).toBe(true)
    expect(conditionalAttendanceLabel(event)).toBe('Weather-dependent')
  })
})
