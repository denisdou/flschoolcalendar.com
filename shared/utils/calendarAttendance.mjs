import { hasEventType } from './eventTypes.mjs'

/** A planned closure may become an attendance day even with a no-classes baseline. */
export function isConditionalAttendance(event) {
  return event.mayBecomeAttendanceDay === true || event.schoolStatus === 'conditional-attendance'
}

export function conditionalAttendanceLabel(event) {
  if (event.schoolStatusLabel && /schedule may change|weather-dependent|conditional attendance|if needed|attendance subject to district confirmation|may become (?:a )?(?:school|attendance) day/i.test(event.schoolStatusLabel)) {
    return event.schoolStatusLabel
  }
  return ['WEATHER_DAY', 'BAD_WEATHER_DAY', 'SNOW_DAY'].some(type => hasEventType(event, type))
    ? 'Weather-dependent'
    : 'If needed'
}

export function conditionalAttendanceDescription(event) {
  const label = conditionalAttendanceLabel(event)
  return /may change|attendance subject to district confirmation|may become (?:a )?(?:school|attendance) day/i.test(label) ? label : `${label}; attendance may change`
}
