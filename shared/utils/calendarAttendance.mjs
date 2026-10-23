import { hasEventType } from './eventTypes.mjs'

/** Separate known contingencies and unresolved exceptions from guaranteed closures. */
export function isConditionalAttendance(event) {
  return event.mayBecomeAttendanceDay === true || event.schoolStatus === 'conditional-attendance'
    || event.attendanceChangeEligibility === 'unconfirmed'
}

function isScheduledConditionalBreak(event) {
  return isConditionalAttendance(event)
    && event.scheduledAsNoSchool === true
    && ['no-classes', 'no-students'].includes(event.schoolStatus)
    && ['STUDENT_BREAK', 'FALL_BREAK', 'THANKSGIVING_BREAK', 'WINTER_BREAK', 'MIDWINTER_BREAK', 'SPRING_BREAK', 'TRACK_BREAK', 'INTERSESSION']
      .some(type => hasEventType(event, type))
}

// Preserve the known published baseline without asserting class-swap eligibility.
function hasUnconfirmedCourseArrangement(event) {
  return (event.attendanceChangeEligibility === 'unconfirmed' || event.schoolStatus === 'conditional-attendance')
    && event.scheduledAsNoSchool === true
    && event.mayBecomeAttendanceDay === undefined
}

export function conditionalAttendanceLabel(event) {
  if (event.attendanceContingencyStatus === 'historical') return event.schoolStatusLabel || 'Original make-up candidate'
  if (hasUnconfirmedCourseArrangement(event)) return event.schoolStatusLabel || 'No student classes on published calendar'
  if (event.schoolStatusLabel && /schedule may change|weather-dependent|conditional attendance|if needed|attendance subject to district confirmation|may become (?:a )?(?:school|attendance) day|possible (?:weather|hurricane) make-up/i.test(event.schoolStatusLabel)) {
    return event.schoolStatusLabel
  }
  if (isScheduledConditionalBreak(event)) return 'No school scheduled'
  return ['WEATHER_DAY', 'BAD_WEATHER_DAY', 'SNOW_DAY'].some(type => hasEventType(event, type))
    ? 'Weather-dependent'
    : 'If needed'
}

export function conditionalAttendanceDescription(event) {
  const label = conditionalAttendanceLabel(event)
  if (event.attendanceContingencyStatus === 'historical') return `${label}; historical make-up designation`
  if (hasUnconfirmedCourseArrangement(event)) return `${label}; course-specific arrangements unconfirmed`
  if (label === 'No school scheduled') return `${label}; attendance may change if this break is used for make-up instruction`
  return /may change|attendance subject to district confirmation|may become (?:a )?(?:school|attendance) day/i.test(label) ? label : `${label}; attendance may change`
}
