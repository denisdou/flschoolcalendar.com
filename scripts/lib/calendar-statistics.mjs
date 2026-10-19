import { hasEventType } from '../../shared/utils/eventTypes.mjs'

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/
// General-schedule statistics exclude regular-class pauses even when a scoped
// intervention program runs on the same date.
// Program calendars also index dates without their own sessions; this does not
// establish whether other programs or district offices operate on those dates.
const noStudentStatuses = new Set(['schools-closed', 'no-classes', 'no-students', 'no-regular-classes', 'program-not-scheduled'])
const ambiguousAttendanceStatuses = new Set(['conditional-attendance', 'varied-by-school', 'varied-by-grade', 'special-schedule', 'unknown'])
const breakEventTypes = new Set([
  'STUDENT_BREAK',
  'FALL_BREAK',
  'THANKSGIVING_BREAK',
  'WINTER_BREAK',
  'MIDWINTER_BREAK',
  'TRACK_BREAK',
  'SPRING_BREAK',
  'INTERSESSION',
])
const studentDayLabels = new Set([
  'school days',
  'regular school days',
  'student days',
  'instructional days',
  'instructional days listed',
  'approved-calendar instructional days',
  'student attendance days',
  'student-teacher contact days',
])

function parseDate(value) {
  if (!value || !isoDatePattern.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10)
}

function isWeekday(date) {
  return date.getUTCDay() !== 0 && date.getUTCDay() !== 6
}

function addDays(date, amount) {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + amount)
  return result
}

function calendarDays(start, end) {
  return Math.round((end.valueOf() - start.valueOf()) / 86400000) + 1
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

function formatRange(start, end) {
  if (toIsoDate(start) === toIsoDate(end)) return formatDate(start)
  return `${formatDate(start)}–${formatDate(end)}`
}

function addEventWeekdays(dates, event, firstDay, lastDay) {
  const cursor = parseDate(event.dateStart)
  const finish = parseDate(event.dateEnd || event.dateStart)
  if (!cursor || !finish || cursor > finish) return false

  while (cursor <= finish) {
    const value = toIsoDate(cursor)
    if (value >= firstDay && value <= lastDay && isWeekday(cursor)) dates.add(value)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return true
}

function addEventDates(dates, event, firstDay, lastDay) {
  const cursor = parseDate(event.dateStart)
  const finish = parseDate(event.dateEnd || event.dateStart)
  if (!cursor || !finish || cursor > finish) return false

  while (cursor <= finish) {
    const value = toIsoDate(cursor)
    if (value >= firstDay && value <= lastDay) dates.add(value)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return true
}

function analyzeCalendar(calendar) {
  const first = parseDate(calendar.firstDay)
  const last = parseDate(calendar.lastDay)
  if (!first || !last || first > last || calendar.status === 'draft') return null

  const eventsById = new Map((calendar.events || []).map(event => [event.id, event]))
  const noSchoolDates = new Set()
  const noSchoolEvents = []
  const confirmedNoSchoolDayEventIds = Array.isArray(calendar.confirmedNoSchoolDayEventIds)
    ? calendar.confirmedNoSchoolDayEventIds
    : (calendar.noSchoolDayEventIds || [])
  const usesSplitNoSchoolIds = Array.isArray(calendar.confirmedNoSchoolDayEventIds)
    && Array.isArray(calendar.conditionalNoSchoolDayEventIds)
  for (const eventId of confirmedNoSchoolDayEventIds) {
    const event = eventsById.get(eventId)
    if (!event || !noStudentStatuses.has(event.schoolStatus)) continue
    noSchoolEvents.push(event)
    if (!event.gradeScope) addEventWeekdays(noSchoolDates, event, calendar.firstDay, calendar.lastDay)
  }

  const additionalExcludedDates = new Set()
  const conditionalMakeupDates = new Set()
  const variableScheduleDates = new Set()
  const explicitAttendanceDates = new Set()
  // Source conflicts can leave attendance unresolved without a calendar event.
  // Do not silently treat an unlisted disputed date as a normal school day.
  let attendanceIsAmbiguous = (calendar.attendanceUncertaintyDates || []).some(value => (
    parseDate(value) && value >= calendar.firstDay && value <= calendar.lastDay
  ))
  for (const event of calendar.events || []) {
    if (event.isDateConfirmed === false) {
      if (ambiguousAttendanceStatuses.has(event.schoolStatus)) attendanceIsAmbiguous = true
      continue
    }
    const eventDates = new Set()
    if (!addEventDates(eventDates, event, calendar.firstDay, calendar.lastDay)) continue
    if (!eventDates.size) continue

    if (ambiguousAttendanceStatuses.has(event.schoolStatus)
      && event.countsAsStudentAttendanceDay === undefined
      && event.countsAsStudentAttendanceDayUnderPublishedSchedule === undefined) {
      attendanceIsAmbiguous = true
    }
    const excludedUnderPublishedSchedule = event.countsAsStudentAttendanceDay === false
      || event.countsAsStudentAttendanceDayUnderPublishedSchedule === false
    if (excludedUnderPublishedSchedule && !event.gradeScope) {
      addEventWeekdays(additionalExcludedDates, event, calendar.firstDay, calendar.lastDay)
      if (event.mayBecomeAttendanceDay === true
        || (event.mayBecomeAttendanceDay === undefined && event.schoolStatus === 'conditional-attendance')) {
        addEventWeekdays(conditionalMakeupDates, event, calendar.firstDay, calendar.lastDay)
      }
      else if (event.schoolStatus === 'varied-by-school' || event.schoolStatus === 'varied-by-grade') {
        addEventWeekdays(variableScheduleDates, event, calendar.firstDay, calendar.lastDay)
      }
    }
    if (event.countsAsStudentAttendanceDay === true
      || event.countsAsStudentAttendanceDayUnderPublishedSchedule === true
      || event.countsAsProgramAttendanceDate === true) {
      for (const value of eventDates) explicitAttendanceDates.add(value)
    }
  }
  for (const date of noSchoolDates) additionalExcludedDates.delete(date)

  let schoolWeekdaysInRange = 0
  for (let cursor = new Date(first); cursor <= last; cursor = addDays(cursor, 1)) {
    if (isWeekday(cursor)) schoolWeekdaysInRange += 1
  }

  return {
    first,
    last,
    eventsById,
    noSchoolEvents,
    noSchoolDates,
    additionalExcludedDates,
    conditionalMakeupDates,
    variableScheduleDates,
    explicitAttendanceDates,
    attendanceIsAmbiguous,
    usesSplitNoSchoolIds,
    schoolWeekdaysInRange,
  }
}

function buildNoSchoolStretches(analysis) {
  const stretches = []
  let current = null

  for (let cursor = new Date(analysis.first); cursor <= analysis.last; cursor = addDays(cursor, 1)) {
    const value = toIsoDate(cursor)
    const weekend = !isWeekday(cursor)
    const isOff = analysis.noSchoolDates.has(value)
      || (weekend && !analysis.explicitAttendanceDates.has(value))

    if (isOff) {
      if (!current) current = { start: new Date(cursor), end: new Date(cursor), schoolWeekdaysOff: 0 }
      current.end = new Date(cursor)
      if (analysis.noSchoolDates.has(value)) current.schoolWeekdaysOff += 1
    }
    else if (current) {
      if (current.schoolWeekdaysOff) stretches.push(current)
      current = null
    }
  }
  if (current?.schoolWeekdaysOff) stretches.push(current)

  return stretches.map(stretch => ({
    ...stretch,
    calendarDays: calendarDays(stretch.start, stretch.end),
  }))
}

function publishedStudentDayStatistic(calendar) {
  const highlights = calendar.highlights || []
  const highlight = highlights.find(item => (
    studentDayLabels.has(String(item.label || '').toLowerCase())
    && item.basis === 'official'
    && /^\d+/.test(String(item.value || '').trim())
  )) || highlights.find(item => (
    // A sum of published semester subtotals is derived, not a printed annual
    // total. Preserve that provenance rather than a conflicting grid estimate.
    (String(item.label || '').toLowerCase() === 'published instructional-day total'
      || (item.calculationMethod === 'sum-published-semester-days' && item.basis === 'derived'))
    && ['official', 'derived'].includes(item.basis)
    && /^\d+/.test(String(item.value || '').trim())
    && typeof item.note === 'string' && item.note.trim().length > 0
  ))
  if (!highlight) return null

  const normalizedLabel = String(highlight.label || '').toLowerCase()
  const isApprovedCalendarTotal = normalizedLabel === 'approved-calendar instructional days'
  const isListedInstructionalTotal = normalizedLabel === 'instructional days listed'
  const isContactDayTotal = normalizedLabel === 'student-teacher contact days'

  return {
    id: isContactDayTotal
      ? 'student-teacher-contact-days'
      : isListedInstructionalTotal
      ? 'instructional-days-listed'
      : isApprovedCalendarTotal
        ? 'approved-calendar-instructional-days'
        : 'student-attendance-days',
    label: isContactDayTotal
      ? 'Student-teacher contact days'
      : isListedInstructionalTotal
      ? 'Instructional days listed'
      : isApprovedCalendarTotal
        ? 'Approved-calendar instructional days'
        : 'Student attendance days',
    value: highlight.value,
    basis: highlight.basis,
    explanation: highlight.note,
  }
}

function calculatedStudentDayStatistic(calendar, analysis) {
  if (analysis.attendanceIsAmbiguous) return null

  const weekendAttendanceDays = [...analysis.explicitAttendanceDates]
    .filter(value => !isWeekday(parseDate(value))).length
  const count = analysis.schoolWeekdaysInRange
    + weekendAttendanceDays
    - analysis.noSchoolDates.size
    - analysis.additionalExcludedDates.size
  if (count < 1) return null

  const parts = [`${analysis.noSchoolDates.size} confirmed no-school weekdays`]
  if (analysis.additionalExcludedDates.size) {
    const otherExcludedWeekdays = analysis.additionalExcludedDates.size
      - analysis.conditionalMakeupDates.size
      - analysis.variableScheduleDates.size
    if (analysis.conditionalMakeupDates.size) {
      parts.push(`${analysis.conditionalMakeupDates.size} conditional make-up ${analysis.conditionalMakeupDates.size === 1 ? 'weekday' : 'weekdays'} currently listed without regular classes`)
    }
    if (analysis.variableScheduleDates.size) {
      parts.push(`${analysis.variableScheduleDates.size} variable-schedule ${analysis.variableScheduleDates.size === 1 ? 'weekday' : 'weekdays'} not counted as regular attendance days`)
    }
    if (otherExcludedWeekdays) {
      parts.push(`${otherExcludedWeekdays} weekdays not counted as regular attendance days`)
    }
  }
  if (weekendAttendanceDays) parts.push(`${weekendAttendanceDays} listed weekend attendance days`)

  return {
    id: 'student-attendance-days',
    label: 'Student attendance days',
    value: `${count} days`,
    basis: 'derived',
    explanation: `Calculated from ${analysis.schoolWeekdaysInRange} weekdays between the first and last student days, adjusting for ${parts.join(', ')}.${analysis.conditionalMakeupDates.size ? ' The scheduled attendance dates may change if the district activates a make-up day.' : ''}`,
  }
}

export function calculateCalendarStatistics(calendar) {
  const analysis = analyzeCalendar(calendar)
  if (!analysis) return []
  const usesConfirmedNonConditionalCount = calendar.noSchoolWeekdayStatisticMode === 'confirmed-non-conditional'
  const countsOnlySingleDateEvents = calendar.standaloneNoSchoolStatisticMode === 'single-date-events'
  const breakEvents = (calendar.events || []).filter(event => breakEventTypes.has(event.eventType))
  const allBreaksConditional = breakEvents.length > 0
    && breakEvents.every(event => event.mayBecomeAttendanceDay === true)
  const conditionalBreakExplanation = allBreaksConditional
    ? ' Break dates that may become make-up days are excluded from this fixed subset.'
    : ''

  const stretches = buildNoSchoolStretches(analysis)
  const longest = stretches.toSorted((left, right) => (
    right.calendarDays - left.calendarDays
    || right.schoolWeekdaysOff - left.schoolWeekdaysOff
    || left.start.valueOf() - right.start.valueOf()
  ))[0]

  const studentNoSchoolDates = new Set()
  const standaloneNoSchoolEvents = []
  for (const event of analysis.noSchoolEvents) {
    if (event.gradeScope) continue
    const isMultiDayEvent = event.dateEnd && event.dateEnd !== event.dateStart
    const isExcludedByMode = countsOnlySingleDateEvents
      ? isMultiDayEvent
      : hasEventType(event, 'HOLIDAY')
        || (breakEventTypes.has(event.eventType) && isMultiDayEvent)
    if (!isExcludedByMode) {
      standaloneNoSchoolEvents.push(event)
      addEventWeekdays(studentNoSchoolDates, event, calendar.firstDay, calendar.lastDay)
    }
  }
  const onlyEmergencyClosures = standaloneNoSchoolEvents.length > 0
    && standaloneNoSchoolEvents.every(event => event.eventType === 'EMERGENCY_CLOSURE')
  const onlyNonStudentDays = !countsOnlySingleDateEvents && standaloneNoSchoolEvents.length > 0
    && standaloneNoSchoolEvents.every(event => event.eventType === 'NON_STUDENT_DAY')

  const earlyReleaseDates = new Set()
  let hasScopedEarlyRelease = false
  for (const event of calendar.events || []) {
    if (!hasEventType(event, 'EARLY_RELEASE') && !hasEventType(event, 'HALF_DAY') && event.schoolStatus !== 'early-dismissal') continue
    addEventWeekdays(earlyReleaseDates, event, calendar.firstDay, calendar.lastDay)
    if (event.gradeScope || event.scheduleScope) hasScopedEarlyRelease = true
  }
  const shortenedEvents = (calendar.events || []).filter(event => (
    (hasEventType(event, 'EARLY_RELEASE') || hasEventType(event, 'HALF_DAY') || event.schoolStatus === 'early-dismissal')
    && event.dateStart >= calendar.firstDay && event.dateStart <= calendar.lastDay
  ))
  const onlyHalfDays = shortenedEvents.length > 0 && shortenedEvents.every(event => hasEventType(event, 'HALF_DAY'))
  const mandatoryHalfDays = onlyHalfDays && calendar.schoolHours?.halfDay?.mandatoryAttendance === true
  const halfDayHours = calendar.schoolHours?.halfDay
  function clockLabel(time) {
    if (time === '12:00') return 'noon'
    if (!/^\d{2}:\d{2}$/.test(time || '')) return null
    const [hour, minute] = time.split(':').map(Number)
    return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'a.m.' : 'p.m.'}`
  }
  const halfDayStart = clockLabel(halfDayHours?.start)
  const halfDayEnd = clockLabel(halfDayHours?.end)
  const halfDayExplanation = `Counted from ${mandatoryHalfDays ? 'mandatory ' : ''}half-day entries on this calendar. ${halfDayStart && halfDayEnd ? `Each runs ${halfDayStart}–${halfDayEnd} and still counts as a student attendance date.` : 'A half day still counts as a student attendance date.'}`

  const longWeekends = stretches.filter(stretch => (
    stretch.calendarDays >= 3 && stretch.schoolWeekdaysOff <= 2
  ))
  const fullWeekBreaks = stretches.filter(stretch => stretch.schoolWeekdaysOff >= 5)
  const studentDays = publishedStudentDayStatistic(calendar)
    || calculatedStudentDayStatistic(calendar, analysis)

  return [
    studentDays,
    {
      id: 'total-no-school-weekdays',
      label: usesConfirmedNonConditionalCount
        ? 'Confirmed non-conditional no-school weekdays'
        : 'Total no-school weekdays',
      value: `${analysis.noSchoolDates.size} ${analysis.noSchoolDates.size === 1 ? 'weekday' : 'weekdays'}`,
      basis: 'derived',
      explanation: (typeof calendar.noSchoolWeekdayStatisticExplanation === 'string'
        && calendar.noSchoolWeekdayStatisticExplanation.trim()) || (usesConfirmedNonConditionalCount
        ? 'Counted from confirmed no-class events between the first and last student days. Conditional make-up dates are excluded because they may become attendance days.'
        : 'Counted from published no-class events between the first and last student days. Weekends and shortened school days are excluded, and overlapping events count once.'),
    },
    {
      id: 'student-no-school-days',
      label: (typeof calendar.standaloneNoSchoolStatisticLabel === 'string'
        && calendar.standaloneNoSchoolStatisticLabel.trim()) || (onlyEmergencyClosures
        ? 'Emergency closure days'
        : analysis.usesSplitNoSchoolIds && analysis.conditionalMakeupDates.size
          ? 'Confirmed standalone no-school days'
          : 'Student no-school days'),
      value: `${studentNoSchoolDates.size} ${studentNoSchoolDates.size === 1 ? 'day' : 'days'}`,
      basis: 'derived',
      explanation: (typeof calendar.standaloneNoSchoolStatisticExplanation === 'string'
        && calendar.standaloneNoSchoolStatisticExplanation.trim()) || (studentNoSchoolDates.size
        ? onlyEmergencyClosures
          ? 'Counts districtwide emergency-closure weekdays outside the approved holidays and breaks. Overlapping entries count once.'
          : analysis.usesSplitNoSchoolIds && analysis.conditionalMakeupDates.size
            ? 'Counts single confirmed no-school weekdays that are not grouped into a multi-day break. Conditional make-up dates are excluded.'
            : onlyNonStudentDays
              ? 'Counts weekdays represented by NON_STUDENT_DAY events, including staff professional-learning and exchange days. Named holidays and official school breaks are excluded.'
              : 'Counts weekdays without regular classes outside holidays and multi-day breaks, including staff or planning days. Overlapping entries count once.'
        : 'The districtwide calendar does not list a weekday without regular classes outside holidays and multi-day breaks.'),
    },
    {
      id: mandatoryHalfDays ? 'mandatory-half-days' : onlyHalfDays ? 'half-days' : 'early-release-days',
      label: mandatoryHalfDays ? 'Mandatory half days' : onlyHalfDays ? 'Listed half-day dates' : 'Listed early-release dates',
      value: `${earlyReleaseDates.size} ${earlyReleaseDates.size === 1 ? 'date' : 'dates'}`,
      basis: 'derived',
      explanation: (typeof calendar.earlyReleaseStatisticExplanation === 'string'
        && calendar.earlyReleaseStatisticExplanation.trim()) || (onlyHalfDays
        ? halfDayExplanation
        : earlyReleaseDates.size
        ? hasScopedEarlyRelease
          ? 'Counted from official early-release entries; some dates apply only to the grades or campuses named in the calendar.'
          : calendar.excludedCampuses?.length
            ? 'Counted from early-release entries in this calendar. An early-release date still counts as a student attendance day.'
            : 'Counted from early-release entries on this calendar. An early-release date still counts as a student attendance day.'
        : calendar.excludedCampuses?.length
          ? 'No early-release date is listed in this calendar. Excluded campuses may use a different schedule.'
          : 'No districtwide early-release date is listed in this calendar. Individual campuses may publish additional schedule changes.'),
    },
    longest
      ? {
          id: 'longest-no-school-stretch',
          label: allBreaksConditional ? 'Longest fixed no-class stretch' : 'Longest listed break',
          value: `${longest.calendarDays} consecutive days`,
          basis: 'derived',
          explanation: `${formatRange(longest.start, longest.end)}, including weekends. The stretch contains ${longest.schoolWeekdaysOff} confirmed no-school ${longest.schoolWeekdaysOff === 1 ? 'weekday' : 'weekdays'}.${conditionalBreakExplanation}`,
        }
      : null,
    {
      id: 'long-weekends',
      label: allBreaksConditional ? 'Fixed long weekends' : 'Long weekends',
      value: `${longWeekends.length}`,
      basis: 'derived',
      explanation: 'Counts three- or four-day no-school stretches formed by a weekend plus one or two confirmed weekday closures. Longer school breaks are excluded.' + conditionalBreakExplanation,
    },
    {
      id: 'full-week-breaks',
      label: allBreaksConditional ? 'Fixed full-week breaks' : 'Full-week breaks',
      value: `${fullWeekBreaks.length} ${fullWeekBreaks.length === 1 ? 'break' : 'breaks'}`,
      basis: 'derived',
      explanation: 'Counts continuous no-school stretches containing at least five confirmed weekdays without regular classes. Adjacent holidays and weekends remain part of the same break.' + conditionalBreakExplanation,
    },
  ].filter(item => item
    && !/^0(?:\s|$)/.test(String(item.value).trim())
    && !(calendar.publishStandaloneNoSchoolStatistic === false && item.id === 'student-no-school-days'))
}
