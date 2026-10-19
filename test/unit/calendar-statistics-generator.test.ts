import { describe, expect, it } from 'vitest'
// @ts-ignore The generator is a dependency-free Node module run outside the application bundle.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

function calendar(overrides: Record<string, unknown> = {}) {
  return {
    schoolYear: '2026-2027',
    status: 'official',
    firstDay: '2026-08-03',
    lastDay: '2026-08-07',
    highlights: [],
    events: [{
      id: 'staff-day',
      dateStart: '2026-08-07',
      dateEnd: null,
      eventType: 'NON_STUDENT_DAY',
      name: 'Staff Day',
      schoolStatus: 'no-students',
    }],
    noSchoolDayEventIds: ['staff-day'],
    ...overrides,
  }
}

describe('stored calendar statistics generator', () => {
  it('withholds calculated attendance for unresolved dates without inventing closure events', () => {
    const statistics = calculateCalendarStatistics(calendar({
      attendanceUncertaintyDates: ['2026-08-04'],
    }))

    expect(statistics.some((item: { id: string }) => item.id === 'student-attendance-days')).toBe(false)
    expect(statistics.find((item: { id: string }) => item.id === 'total-no-school-weekdays')?.value).toBe('1 weekday')
  })

  it('does not suppress attendance for dates outside the student year', () => {
    const statistics = calculateCalendarStatistics(calendar({
      attendanceUncertaintyDates: ['2026-08-10'],
    }))

    expect(statistics.find((item: { id: string }) => item.id === 'student-attendance-days')?.value).toBe('4 days')
  })

  it('creates explained family-facing statistics and omits zero values', () => {
    const statistics = calculateCalendarStatistics(calendar())

    expect(statistics).toHaveLength(4)
    expect(statistics.find((item: { id: string }) => item.id === 'student-attendance-days')).toMatchObject({
      value: '4 days',
      basis: 'derived',
    })
    expect(statistics.find((item: { id: string }) => item.id === 'total-no-school-weekdays')?.value).toBe('1 weekday')
    expect(statistics.some((item: { id: string }) => item.id === 'early-release-days')).toBe(false)
    expect(statistics.some((item: { id: string }) => item.id === 'long-weekends')).toBe(false)
    expect(statistics.every((item: { explanation: string }) => item.explanation.length > 20)).toBe(true)
  })

  it('uses an official student-day total when the calendar publishes one', () => {
    const statistics = calculateCalendarStatistics(calendar({
      highlights: [{
        label: 'Instructional days',
        value: '175 days',
        basis: 'official',
        note: 'The official calendar publishes a total of 175 instructional days.',
      }],
    }))

    expect(statistics[0]).toEqual({
      id: 'student-attendance-days',
      label: 'Student attendance days',
      value: '175 days',
      basis: 'official',
      explanation: 'The official calendar publishes a total of 175 instructional days.',
    })
  })

  it('preserves a calendar-specific standalone no-school label without changing any counts', () => {
    const plain = calculateCalendarStatistics(calendar())
    const renamed = calculateCalendarStatistics(calendar({
      standaloneNoSchoolStatisticLabel: ' Student holidays for staff learning/preparation ',
    }))
    expect(renamed.find((item: { id: string }) => item.id === 'student-no-school-days')).toMatchObject({
      label: 'Student holidays for staff learning/preparation', value: '1 day', basis: 'derived',
    })
    expect(renamed.map((item: { id: string; label: string }) => item.id === 'student-no-school-days' ? { ...item, label: 'Student no-school days' } : item)).toEqual(plain)
    expect(plain.find((item: { id: string }) => item.id === 'student-no-school-days')?.label).toBe('Student no-school days')
    expect(calculateCalendarStatistics(calendar({ standaloneNoSchoolStatisticLabel: '   ' }))).toEqual(plain)
    expect(calculateCalendarStatistics(calendar({ standaloneNoSchoolStatisticLabel: 3 }))).toEqual(plain)
  })

  it('keeps an approved-calendar total distinct from actual attendance dates after a closure', () => {
    const statistics = calculateCalendarStatistics(calendar({
      highlights: [{
        label: 'Approved-calendar instructional days',
        value: '173 days',
        basis: 'official',
        note: 'The approved calendar publishes 173 instructional days before later emergency schedule changes.',
      }],
    }))

    expect(statistics[0]).toEqual({
      id: 'approved-calendar-instructional-days',
      label: 'Approved-calendar instructional days',
      value: '173 days',
      basis: 'official',
      explanation: 'The approved calendar publishes 173 instructional days before later emergency schedule changes.',
    })
  })

  it('preserves an official instructional-day listing without relabeling it as attendance days', () => {
    const statistics = calculateCalendarStatistics(calendar({
      highlights: [{
        label: 'Instructional days listed',
        value: '175 days',
        basis: 'official',
        note: 'The official calendar lists 175 instructional days.',
      }],
    }))

    expect(statistics[0]).toEqual({
      id: 'instructional-days-listed',
      label: 'Instructional days listed',
      value: '175 days',
      basis: 'official',
      explanation: 'The official calendar lists 175 instructional days.',
    })
  })

  it('excludes an intersession marked outside regular attendance', () => {
    const statistics = calculateCalendarStatistics(calendar({
      events: [
        {
          id: 'staff-day',
          dateStart: '2026-08-07',
          dateEnd: null,
          eventType: 'NON_STUDENT_DAY',
          name: 'Staff Day',
          schoolStatus: 'no-students',
        },
        {
          id: 'intersession',
          dateStart: '2026-08-04',
          dateEnd: '2026-08-05',
          eventType: 'MODIFIED_DAY',
          name: 'Intersession',
          schoolStatus: 'modified-schedule',
          countsAsStudentAttendanceDay: false,
        },
      ],
    }))

    expect(statistics.find((item: { id: string }) => item.id === 'student-attendance-days')?.value).toBe('2 days')
  })

  it('preserves a derived sum of published semester figures instead of substituting a grid count', () => {
    const statistics = calculateCalendarStatistics(calendar({
      highlights: [{
        label: 'Published instructional-day total',
        value: '171 days',
        basis: 'derived',
        note: 'Calculated by adding the published semester totals of 82 and 89 days.',
      }],
    }))

    expect(statistics[0]).toMatchObject({ value: '171 days', basis: 'derived' })
    expect(statistics[0].explanation).toContain('82 and 89')
  })

  it('does not treat any unrelated derived highlight as a published attendance total', () => {
    const statistics = calculateCalendarStatistics(calendar({
      highlights: [{
        label: 'Instructional days',
        value: '171 days',
        basis: 'derived',
        note: 'An unrelated estimate, not published semester totals.',
      }],
    }))

    expect(statistics[0].value).toBe('4 days')
  })

  it('preserves an explicit semester sum independently of display wording and unresolved participation', () => {
    for (const label of ['Instructional days', 'Semester day total']) {
      const statistics = calculateCalendarStatistics(calendar({
        attendanceUncertaintyDates: ['2026-08-04'],
        highlights: [{
          label, value: '176 days', basis: 'derived',
          calculationMethod: 'sum-published-semester-days',
          note: 'Calculated as 82 first-semester days + 94 second-semester days = 176.',
        }],
      }))
      expect(statistics[0]).toMatchObject({id: 'student-attendance-days', value: '176 days', basis: 'derived'})
      expect(statistics[0].explanation).toContain('82 first-semester days + 94 second-semester days')
    }
  })

  it('excludes a conditional date only under the published schedule', () => {
    const statistics = calculateCalendarStatistics(calendar({
      events: [{
        id: 'make-up-day',
        dateStart: '2026-08-07',
        dateEnd: null,
        eventType: 'RESERVED_ATTENDANCE_DAY',
        name: 'Holiday / Bad Weather Make-Up Day',
        schoolStatus: 'conditional-attendance',
        countsAsStudentAttendanceDayUnderPublishedSchedule: false,
      }],
      noSchoolDayEventIds: [],
    }))

    expect(statistics[0].value).toBe('4 days')
    expect(statistics[0].explanation).toContain('attendance dates may change if the district activates')
  })

  it('stores a planned total when a conditional make-up date is explicitly excluded', () => {
    const statistics = calculateCalendarStatistics(calendar({
      events: [{
        id: 'make-up-day',
        dateStart: '2026-08-07',
        dateEnd: null,
        eventType: 'RESERVED_ATTENDANCE_DAY',
        name: 'Bad-Weather Make-up Day / Student Holiday',
        schoolStatus: 'conditional-attendance',
        countsAsStudentAttendanceDay: false,
      }],
      noSchoolDayEventIds: [],
    }))

    const studentDays = statistics.find((item: { id: string }) => item.id === 'student-attendance-days')
    expect(studentDays?.value).toBe('4 days')
    expect(studentDays?.explanation).toContain('conditional make-up weekday')
    expect(studentDays?.explanation).toContain('attendance dates may change if the district activates a make-up day')
  })

  it('counts confirmed single-date holidays while excluding multi-day no-school events when requested', () => {
    const statistics = calculateCalendarStatistics(calendar({
      firstDay: '2026-08-03',
      lastDay: '2026-08-14',
      standaloneNoSchoolStatisticMode: 'single-date-events',
      events: [
        {
          id: 'holiday',
          dateStart: '2026-08-03',
          dateEnd: null,
          eventType: 'HOLIDAY',
          name: 'Holiday',
          schoolStatus: 'schools-closed',
        },
        {
          id: 'staff-days',
          dateStart: '2026-08-06',
          dateEnd: '2026-08-07',
          eventType: 'NON_STUDENT_DAY',
          name: 'Staff Days',
          schoolStatus: 'no-students',
        },
        {
          id: 'single-day',
          dateStart: '2026-08-10',
          dateEnd: null,
          eventType: 'NON_STUDENT_DAY',
          name: 'No School',
          schoolStatus: 'no-students',
        },
      ],
      confirmedNoSchoolDayEventIds: ['holiday', 'staff-days', 'single-day'],
      conditionalNoSchoolDayEventIds: [],
    }))

    expect(statistics.find((item: { id: string }) => item.id === 'student-no-school-days')).toMatchObject({
      label: 'Student no-school days',
      value: '2 days',
    })
  })

})
