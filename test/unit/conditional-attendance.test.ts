import { describe, expect, it } from 'vitest'
import { conditionalAttendanceDescription, conditionalAttendanceLabel, isConditionalAttendance } from '../../shared/utils/calendarAttendance.mjs'
import type { CalendarEvent } from '../../shared/types/content'

const weather = {
  eventType: 'WEATHER_DAY', schoolStatus: 'no-classes', mayBecomeAttendanceDay: true,
} as CalendarEvent

describe('conditional attendance interpretation shared by UI and ICS', () => {
  it('distinguishes an unconfirmed course-exchange exception from confirmed eligibility without changing the published baseline', () => {
    const event = { eventType: 'NON_STUDENT_DAY', schoolStatus: 'no-classes', attendanceChangeEligibility: 'unconfirmed', scheduledAsNoSchool: true,
      countsAsStudentAttendanceDayUnderPublishedSchedule: false, schoolStatusLabel: 'No student classes on published calendar' } as CalendarEvent
    expect(isConditionalAttendance(event)).toBe(true)
    expect(conditionalAttendanceLabel(event)).toBe('No student classes on published calendar')
    expect(conditionalAttendanceDescription(event)).toBe('No student classes on published calendar; course-specific arrangements unconfirmed')
  })
  it('retains historical contingency provenance without implying future activation or changing the published baseline', () => {
    const event = { ...weather, attendanceContingencyStatus: 'historical', schoolStatusLabel: 'Student holiday announced' } as CalendarEvent
    expect(isConditionalAttendance(event)).toBe(true)
    expect(conditionalAttendanceLabel(event)).toBe('Student holiday announced')
    expect(conditionalAttendanceDescription(event)).toBe('Student holiday announced; historical make-up designation')
    expect(conditionalAttendanceDescription({ ...event, schoolStatusLabel: undefined })).toBe('Original make-up candidate; historical make-up designation')
  })
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

  it('keeps an explicit hurricane make-up label and attendance warning for a scheduled break', () => {
    const event = { ...weather, eventType: 'THANKSGIVING_BREAK', scheduledAsNoSchool: true,
      schoolStatusLabel: 'Scheduled Off · Possible Hurricane Make-up' } as CalendarEvent
    expect(conditionalAttendanceLabel(event)).toBe(event.schoolStatusLabel)
    expect(conditionalAttendanceDescription(event)).toBe('Scheduled Off · Possible Hurricane Make-up; attendance may change')
  })

  it.each(['FALL_BREAK', 'WINTER_BREAK', 'SPRING_BREAK'] as const)('shows a scheduled %s as currently off with a make-up caveat', (eventType) => {
    const event = { ...weather, eventType, scheduledAsNoSchool: true }
    expect(conditionalAttendanceLabel(event)).toBe('No school scheduled')
    expect(conditionalAttendanceDescription(event)).toBe('No school scheduled; attendance may change if this break is used for make-up instruction')
    expect(conditionalAttendanceLabel({ ...event, schoolStatusLabel: 'No school' })).toBe('No school scheduled')
    const explicit = { ...event, schoolStatusLabel: 'Scheduled holiday; may become a school day' }
    expect(conditionalAttendanceDescription(explicit)).toBe(explicit.schoolStatusLabel)
    expect(conditionalAttendanceLabel({ ...event, scheduledAsNoSchool: false })).toBe('If needed')
  })
})
