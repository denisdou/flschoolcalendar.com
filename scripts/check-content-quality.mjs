import { readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hasEventType } from '../shared/utils/eventTypes.mjs'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const recordsRoot = join(projectRoot, 'server', 'data', 'districts', 'records')
const districtBacklogPath = join(projectRoot, 'docs', 'fl-school-districts-top1000.md')
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/
const schoolYearPattern = /^(\d{4})-(\d{4})(?:-[a-z0-9-]+)?$/
const eventTypes = new Set([
  'FIRST_DAY', 'LAST_DAY', 'CALENDAR_START', 'CALENDAR_END',
  'HOLIDAY', 'UNCONFIRMED_HOLIDAY', 'STUDENT_BREAK', 'FALL_BREAK',
  'THANKSGIVING_BREAK', 'WINTER_BREAK', 'MIDWINTER_BREAK',
  'TRACK_BREAK', 'SPRING_BREAK', 'PARENT_CONFERENCE', 'TEACHER_CONFERENCE',
  'SUPERINTENDENT_DAY', 'STAFF_DEVELOPMENT', 'NON_STUDENT_DAY',
  'EARLY_RELEASE', 'HALF_DAY', 'LATE_START', 'MINIMUM_DAY', 'MODIFIED_DAY', 'INTERSESSION', 'INTERSESSION_CLASSES',
  'PROGRAM_EXTENDED_DAY', 'PROGRAM_ADSY_DAY', 'SUMMER_PROGRAM', 'ENRICHMENT_DAY',
  'EXAM', 'FINAL_EXAM', 'STATE_TEST', 'REGENTS', 'REMOTE_INSTRUCTION',
  'SEMESTER_START', 'SEMESTER_END', 'EMERGENCY_CLOSURE', 'SNOW_DAY', 'MAKEUP_DAY', 'WEATHER_DAY', 'BAD_WEATHER_DAY',
  'RESERVED_ATTENDANCE_DAY', 'CONDITIONAL_SCHOOL_DAY',
  'BACK_TO_SCHOOL_NIGHT', 'MEET_THE_TEACHER', 'PROGRESS_REPORT', 'REPORT_CARD',
  'GRADING_PERIOD_START', 'GRADING_PERIOD_END',
  'COLLEGE_TERM_START', 'COLLEGE_TERM_END', 'SCHOOL_MILESTONE',
])
const schoolStatuses = new Set([
  'schools-open', 'schools-closed', 'no-classes', 'no-regular-classes', 'early-dismissal', 'modified-schedule', 'special-schedule',
  'program-specific', 'program-not-scheduled', 'optional-attendance',
  'varied-by-school', 'varied-by-grade', 'remote-instruction', 'no-students',
  'staff-only', 'exam-day', 'not-applicable',
  'conditional-attendance', 'unknown',
])
const sourceTypes = new Set([
  'district-website', 'campus-website', 'official-webpage', 'calendar-page', 'official-pdf', 'board-document',
])
const nonStudentStatuses = new Set(['schools-closed', 'no-classes', 'no-students', 'no-regular-classes', 'program-not-scheduled'])
const genericFaqTokens = new Set([
  'a', 'an', 'and', 'are', 'at', 'be', 'calendar', 'does', 'for', 'has',
  'have', 'how', 'in', 'is', 'of', 'on', 'or', 'school', 'schools', 'the',
  'this', 'to', 'what', 'when', 'where', 'which', 'who', 'why', 'with',
])

function addIssue(issues, severity, code, path, message) {
  issues.push({ severity, code, path, message })
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function parseIsoDate(value) {
  if (!isoDatePattern.test(value || '')) return null
  const date = new Date(value + 'T00:00:00Z')
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date
}

function isHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  }
  catch {
    return false
  }
}

function countWords(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length
}

function countWeekdays(start, end) {
  const cursor = parseIsoDate(start)
  const finish = parseIsoDate(end)
  if (!cursor || !finish || cursor > finish) return null

  let count = 0
  while (cursor <= finish) {
    if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) count += 1
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return count
}

function countCalendarDays(start, end) {
  const cursor = parseIsoDate(start)
  const finish = parseIsoDate(end || start)
  if (!cursor || !finish || cursor > finish) return null
  return Math.round((finish - cursor) / 86400000) + 1
}

function normalizedTokens(value, record, calendar, { faq = false } = {}) {
  let text = String(value || '').toLowerCase()
  const removals = [
    record.district?.name,
    record.district?.shortName,
    record.district?.slug?.replaceAll('-', ' '),
    calendar.schoolYear,
    calendar.schoolYear?.replace('-', '–'),
  ].filter(Boolean).sort((a, b) => b.length - a.length)

  for (const removal of removals) {
    text = text.replaceAll(String(removal).toLowerCase(), ' ')
  }

  const tokens = text
    .replace(faq ? /$^/ : /\b(?:19|20)\d{2}\b/g, ' ')
    .replace(faq ? /$^/ : /\b\d{1,2}(?::\d{2})?\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  return faq ? tokens.filter(token => !genericFaqTokens.has(token)) : tokens
}

function shingles(tokens, size = 4) {
  if (tokens.length < size) return new Set(tokens.length ? [tokens.join(' ')] : [])
  return new Set(tokens.slice(0, tokens.length - size + 1).map((_, index) => (
    tokens.slice(index, index + size).join(' ')
  )))
}

function jaccard(left, right) {
  if (!left.size && !right.size) return 1
  let intersection = 0
  for (const item of left) if (right.has(item)) intersection += 1
  return intersection / (left.size + right.size - intersection)
}

function requireText(issues, value, path, label = path) {
  if (!isNonEmptyString(value)) {
    addIssue(issues, 'error', 'REQUIRED_TEXT', path, label + ' must not be empty.')
  }
}

function requireDate(issues, value, path) {
  if (!parseIsoDate(value)) {
    addIssue(issues, 'error', 'INVALID_DATE', path, 'Expected a real ISO date in YYYY-MM-DD format.')
    return null
  }
  return value
}

function validateDateRange(issues, item, path, { allowNullStart = false } = {}) {
  const start = allowNullStart && item?.dateStart === null
    ? null
    : requireDate(issues, item?.dateStart, path + '.dateStart')
  if (item?.dateEnd !== null && item?.dateEnd !== undefined) {
    if (item?.dateStart === null) {
      addIssue(issues, 'error', 'DATE_END_WITHOUT_START', path + '.dateEnd', 'dateEnd requires a confirmed dateStart.')
      return
    }
    const end = requireDate(issues, item.dateEnd, path + '.dateEnd')
    if (start && end && start > end) {
      addIssue(issues, 'error', 'REVERSED_DATE_RANGE', path, 'dateEnd occurs before dateStart.')
    }
  }
}

function validateSources(issues, record, calendar, path) {
  const sources = Array.isArray(calendar.sources) ? calendar.sources : []
  const sourceIds = new Set()
  const sourceUrls = new Set()

  if (calendar.indexable && sources.length === 0) {
    addIssue(issues, 'error', 'MISSING_SOURCE', path + '.sources', 'An indexable calendar must cite at least one official source.')
  }

  sources.forEach((source, index) => {
    const sourcePath = path + '.sources[' + index + ']'
    requireText(issues, source?.id, sourcePath + '.id')
    requireText(issues, source?.label, sourcePath + '.label')
    requireDate(issues, source?.retrievedAt, sourcePath + '.retrievedAt')
    if (!sourceTypes.has(source?.type)) {
      addIssue(issues, 'error', 'INVALID_SOURCE_TYPE', sourcePath + '.type', 'Unknown official source type.')
    }
    if (source?.printedBoardApprovalDate !== undefined) requireDate(issues, source.printedBoardApprovalDate, sourcePath + '.printedBoardApprovalDate')
    if (source?.printedRevisionDate !== undefined) requireDate(issues, source.printedRevisionDate, sourcePath + '.printedRevisionDate')
    if (!isHttpUrl(source?.url)) {
      addIssue(issues, 'error', 'INVALID_SOURCE_URL', sourcePath + '.url', 'Source URL must be an absolute HTTP(S) URL.')
    }
    if (sourceIds.has(source?.id)) {
      addIssue(issues, 'error', 'DUPLICATE_SOURCE_ID', sourcePath + '.id', 'Source IDs must be unique within a calendar.')
    }
    sourceIds.add(source?.id)
    sourceUrls.add(source?.url)
  })

  if (calendar.actions?.officialPdfUrl && !sourceUrls.has(calendar.actions.officialPdfUrl)) {
    addIssue(issues, 'warning', 'UNLISTED_OFFICIAL_PDF', path + '.actions.officialPdfUrl', 'The official PDF is not represented in sources[].')
  }

  if (calendar.actions?.officialCalendarUrl
    && calendar.actions.officialCalendarUrl !== record.calendarDiscovery?.calendarPageUrl
    && !sourceUrls.has(calendar.actions.officialCalendarUrl)) {
    addIssue(issues, 'warning', 'UNLISTED_CALENDAR_PAGE', path + '.actions.officialCalendarUrl', 'The official calendar page is not represented in calendarDiscovery or sources[].')
  }

  return sourceIds
}

function validateSchoolHours(issues, calendar, path) {
  if (!Array.isArray(calendar.schoolHours)) return
  calendar.schoolHours.forEach((row, index) => {
    const rowPath = path + '.schoolHours[' + index + ']'
    let start = null
    let end = null
    if (row?.effectiveFrom != null) start = requireDate(issues, row.effectiveFrom, rowPath + '.effectiveFrom')
    if (row?.effectiveThrough != null) end = requireDate(issues, row.effectiveThrough, rowPath + '.effectiveThrough')
    if (start && end && start > end) {
      addIssue(issues, 'error', 'REVERSED_SCHOOL_HOURS_RANGE', rowPath, 'effectiveThrough occurs before effectiveFrom.')
    }
  })
}

function validateSourceDiscrepancies(issues, calendar, sourceIds, path) {
  if (calendar.sourceDiscrepancies === undefined) return
  if (!Array.isArray(calendar.sourceDiscrepancies)) {
    addIssue(issues, 'error', 'INVALID_SOURCE_DISCREPANCIES', path + '.sourceDiscrepancies', 'sourceDiscrepancies must be an array when provided.')
    return
  }

  calendar.sourceDiscrepancies.forEach((item, index) => {
    const itemPath = path + '.sourceDiscrepancies[' + index + ']'
    requireText(issues, item?.field, itemPath + '.field')
    requireText(issues, item?.effect, itemPath + '.effect')
    if (!['unresolved', 'source-conflict'].includes(item?.resolution)) {
      addIssue(issues, 'error', 'INVALID_SOURCE_DISCREPANCY_RESOLUTION', itemPath + '.resolution', 'Source discrepancy resolution must be unresolved or source-conflict.')
    }
    if (!Array.isArray(item?.sourceIds) || item.sourceIds.length === 0) {
      addIssue(issues, 'error', 'MISSING_SOURCE_DISCREPANCY_IDS', itemPath + '.sourceIds', 'Source discrepancies must cite at least one source ID.')
    }
    else {
      for (const sourceId of item.sourceIds) {
        if (!sourceIds.has(sourceId)) {
          addIssue(issues, 'error', 'UNKNOWN_SOURCE_DISCREPANCY_ID', itemPath + '.sourceIds', 'Source discrepancy ID does not match sources[]: ' + sourceId)
        }
      }
    }
    for (const field of [
      'gridDate', 'captionDate', 'pdfPrintedDate', 'districtNewsDate',
      'officialPdfDate', 'officialWebpageDate', 'revisionMaterialsDate',
      'originalCalendarBoardApprovalDate',
    ]) {
      if (item?.[field] !== undefined) requireDate(issues, item[field], itemPath + '.' + field)
    }
  })
}

function validateEvents(issues, calendar, sourceIds, path) {
  const events = Array.isArray(calendar.events) ? calendar.events : []
  const ids = new Set()
  const signatures = new Set()
  const eventsById = new Map()

  if (calendar.indexable && events.length === 0) {
    addIssue(issues, 'error', 'MISSING_EVENTS', path + '.events', 'An indexable calendar must include student-facing events.')
  }

  events.forEach((event, index) => {
    const eventPath = path + '.events[' + index + ']'
    requireText(issues, event?.id, eventPath + '.id')
    requireText(issues, event?.name, eventPath + '.name')
    if (event?.displayName !== undefined) requireText(issues, event.displayName, eventPath + '.displayName')
    if (event?.displayNameBasis !== undefined && !['official', 'derived'].includes(event.displayNameBasis)) {
      addIssue(issues, 'error', 'INVALID_DISPLAY_NAME_BASIS', eventPath + '.displayNameBasis', 'displayNameBasis must be official or derived when provided.')
    }
    if (event?.displayNameSourceId && !sourceIds.has(event.displayNameSourceId)) {
      addIssue(issues, 'error', 'UNKNOWN_DISPLAY_NAME_SOURCE_ID', eventPath + '.displayNameSourceId', 'Event displayNameSourceId does not match sources[].')
    }
    if (event?.displayNameSourceId && !isNonEmptyString(event?.displayName)) {
      addIssue(issues, 'error', 'DISPLAY_NAME_SOURCE_WITHOUT_NAME', eventPath + '.displayNameSourceId', 'displayNameSourceId requires a displayName.')
    }
    if (event?.officialLabel !== undefined) requireText(issues, event.officialLabel, eventPath + '.officialLabel')
    if (event?.officialLabels !== undefined && (!Array.isArray(event.officialLabels)
      || event.officialLabels.length === 0
      || event.officialLabels.some(label => !isNonEmptyString(label))
      || new Set(event.officialLabels).size !== event.officialLabels.length)) {
      addIssue(issues, 'error', 'INVALID_OFFICIAL_LABELS', eventPath + '.officialLabels', 'officialLabels must contain unique, non-empty source labels.')
    }
    validateDateRange(issues, event, eventPath, {
      allowNullStart: event?.dateStart === null
        && event?.isDateConfirmed === false
        && event?.canonicalDate === null
        && event?.excludeFromIcs === true,
    })

    if (!eventTypes.has(event?.eventType)) {
      addIssue(issues, 'error', 'INVALID_EVENT_TYPE', eventPath + '.eventType', 'Unknown event type: ' + String(event?.eventType))
    }
    if (event?.status !== undefined && !['proposed', 'confirmed'].includes(event.status)) {
      addIssue(issues, 'error', 'INVALID_EVENT_STATUS', eventPath + '.status', 'Event status must be proposed or confirmed when provided.')
    }
    if (event?.isWindow === true && !parseIsoDate(event.dateEnd)) {
      addIssue(issues, 'error', 'MISSING_WINDOW_END_DATE', eventPath + '.dateEnd', 'A date window requires a valid end date.')
    }
    if (event?.isWindow === true && event?.schoolStatus === 'exam-day') {
      addIssue(issues, 'error', 'WINDOW_AS_EXAM_DAY', eventPath + '.schoolStatus', 'A date window must not imply an exam day on every date in the range.')
    }
    if (event?.eventTypeBasis !== undefined && !['official', 'derived'].includes(event.eventTypeBasis)) {
      addIssue(issues, 'error', 'INVALID_EVENT_TYPE_BASIS', eventPath + '.eventTypeBasis', 'eventTypeBasis must be official or derived when provided.')
    }
    if (event?.eventTypes !== undefined) {
      if (!Array.isArray(event.eventTypes)
        || event.eventTypes.length === 0
        || event.eventTypes.some(type => !eventTypes.has(type))
        || new Set(event.eventTypes).size !== event.eventTypes.length
        || !event.eventTypes.includes(event.eventType)) {
        addIssue(issues, 'error', 'INVALID_EVENT_TYPES', eventPath + '.eventTypes', 'eventTypes must contain unique supported classifications, including the primary eventType.')
      }
    }
    if (event?.eventTypesBasis !== undefined) {
      if (!isObject(event.eventTypesBasis)
        || Object.entries(event.eventTypesBasis).some(([type, basis]) => !hasEventType(event, type) || !['official', 'derived'].includes(basis))
        || [event.eventType, ...(Array.isArray(event.eventTypes) ? event.eventTypes : [])].some(type => !event.eventTypesBasis[type])) {
        addIssue(issues, 'error', 'INVALID_EVENT_TYPES_BASIS', eventPath + '.eventTypesBasis', 'Classification provenance must cover exactly the event classifications with official or derived values.')
      }
      else if (event.eventTypeBasis !== undefined && event.eventTypesBasis[event.eventType] !== event.eventTypeBasis) {
        addIssue(issues, 'error', 'CONFLICTING_EVENT_TYPE_BASIS', eventPath + '.eventTypesBasis', 'Primary classification provenance must match eventTypeBasis.')
      }
    }
    if (event?.uilEligibility !== undefined) {
      const milestone = event.uilEligibility
      if (!isObject(milestone)
        || !['cutoff', 'eligibility-change'].includes(milestone.kind)
        || !isNonEmptyString(milestone.gradeScope)
        || !sourceIds.has(milestone.sourceId)
        || !['official', 'derived'].includes(milestone.basis)
        || !hasEventType(event, 'SCHOOL_MILESTONE')) {
        addIssue(issues, 'error', 'INVALID_UIL_ELIGIBILITY', eventPath + '.uilEligibility', 'UIL metadata requires a supported kind, grade scope, source, provenance and SCHOOL_MILESTONE classification.')
      }
    }
    if (!schoolStatuses.has(event?.schoolStatus)) {
      addIssue(issues, 'error', 'INVALID_SCHOOL_STATUS', eventPath + '.schoolStatus', 'Unknown school status: ' + String(event?.schoolStatus))
    }
    if (event?.schoolStatusBasis !== undefined && !['official', 'derived'].includes(event.schoolStatusBasis)) {
      addIssue(issues, 'error', 'INVALID_SCHOOL_STATUS_BASIS', eventPath + '.schoolStatusBasis', 'schoolStatusBasis must be official or derived when provided.')
    }
    if (event?.schoolStatus === 'staff-only') {
      addIssue(issues, 'error', 'STAFF_ONLY_EVENT', eventPath, 'Staff-only events do not belong in the student calendar event list.')
    }
    if (!sourceIds.has(event?.sourceId)) {
      addIssue(issues, 'error', 'UNKNOWN_SOURCE_ID', eventPath + '.sourceId', 'Event sourceId does not match sources[].')
    }
    if (event?.nameSourceId && !sourceIds.has(event.nameSourceId)) {
      addIssue(issues, 'error', 'UNKNOWN_NAME_SOURCE_ID', eventPath + '.nameSourceId', 'Event nameSourceId does not match sources[].')
    }
    if (event?.nameBasis !== undefined && !['official', 'derived'].includes(event.nameBasis)) {
      addIssue(issues, 'error', 'INVALID_NAME_BASIS', eventPath + '.nameBasis', 'Event nameBasis must be official or derived when provided.')
    }
    if (event?.nameSourceIds !== undefined) {
      if (!Array.isArray(event.nameSourceIds) || event.nameSourceIds.length === 0) {
        addIssue(issues, 'error', 'INVALID_NAME_SOURCE_IDS', eventPath + '.nameSourceIds', 'Event nameSourceIds must be a non-empty array when provided.')
      }
      else {
        for (const nameSourceId of event.nameSourceIds) {
          if (!sourceIds.has(nameSourceId)) {
            addIssue(issues, 'error', 'UNKNOWN_NAME_SOURCE_ID', eventPath + '.nameSourceIds', 'Event nameSourceId does not match sources[]: ' + String(nameSourceId))
          }
        }
      }
    }
    if (event?.timeSourceId && !sourceIds.has(event.timeSourceId)) {
      addIssue(issues, 'error', 'UNKNOWN_TIME_SOURCE_ID', eventPath + '.timeSourceId', 'Event timeSourceId does not match sources[].')
    }
    if (event?.scheduleSourceId && !sourceIds.has(event.scheduleSourceId)) {
      addIssue(issues, 'error', 'UNKNOWN_SCHEDULE_SOURCE_ID', eventPath + '.scheduleSourceId', 'Event scheduleSourceId does not match sources[].')
    }
    if (event?.scheduleSourceIds !== undefined) {
      if (!Array.isArray(event.scheduleSourceIds) || event.scheduleSourceIds.length === 0) {
        addIssue(issues, 'error', 'INVALID_SCHEDULE_SOURCE_IDS', eventPath + '.scheduleSourceIds', 'Event scheduleSourceIds must be a non-empty array when provided.')
      }
      else {
        for (const scheduleSourceId of event.scheduleSourceIds) {
          if (!sourceIds.has(scheduleSourceId)) {
            addIssue(issues, 'error', 'UNKNOWN_SCHEDULE_SOURCE_ID', eventPath + '.scheduleSourceIds', 'Event scheduleSourceId does not match sources[]: ' + String(scheduleSourceId))
          }
        }
      }
    }
    if (event?.gradeScopeSourceId && !sourceIds.has(event.gradeScopeSourceId)) {
      addIssue(issues, 'error', 'UNKNOWN_GRADE_SCOPE_SOURCE_ID', eventPath + '.gradeScopeSourceId', 'Event gradeScopeSourceId does not match sources[].')
    }
    if (event?.gradeScopeSourceIds !== undefined) {
      if (!Array.isArray(event.gradeScopeSourceIds) || event.gradeScopeSourceIds.length === 0) {
        addIssue(issues, 'error', 'INVALID_GRADE_SCOPE_SOURCE_IDS', eventPath + '.gradeScopeSourceIds', 'Event gradeScopeSourceIds must be a non-empty array when provided.')
      }
      else {
        for (const gradeScopeSourceId of event.gradeScopeSourceIds) {
          if (!sourceIds.has(gradeScopeSourceId)) {
            addIssue(issues, 'error', 'UNKNOWN_GRADE_SCOPE_SOURCE_ID', eventPath + '.gradeScopeSourceIds', 'Event gradeScopeSourceId does not match sources[]: ' + String(gradeScopeSourceId))
          }
        }
      }
    }
    if (event?.participantScopeSourceId && !sourceIds.has(event.participantScopeSourceId)) {
      addIssue(issues, 'error', 'UNKNOWN_PARTICIPANT_SCOPE_SOURCE_ID', eventPath + '.participantScopeSourceId', 'Event participantScopeSourceId does not match sources[].')
    }
    if (event?.participantScopeSourceIds !== undefined) {
      if (!Array.isArray(event.participantScopeSourceIds) || event.participantScopeSourceIds.length === 0) {
        addIssue(issues, 'error', 'INVALID_PARTICIPANT_SCOPE_SOURCE_IDS', eventPath + '.participantScopeSourceIds', 'Event participantScopeSourceIds must be a non-empty array when provided.')
      }
      else {
        for (const participantScopeSourceId of event.participantScopeSourceIds) {
          if (!sourceIds.has(participantScopeSourceId)) {
            addIssue(issues, 'error', 'UNKNOWN_PARTICIPANT_SCOPE_SOURCE_ID', eventPath + '.participantScopeSourceIds', 'Event participantScopeSourceId does not match sources[]: ' + String(participantScopeSourceId))
          }
        }
      }
    }
    if (event?.programRelevantScopeSourceId && !sourceIds.has(event.programRelevantScopeSourceId)) {
      addIssue(issues, 'error', 'UNKNOWN_PROGRAM_SCOPE_SOURCE_ID', eventPath + '.programRelevantScopeSourceId', 'Event programRelevantScopeSourceId does not match sources[].')
    }
    if (event?.noteSourceIds !== undefined) {
      if (!Array.isArray(event.noteSourceIds) || event.noteSourceIds.length === 0) {
        addIssue(issues, 'error', 'INVALID_NOTE_SOURCE_IDS', eventPath + '.noteSourceIds', 'Event noteSourceIds must be a non-empty array when provided.')
      }
      else {
        for (const noteSourceId of event.noteSourceIds) {
          if (!sourceIds.has(noteSourceId)) {
            addIssue(issues, 'error', 'UNKNOWN_NOTE_SOURCE_ID', eventPath + '.noteSourceIds', 'Event noteSourceId does not match sources[]: ' + String(noteSourceId))
          }
        }
      }
    }
    if (event?.attendanceStatusBasisSourceId && !sourceIds.has(event.attendanceStatusBasisSourceId)) {
      addIssue(issues, 'error', 'UNKNOWN_ATTENDANCE_STATUS_BASIS_SOURCE_ID', eventPath + '.attendanceStatusBasisSourceId', 'Attendance-status basis sourceId does not match sources[].')
    }
    if (event?.sourceInternalConflict !== undefined && typeof event.sourceInternalConflict !== 'boolean') {
      addIssue(issues, 'error', 'INVALID_SOURCE_INTERNAL_CONFLICT', eventPath + '.sourceInternalConflict', 'sourceInternalConflict must be a boolean when provided.')
    }
    if (event?.sourceConflict !== undefined && typeof event.sourceConflict !== 'boolean') {
      addIssue(issues, 'error', 'INVALID_SOURCE_CONFLICT', eventPath + '.sourceConflict', 'sourceConflict must be a boolean when provided.')
    }
    if (event?.conflictSourceIds !== undefined) {
      if (!Array.isArray(event.conflictSourceIds) || event.conflictSourceIds.length === 0) {
        addIssue(issues, 'error', 'INVALID_CONFLICT_SOURCE_IDS', eventPath + '.conflictSourceIds', 'conflictSourceIds must be a non-empty array when provided.')
      }
      else {
        for (const conflictSourceId of event.conflictSourceIds) {
          if (!sourceIds.has(conflictSourceId)) {
            addIssue(issues, 'error', 'UNKNOWN_CONFLICT_SOURCE_ID', eventPath + '.conflictSourceIds', 'Conflict sourceId does not match sources[]: ' + conflictSourceId)
          }
        }
      }
      if (event.sourceConflict !== true) {
        addIssue(issues, 'error', 'ORPHAN_CONFLICT_SOURCE_IDS', eventPath + '.conflictSourceIds', 'conflictSourceIds requires sourceConflict=true.')
      }
    }
    if (event?.sourceConflict === true && (!Array.isArray(event.conflictSourceIds) || event.conflictSourceIds.length === 0)) {
      addIssue(issues, 'error', 'MISSING_CONFLICT_SOURCE_IDS', eventPath + '.sourceConflict', 'sourceConflict=true requires at least one conflictSourceId.')
    }
    if (event?.conflictField !== undefined) {
      requireText(issues, event.conflictField, eventPath + '.conflictField')
      if (event.sourceConflict !== true) {
        addIssue(issues, 'error', 'ORPHAN_CONFLICT_FIELD', eventPath + '.conflictField', 'conflictField requires sourceConflict=true.')
      }
    }
    if (event?.basis && !['official', 'derived'].includes(event.basis)) {
      addIssue(issues, 'error', 'INVALID_EVENT_BASIS', eventPath + '.basis', 'Event basis must be official or derived.')
    }
    if (event?.dateBasis && !['official', 'derived', 'source-conflict'].includes(event.dateBasis)) {
      addIssue(issues, 'error', 'INVALID_DATE_BASIS', eventPath + '.dateBasis', 'Date basis must be official, derived or source-conflict.')
    }
    if (event?.dateStartBasis && !['official', 'derived', 'grid-candidate'].includes(event.dateStartBasis)) {
      addIssue(issues, 'error', 'INVALID_DATE_START_BASIS', eventPath + '.dateStartBasis', 'dateStartBasis must be official, derived or grid-candidate.')
    }
    if (event?.canonicalDate !== undefined && event.canonicalDate !== null) {
      requireDate(issues, event.canonicalDate, eventPath + '.canonicalDate')
    }
    if (event?.candidateDates !== undefined) {
      if (!Array.isArray(event.candidateDates) || event.candidateDates.length < 2) {
        addIssue(issues, 'error', 'INVALID_CANDIDATE_DATES', eventPath + '.candidateDates', 'candidateDates must contain at least two source-labelled dates.')
      }
      else {
        const candidateDateValues = new Set()
        event.candidateDates.forEach((candidate, candidateIndex) => {
          const candidatePath = eventPath + '.candidateDates[' + candidateIndex + ']'
          requireDate(issues, candidate?.date, candidatePath + '.date')
          if (!['calendar-grid', 'fair-day-caption', 'official-pdf', 'official-webpage'].includes(candidate?.sourceRole)) {
            addIssue(issues, 'error', 'INVALID_CANDIDATE_DATE_SOURCE_ROLE', candidatePath + '.sourceRole', 'Unknown candidate-date source role.')
          }
          if (candidateDateValues.has(candidate?.date)) {
            addIssue(issues, 'error', 'DUPLICATE_CANDIDATE_DATE', candidatePath + '.date', 'Candidate dates must be unique.')
          }
          candidateDateValues.add(candidate?.date)
        })
      }
    }
    if (event?.dateStart === null
      && (event.isDateConfirmed !== false
        || event.excludeFromIcs !== true
        || event.canonicalDate !== null
        || event.dateBasis !== 'source-conflict'
        || event.sourceConflict !== true
        || !Array.isArray(event.candidateDates)
        || event.candidateDates.length < 2)) {
      addIssue(issues, 'error', 'UNSAFE_UNRESOLVED_EVENT', eventPath, 'An event without dateStart requires conflicting candidate dates, dateBasis=source-conflict, canonicalDate=null, sourceConflict=true, isDateConfirmed=false and exclusion from ICS.')
    }
    if (['CALENDAR_START', 'CALENDAR_END'].includes(event?.eventType) && event?.basis !== 'derived') {
      addIssue(issues, 'error', 'BOUNDARY_EVENT_NOT_DERIVED', eventPath, 'Calendar boundary events must use basis=derived.')
    }
    if (['FIRST_DAY', 'LAST_DAY'].includes(event?.eventType) && event?.basis === 'derived') {
      addIssue(issues, 'error', 'DERIVED_OFFICIAL_BOUNDARY_TYPE', eventPath, 'Derived boundaries must use CALENDAR_START or CALENDAR_END, not FIRST_DAY or LAST_DAY.')
    }
    if (event?.scheduleTypeSourceId && !sourceIds.has(event.scheduleTypeSourceId)) {
      addIssue(issues, 'error', 'UNKNOWN_SCHEDULE_SOURCE_ID', eventPath + '.scheduleTypeSourceId', 'Event scheduleTypeSourceId does not match sources[].')
    }
    if (event?.scheduleTypeSourceId && !event?.scheduleType) {
      addIssue(issues, 'error', 'ORPHAN_SCHEDULE_SOURCE_ID', eventPath + '.scheduleTypeSourceId', 'scheduleTypeSourceId requires scheduleType.')
    }
    if (event?.scheduleStatus != null && event.scheduleStatus !== 'regular') {
      addIssue(issues, 'error', 'INVALID_SCHEDULE_STATUS', eventPath + '.scheduleStatus', 'scheduleStatus must be regular or null.')
    }
    const hasScheduleSource = sourceIds.has(event?.scheduleSourceId)
      || (Array.isArray(event?.scheduleSourceIds) && event.scheduleSourceIds.length > 0 && event.scheduleSourceIds.every(id => sourceIds.has(id)))
    if (event?.scheduleStatus === 'regular' && (!isNonEmptyString(event.scheduleScope) || !hasScheduleSource)) {
      addIssue(issues, 'error', 'INCOMPLETE_REGULAR_SCHEDULE', eventPath + '.scheduleStatus', 'A regular schedule requires scheduleScope and official schedule evidence in scheduleSourceId or scheduleSourceIds.')
    }
    if (event?.schoolStatus === 'program-not-scheduled' && (!isNonEmptyString(event.scheduleScope) || !hasScheduleSource)) {
      addIssue(issues, 'error', 'INCOMPLETE_PROGRAM_GAP', eventPath, 'A program-not-scheduled entry requires a program scheduleScope and official schedule evidence.')
    }
    if (event?.scheduleScope && !event?.scheduleType && event?.scheduleStatus !== 'regular' && event?.schoolStatus !== 'program-not-scheduled') {
      addIssue(issues, 'error', 'ORPHAN_SCHEDULE_SCOPE', eventPath + '.scheduleScope', 'scheduleScope requires scheduleType, scheduleStatus=regular or a scoped program-not-scheduled entry.')
    }
    if (event?.programRelevantScope !== undefined && !isNonEmptyString(event.programRelevantScope)) {
      addIssue(issues, 'error', 'INVALID_PROGRAM_RELEVANT_SCOPE', eventPath + '.programRelevantScope', 'programRelevantScope must be non-empty text when provided.')
    }
    if (event?.gradeScopeBasis !== undefined) {
      if (!['official', 'derived'].includes(event.gradeScopeBasis)) {
        addIssue(issues, 'error', 'INVALID_GRADE_SCOPE_BASIS', eventPath + '.gradeScopeBasis', 'gradeScopeBasis must be official or derived when provided.')
      }
      if (!isNonEmptyString(event?.gradeScope)) {
        addIssue(issues, 'error', 'MISSING_GRADE_SCOPE', eventPath + '.gradeScope', 'gradeScopeBasis requires a corresponding gradeScope value.')
      }
    }
    if (event?.participantScope !== undefined && !isNonEmptyString(event.participantScope)) {
      addIssue(issues, 'error', 'INVALID_PARTICIPANT_SCOPE', eventPath + '.participantScope', 'participantScope must be non-empty text when provided.')
    }
    if (event?.participantScopeBasis !== undefined) {
      if (!['official', 'derived'].includes(event.participantScopeBasis)) {
        addIssue(issues, 'error', 'INVALID_PARTICIPANT_SCOPE_BASIS', eventPath + '.participantScopeBasis', 'participantScopeBasis must be official or derived when provided.')
      }
      if (!isNonEmptyString(event?.participantScope)) {
        addIssue(issues, 'error', 'MISSING_PARTICIPANT_SCOPE', eventPath + '.participantScope', 'participantScopeBasis requires a corresponding participantScope value.')
      }
    }
    if (event?.programRelevantScopeBasis !== undefined) {
      if (!['official', 'derived'].includes(event.programRelevantScopeBasis)) {
        addIssue(issues, 'error', 'INVALID_PROGRAM_RELEVANT_SCOPE_BASIS', eventPath + '.programRelevantScopeBasis', 'programRelevantScopeBasis must be official or derived when provided.')
      }
      if (!isNonEmptyString(event?.programRelevantScope)) {
        addIssue(issues, 'error', 'MISSING_PROGRAM_RELEVANT_SCOPE', eventPath + '.programRelevantScope', 'programRelevantScopeBasis requires a corresponding programRelevantScope value.')
      }
    }
    if (event?.scheduleDetails !== undefined) {
      if (!Array.isArray(event.scheduleDetails) || event.scheduleDetails.length === 0) {
        addIssue(issues, 'error', 'INVALID_SCHEDULE_DETAILS', eventPath + '.scheduleDetails', 'scheduleDetails must be a non-empty array.')
      }
      else {
        event.scheduleDetails.forEach((detail, detailIndex) => {
          const detailPath = eventPath + '.scheduleDetails[' + detailIndex + ']'
          requireText(issues, detail?.gradeScope, detailPath + '.gradeScope')
          if (detail?.scheduleType !== 'HALF_DAY') {
            addIssue(issues, 'error', 'INVALID_SCOPED_SCHEDULE_TYPE', detailPath + '.scheduleType', 'Unknown grade-scoped schedule type.')
          }
          if (!sourceIds.has(detail?.sourceId)) {
            addIssue(issues, 'error', 'UNKNOWN_SCHEDULE_SOURCE_ID', detailPath + '.sourceId', 'Grade-scoped schedule sourceId does not match sources[].')
          }
          if (!['official', 'derived'].includes(detail?.basis)) {
            addIssue(issues, 'error', 'INVALID_SCHEDULE_BASIS', detailPath + '.basis', 'Grade-scoped schedule basis must be official or derived.')
          }
        })
      }
    }
    if (event?.countsAsStudentAttendanceDay !== undefined
      && typeof event.countsAsStudentAttendanceDay !== 'boolean') {
      addIssue(issues, 'error', 'INVALID_ATTENDANCE_DAY_FLAG', eventPath + '.countsAsStudentAttendanceDay', 'countsAsStudentAttendanceDay must be a boolean when provided.')
    }
    if (event?.occursOnRegularInstructionalDay !== undefined
      && typeof event.occursOnRegularInstructionalDay !== 'boolean') {
      addIssue(issues, 'error', 'INVALID_REGULAR_INSTRUCTIONAL_DAY_FLAG', eventPath + '.occursOnRegularInstructionalDay', 'occursOnRegularInstructionalDay must be a boolean when provided.')
    }
    if (event?.occursOnRegularInstructionalDayBasis !== undefined) {
      if (!['official', 'derived'].includes(event.occursOnRegularInstructionalDayBasis)) {
        addIssue(issues, 'error', 'INVALID_REGULAR_INSTRUCTIONAL_DAY_BASIS', eventPath + '.occursOnRegularInstructionalDayBasis', 'occursOnRegularInstructionalDayBasis must be official or derived when provided.')
      }
      if (typeof event.occursOnRegularInstructionalDay !== 'boolean') {
        addIssue(issues, 'error', 'MISSING_REGULAR_INSTRUCTIONAL_DAY_FLAG', eventPath + '.occursOnRegularInstructionalDay', 'A regular-instructional-day basis requires a corresponding boolean value.')
      }
    }
    if (event?.countsAsRegularInstructionalDay !== undefined
      && typeof event.countsAsRegularInstructionalDay !== 'boolean') {
      addIssue(issues, 'error', 'INVALID_LEGACY_REGULAR_INSTRUCTIONAL_DAY_FLAG', eventPath + '.countsAsRegularInstructionalDay', 'countsAsRegularInstructionalDay must be a boolean when provided.')
    }
    if (event?.countsAsProgramAttendanceDate !== undefined
      && typeof event.countsAsProgramAttendanceDate !== 'boolean') {
      addIssue(issues, 'error', 'INVALID_PROGRAM_ATTENDANCE_DATE_FLAG', eventPath + '.countsAsProgramAttendanceDate', 'countsAsProgramAttendanceDate must be a boolean when provided.')
    }
    if (event?.countsAsStudentAttendanceDayUnderPublishedSchedule !== undefined
      && typeof event.countsAsStudentAttendanceDayUnderPublishedSchedule !== 'boolean') {
      addIssue(issues, 'error', 'INVALID_PUBLISHED_ATTENDANCE_DAY_FLAG', eventPath + '.countsAsStudentAttendanceDayUnderPublishedSchedule', 'countsAsStudentAttendanceDayUnderPublishedSchedule must be a boolean when provided.')
    }
    for (const field of ['scheduledAsNoSchool', 'mayBecomeAttendanceDay', 'isDateConfirmed', 'excludeFromIcs', 'isWindow', 'isFinalStudentDate']) {
      if (event?.[field] !== undefined && typeof event[field] !== 'boolean') {
        addIssue(issues, 'error', 'INVALID_EVENT_BOOLEAN', eventPath + '.' + field, field + ' must be a boolean when provided.')
      }
    }
    if (event?.finalStudentDateBasis !== undefined && !['official', 'derived'].includes(event.finalStudentDateBasis)) {
      addIssue(issues, 'error', 'INVALID_FINAL_STUDENT_DATE_BASIS', eventPath + '.finalStudentDateBasis', 'Final student date basis must be official or derived.')
    }
    if (event?.finalStudentDateBasis !== undefined && event.isFinalStudentDate !== true) {
      addIssue(issues, 'error', 'ORPHAN_FINAL_STUDENT_DATE_BASIS', eventPath + '.finalStudentDateBasis', 'Final student date provenance requires isFinalStudentDate=true.')
    }
    if (event?.finalStudentDateScope !== undefined
      && (event.finalStudentDateScope !== 'regular-year' || event.isFinalStudentDate !== true)) {
      addIssue(issues, 'error', 'INVALID_FINAL_STUDENT_DATE_SCOPE', eventPath + '.finalStudentDateScope', 'Explicit final-date scope must be regular-year and requires isFinalStudentDate=true.')
    }
    if (event?.isFinalStudentDate === true) {
      if (!['official', 'derived'].includes(event.finalStudentDateBasis)) {
        addIssue(issues, 'error', 'MISSING_FINAL_STUDENT_DATE_BASIS', eventPath, 'A final student date marker requires explicit provenance.')
      }
      if (!calendar.lastDay || event.dateStart !== calendar.lastDay || (event.dateEnd && event.dateEnd !== event.dateStart)
        || event.isDateConfirmed === false || !['schools-open', 'early-dismissal', 'modified-schedule'].includes(event.schoolStatus)
        || event.finalStudentDateBasis !== (calendar.lastDayBasis || 'official')) {
        addIssue(issues, 'error', 'INVALID_FINAL_STUDENT_DATE_MARKER', eventPath, 'Final student date must match the calendar endpoint and its provenance on a confirmed single attendance date.')
      }
      if (event.finalStudentDateBasis === 'derived' && hasEventType(event, 'LAST_DAY')) {
        addIssue(issues, 'error', 'DERIVED_FINAL_STUDENT_DATE_AS_OFFICIAL', eventPath, 'An inferred final student date must not be classified as an official LAST_DAY.')
      }
    }
    for (const [basisField, valueField] of [
      ['countsAsStudentAttendanceDayUnderPublishedScheduleBasis', 'countsAsStudentAttendanceDayUnderPublishedSchedule'],
      ['scheduledAsNoSchoolBasis', 'scheduledAsNoSchool'],
      ['mayBecomeAttendanceDayBasis', 'mayBecomeAttendanceDay'],
    ]) {
      if (event?.[basisField] !== undefined) {
        if (!['official', 'derived'].includes(event[basisField])) {
          addIssue(issues, 'error', 'INVALID_CONDITIONAL_STATUS_BASIS', eventPath + '.' + basisField, basisField + ' must be official or derived when provided.')
        }
        if (typeof event?.[valueField] !== 'boolean') {
          addIssue(issues, 'error', 'MISSING_CONDITIONAL_STATUS_FLAG', eventPath + '.' + valueField, basisField + ' requires a corresponding boolean value.')
        }
      }
    }
    if (event?.dateConflict !== undefined) {
      if (!isObject(event.dateConflict)) {
        addIssue(issues, 'error', 'INVALID_DATE_CONFLICT', eventPath + '.dateConflict', 'dateConflict must be an object.')
      }
      else {
        requireDate(issues, event.dateConflict.gridDate, eventPath + '.dateConflict.gridDate')
        requireDate(issues, event.dateConflict.captionDate, eventPath + '.dateConflict.captionDate')
        if (!['unresolved', 'resolved'].includes(event.dateConflict.resolution)) {
          addIssue(issues, 'error', 'INVALID_DATE_CONFLICT_RESOLUTION', eventPath + '.dateConflict.resolution', 'dateConflict resolution must be unresolved or resolved.')
        }
      }
    }
    if (event?.eventType === 'UNCONFIRMED_HOLIDAY') {
      if (event.isDateConfirmed !== false
        || event.excludeFromIcs !== true
        || event.dateConflict?.resolution !== 'unresolved'
        || event.schoolStatus !== 'unknown'
        || event.schoolStatusReason !== 'source-conflict'
        || event.basis !== 'official'
        || event.dateBasis !== 'source-conflict'
        || event.dateStartBasis !== 'grid-candidate'
        || event.canonicalDate !== null
        || !Array.isArray(event.candidateDates)
        || !event.candidateDates.some(candidate => candidate.date === event.dateConflict?.gridDate && candidate.sourceRole === 'calendar-grid')
        || !event.candidateDates.some(candidate => candidate.date === event.dateConflict?.captionDate && candidate.sourceRole === 'fair-day-caption')
        || event.dateStart !== event.dateConflict?.gridDate) {
        addIssue(issues, 'error', 'UNSAFE_UNCONFIRMED_HOLIDAY', eventPath, 'UNCONFIRMED_HOLIDAY requires an official event basis, conflicted date basis, null canonicalDate, labelled candidate dates, schoolStatus=unknown, isDateConfirmed=false and exclusion from ICS.')
      }
    }
    if (event?.schoolStatus === 'unknown'
      && !['source-conflict', 'source-does-not-state'].includes(event?.schoolStatusReason)) {
      addIssue(issues, 'error', 'UNKNOWN_STATUS_WITHOUT_REASON', eventPath + '.schoolStatusReason', 'schoolStatus=unknown requires a source-conflict or source-does-not-state reason.')
    }
    if (event?.scheduledAsNoSchool === true && event?.countsAsStudentAttendanceDayUnderPublishedSchedule !== false) {
      addIssue(issues, 'error', 'INCONSISTENT_CONDITIONAL_NO_SCHOOL', eventPath, 'scheduledAsNoSchool=true requires countsAsStudentAttendanceDayUnderPublishedSchedule=false.')
    }
    if (event?.mayBecomeAttendanceDay === true
      && event?.schoolStatus !== 'conditional-attendance'
      && !nonStudentStatuses.has(event?.schoolStatus)) {
      addIssue(issues, 'error', 'INVALID_CONDITIONAL_ATTENDANCE_STATUS', eventPath + '.schoolStatus', 'mayBecomeAttendanceDay=true requires either a conditional-attendance status or a current no-school status.')
    }
    if (ids.has(event?.id)) {
      addIssue(issues, 'error', 'DUPLICATE_EVENT_ID', eventPath + '.id', 'Event IDs must be unique within a calendar.')
    }

    const signature = [event?.dateStart, event?.dateEnd, event?.eventType, event?.name, event?.gradeScope, event?.participantScope, event?.scheduleScope].join('|').toLowerCase()
    if (signatures.has(signature)) {
      addIssue(issues, 'error', 'DUPLICATE_EVENT', eventPath, 'An identical event already exists in this calendar.')
    }

    ids.add(event?.id)
    signatures.add(signature)
    eventsById.set(event?.id, event)
  })

  events.forEach((event, index) => {
    if (event.coveredByBreakEventId === undefined) return
    const parent = eventsById.get(event.coveredByBreakEventId)
    if (!parent || parent.id === event.id || parent.coveredByBreakEventId
      || !String(parent.eventType).endsWith('_BREAK')
      || !nonStudentStatuses.has(parent.schoolStatus) || !nonStudentStatuses.has(event.schoolStatus)
      || !parent.dateStart || !event.dateStart
      || parent.dateStart > event.dateStart
      || (parent.dateEnd || parent.dateStart) < (event.dateEnd || event.dateStart)) {
      addIssue(issues, 'error', 'INVALID_COVERED_BREAK_EVENT', path + '.events[' + index + '].coveredByBreakEventId', 'A supplemental occurrence must reference an enclosing confirmed no-school break in the same calendar.')
    }
  })

  const firstDayType = calendar.firstDayBasis === 'derived' ? 'CALENDAR_START' : 'FIRST_DAY'
  const lastDayType = calendar.lastDayBasis === 'derived' ? 'CALENDAR_END' : 'LAST_DAY'
  const firstDays = events.filter(event => hasEventType(event, firstDayType))
  const lastDays = events.filter(event => hasEventType(event, lastDayType)
    || (event.isFinalStudentDate === true && event.finalStudentDateBasis === (calendar.lastDayBasis || 'official')))
  if (calendar.firstDay && !firstDays.some(event => event.dateStart === calendar.firstDay)) {
    addIssue(issues, 'error', 'FIRST_DAY_MISMATCH', path + '.firstDay', 'firstDay must match a ' + firstDayType + ' event.')
  }
  if (calendar.lastDay && !lastDays.some(event => event.dateStart === calendar.lastDay)) {
    addIssue(issues, 'error', 'LAST_DAY_MISMATCH', path + '.lastDay', 'lastDay must match a ' + lastDayType + ' event or an explicitly sourced final student date marker.')
  }

  const usesSplitNoSchoolIds = calendar.confirmedNoSchoolDayEventIds !== undefined
    || calendar.conditionalNoSchoolDayEventIds !== undefined
  if (usesSplitNoSchoolIds && calendar.noSchoolDayEventIds !== undefined) {
    addIssue(issues, 'error', 'MIXED_NO_SCHOOL_DAY_SCHEMAS', path, 'Use either noSchoolDayEventIds or the confirmed/conditional split, not both.')
  }
  if (usesSplitNoSchoolIds
    && (!Array.isArray(calendar.confirmedNoSchoolDayEventIds)
      || !Array.isArray(calendar.conditionalNoSchoolDayEventIds))) {
    addIssue(issues, 'error', 'INCOMPLETE_NO_SCHOOL_DAY_SPLIT', path, 'The split schema requires both confirmedNoSchoolDayEventIds and conditionalNoSchoolDayEventIds arrays.')
  }
  if (!usesSplitNoSchoolIds && !Array.isArray(calendar.noSchoolDayEventIds)) {
    addIssue(issues, 'error', 'INVALID_NO_SCHOOL_DAY_IDS', path + '.noSchoolDayEventIds', 'Provide noSchoolDayEventIds or the confirmed/conditional no-school ID arrays.')
  }

  const confirmedNoSchoolDayEventIds = usesSplitNoSchoolIds
    ? (Array.isArray(calendar.confirmedNoSchoolDayEventIds) ? calendar.confirmedNoSchoolDayEventIds : [])
    : (Array.isArray(calendar.noSchoolDayEventIds) ? calendar.noSchoolDayEventIds : [])
  const conditionalNoSchoolDayEventIds = usesSplitNoSchoolIds && Array.isArray(calendar.conditionalNoSchoolDayEventIds)
    ? calendar.conditionalNoSchoolDayEventIds
    : []
  const confirmedNoSchoolIds = new Set()
  const conditionalNoSchoolIds = new Set()

  confirmedNoSchoolDayEventIds.forEach((eventId, index) => {
    const field = usesSplitNoSchoolIds ? 'confirmedNoSchoolDayEventIds' : 'noSchoolDayEventIds'
    const eventPath = path + '.' + field + '[' + index + ']'
    requireText(issues, eventId, eventPath)
    if (confirmedNoSchoolIds.has(eventId)) {
      addIssue(issues, 'error', 'DUPLICATE_NO_SCHOOL_DAY_ID', eventPath, field + ' must contain unique event IDs.')
    }
    confirmedNoSchoolIds.add(eventId)

    const canonical = eventsById.get(eventId)
    if (!canonical) {
      addIssue(issues, 'error', 'ORPHAN_NO_SCHOOL_DAY_ID', eventPath, 'Every confirmed no-school ID must reference an event in events[].')
    }
    else if (!nonStudentStatuses.has(canonical.schoolStatus)) {
      addIssue(issues, 'error', 'INVALID_NO_SCHOOL_DAY_STATUS', eventPath, eventId + ' does not use a no-class or no-student school status.')
    }
    else if (usesSplitNoSchoolIds && canonical.mayBecomeAttendanceDay === true) {
      addIssue(issues, 'error', 'CONDITIONAL_EVENT_IN_CONFIRMED_LIST', eventPath, eventId + ' may become an attendance day and belongs in conditionalNoSchoolDayEventIds.')
    }
  })

  conditionalNoSchoolDayEventIds.forEach((eventId, index) => {
    const eventPath = path + '.conditionalNoSchoolDayEventIds[' + index + ']'
    requireText(issues, eventId, eventPath)
    if (conditionalNoSchoolIds.has(eventId)) {
      addIssue(issues, 'error', 'DUPLICATE_CONDITIONAL_NO_SCHOOL_DAY_ID', eventPath, 'conditionalNoSchoolDayEventIds must contain unique event IDs.')
    }
    if (confirmedNoSchoolIds.has(eventId)) {
      addIssue(issues, 'error', 'OVERLAPPING_NO_SCHOOL_DAY_ID', eventPath, eventId + ' cannot appear in both confirmed and conditional no-school lists.')
    }
    conditionalNoSchoolIds.add(eventId)

    const canonical = eventsById.get(eventId)
    if (!canonical) {
      addIssue(issues, 'error', 'ORPHAN_CONDITIONAL_NO_SCHOOL_DAY_ID', eventPath, 'Every conditional no-school ID must reference an event in events[].')
    }
    else if (!(nonStudentStatuses.has(canonical.schoolStatus) || canonical.schoolStatus === 'conditional-attendance')
      || canonical.scheduledAsNoSchool !== true
      || canonical.mayBecomeAttendanceDay !== true
      || canonical.countsAsStudentAttendanceDayUnderPublishedSchedule !== false) {
      addIssue(issues, 'error', 'INVALID_CONDITIONAL_NO_SCHOOL_EVENT', eventPath, eventId + ' must be currently scheduled as no school while retaining a possible attendance-day activation.')
    }
  })

  for (const event of events) {
    const expectedIds = event.mayBecomeAttendanceDay === true && usesSplitNoSchoolIds
      ? conditionalNoSchoolIds
      : confirmedNoSchoolIds
    if (nonStudentStatuses.has(event.schoolStatus)
      && !['REPORT_CARD', 'PROGRESS_REPORT'].includes(event.eventType)
      && !expectedIds.has(event.id)
      && !(event.mayBecomeAttendanceDay === true && !usesSplitNoSchoolIds)) {
      const targetField = event.mayBecomeAttendanceDay === true
        ? 'conditionalNoSchoolDayEventIds'
        : (usesSplitNoSchoolIds ? 'confirmedNoSchoolDayEventIds' : 'noSchoolDayEventIds')
      addIssue(issues, 'warning', 'MISSING_NO_SCHOOL_DAY_ID', path + '.events', event.id + ' has no classes or students but is absent from ' + targetField + '[].')
    }
  }
}

function validateFaqs(issues, record, calendar, path) {
  const faqs = Array.isArray(calendar.faqs) ? calendar.faqs : []
  if (calendar.indexable && faqs.length < 5) {
    addIssue(issues, 'error', 'TOO_FEW_FAQS', path + '.faqs', 'An indexable calendar must answer at least five independent parent questions.')
  }

  const seen = new Map()
  const tokenSets = []
  faqs.forEach((faq, index) => {
    const faqPath = path + '.faqs[' + index + ']'
    requireText(issues, faq?.question, faqPath + '.question')
    requireText(issues, faq?.answer, faqPath + '.answer')

    const answerWordCount = countWords(faq?.answer)
    if (answerWordCount < 8) {
      addIssue(issues, 'error', 'THIN_FAQ_ANSWER', faqPath + '.answer', 'FAQ answer has only ' + answerWordCount + ' words; add source-backed context instead of returning a bare date or number.')
    }
    else if (answerWordCount < 10) {
      addIssue(issues, 'warning', 'SHORT_FAQ_ANSWER', faqPath + '.answer', 'FAQ answer has only ' + answerWordCount + ' words; confirm that it provides enough context for the parent question.')
    }

    const normalized = normalizedTokens(faq?.question, record, calendar, { faq: true }).join(' ')
    if (seen.has(normalized)) {
      addIssue(issues, 'error', 'DUPLICATE_FAQ', faqPath + '.question', 'Duplicates ' + path + '.faqs[' + seen.get(normalized) + '].question after removing district/year boilerplate.')
    }
    else if (normalized) {
      seen.set(normalized, index)
    }
    tokenSets.push(new Set(normalized.split(' ').filter(Boolean)))
  })

  for (let left = 0; left < tokenSets.length; left += 1) {
    for (let right = left + 1; right < tokenSets.length; right += 1) {
      if (tokenSets[left].size < 3 || tokenSets[right].size < 3) continue
      const score = jaccard(tokenSets[left], tokenSets[right])
      if (score >= 0.78) {
        addIssue(issues, 'warning', 'SIMILAR_FAQ_INTENT', path + '.faqs[' + right + '].question', 'May overlap FAQ #' + (left + 1) + ' (' + Math.round(score * 100) + '% token similarity).')
      }
    }
  }
}

function validateAbout(issues, calendar, path) {
  const about = calendar.about
  for (const field of ['dataSource', 'processing', 'updates', 'disclaimer']) {
    requireText(issues, about?.[field], path + '.about.' + field)
  }

  const wordCount = countWords(Object.values(about || {}).join(' '))
  if (calendar.indexable && wordCount < 70) {
    addIssue(issues, 'warning', 'THIN_SOURCE_CONTEXT', path + '.about', 'Source and scope copy has only ' + wordCount + ' words; explain the actual source, processing rules, update path, and page limitations.')
  }
}

function validateEditorial(issues, calendar, path) {
  const summary = calendar.editorialSummary
  requireText(issues, summary?.heading, path + '.editorialSummary.heading')

  const paragraphs = Array.isArray(summary?.paragraphs) ? summary.paragraphs : []
  const highlights = Array.isArray(summary?.highlights) ? summary.highlights : []
  if (paragraphs.length < 2) {
    addIssue(issues, 'error', 'TOO_FEW_EDITORIAL_PARAGRAPHS', path + '.editorialSummary.paragraphs', 'Use at least two district- and year-specific paragraphs.')
  }
  paragraphs.forEach((paragraph, index) => requireText(issues, paragraph, path + '.editorialSummary.paragraphs[' + index + ']'))

  const wordCount = countWords(paragraphs.join(' '))
  if (calendar.indexable && wordCount < 90) {
    addIssue(issues, 'warning', 'THIN_EDITORIAL_SUMMARY', path + '.editorialSummary.paragraphs', 'Editorial summary has ' + wordCount + ' words; verify that it explains the district-specific calendar rather than only listing dates.')
  }
  if (highlights.length < 3) {
    addIssue(issues, 'warning', 'TOO_FEW_EDITORIAL_HIGHLIGHTS', path + '.editorialSummary.highlights', 'Include at least three source-backed planning highlights.')
  }
  if (paragraphs.some(paragraph => /write (?:two|three|a)|reusable district-name|exact dates/i.test(paragraph))) {
    addIssue(issues, 'error', 'TEMPLATE_INSTRUCTION_PUBLISHED', path + '.editorialSummary.paragraphs', 'Template instructions must not be published as page content.')
  }
}

function validateHighlights(issues, calendar, path) {
  const studentDayLabels = new Set([
    'school days',
    'student days',
    'instructional days',
    'instructional days listed',
    'approved-calendar instructional days',
    'student attendance days',
    'student-teacher contact days',
  ])
  const provenanceStatisticLabels = new Set([
    ...studentDayLabels,
    'fall semester',
    'spring semester',
  ])
  const eventCountStatistics = new Map([
    ['late-start dates', {
      eventType: 'LATE_START',
      count: events => events.reduce((total, event) => total + (countCalendarDays(event.dateStart, event.dateEnd) || 0), 0),
    }],
    ['finals periods', {
      eventType: 'FINAL_EXAM',
      count: events => events.length,
    }],
  ])

  for (const [index, item] of (calendar.highlights || []).entries()) {
    const itemPath = path + '.highlights[' + index + ']'
    requireText(issues, item?.label, itemPath + '.label')
    requireText(issues, item?.value, itemPath + '.value')
    if (provenanceStatisticLabels.has(String(item?.label || '').toLowerCase())) {
      if (!['official', 'derived'].includes(item?.basis)) {
        addIssue(issues, 'error', 'MISSING_STATISTIC_BASIS', itemPath + '.basis', 'School-year statistics must identify whether the figure is official or derived.')
      }
      if (!isNonEmptyString(item?.note)) {
        addIssue(issues, 'error', 'MISSING_STATISTIC_METHOD', itemPath + '.note', 'School-year statistics must explain where the official figure appears or how the derived figure was calculated.')
      }
    }

    const countRule = eventCountStatistics.get(String(item?.label || '').toLowerCase())
    if (countRule) {
      const displayedCount = Number.parseInt(String(item?.value || ''), 10)
      const matchingEvents = (calendar.events || []).filter(event => event.eventType === countRule.eventType)
      const derivedCount = countRule.count(matchingEvents)
      if (!Number.isInteger(displayedCount) || displayedCount !== derivedCount) {
        addIssue(issues, 'error', 'EVENT_COUNT_MISMATCH', itemPath + '.value', 'Displayed count is ' + String(item?.value) + ', while events[] derives ' + derivedCount + ' ' + countRule.eventType + ' entries or dates.')
      }
    }
  }
}

function validateStatistics(issues, calendar, path) {
  const statistics = Array.isArray(calendar.statistics) ? calendar.statistics : []
  const ids = new Set()

  if (calendar.indexable && !Array.isArray(calendar.statistics)) {
    addIssue(issues, 'error', 'MISSING_STORED_STATISTICS', path + '.statistics', 'Indexable calendars must store their generated school-year statistics in JSON.')
  }
  if (statistics.length > 7) {
    addIssue(issues, 'error', 'TOO_MANY_STATISTICS', path + '.statistics', 'School year by the numbers supports at most seven family-facing statistics.')
  }

  statistics.forEach((item, index) => {
    const itemPath = path + '.statistics[' + index + ']'
    requireText(issues, item?.id, itemPath + '.id')
    requireText(issues, item?.label, itemPath + '.label')
    requireText(issues, item?.value, itemPath + '.value')
    requireText(issues, item?.explanation, itemPath + '.explanation')
    if (!['official', 'derived'].includes(item?.basis)) {
      addIssue(issues, 'error', 'INVALID_STORED_STATISTIC_BASIS', itemPath + '.basis', 'Stored statistics must identify the figure as official or derived.')
    }
    if (ids.has(item?.id)) {
      addIssue(issues, 'error', 'DUPLICATE_STATISTIC_ID', itemPath + '.id', 'Statistic IDs must be unique within a calendar.')
    }
    ids.add(item?.id)
  })
}

function validateCalendar(issues, record, schoolYearKey, calendar, filePath) {
  const path = filePath + '.schoolYears.' + schoolYearKey
  const match = schoolYearPattern.exec(schoolYearKey)
  if (!match) {
    addIssue(issues, 'error', 'INVALID_SCHOOL_YEAR_KEY', path, 'School-year key must start with YYYY-YYYY.')
  }
  else if (Number(match[2]) !== Number(match[1]) + 1) {
    addIssue(issues, 'error', 'INVALID_SCHOOL_YEAR_RANGE', path, 'School-year end year must follow the start year.')
  }

  const expectedRouteSlug = calendar?.routeSlug || calendar?.schoolYear
  if (expectedRouteSlug !== schoolYearKey) {
    addIssue(issues, 'error', 'SCHOOL_YEAR_MISMATCH', path + '.schoolYear', 'The object key must match routeSlug, or schoolYear when routeSlug is absent.')
  }
  if (calendar?.indexable && calendar?.status === 'draft') {
    addIssue(issues, 'error', 'INDEXABLE_DRAFT', path + '.indexable', 'Draft calendars cannot be indexable.')
  }

  const firstDay = requireDate(issues, calendar?.firstDay, path + '.firstDay')
  const lastDay = requireDate(issues, calendar?.lastDay, path + '.lastDay')
  if (firstDay && lastDay && firstDay > lastDay) {
    addIssue(issues, 'error', 'REVERSED_SCHOOL_YEAR', path, 'lastDay occurs before firstDay.')
  }
  if (calendar.firstOptionalAdsyDay !== undefined) {
    const firstOptionalAdsyDay = requireDate(issues, calendar.firstOptionalAdsyDay, path + '.firstOptionalAdsyDay')
    if (firstOptionalAdsyDay && firstDay && firstOptionalAdsyDay > firstDay) {
      addIssue(issues, 'error', 'OPTIONAL_ADSY_DAY_AFTER_FIRST_DAY', path + '.firstOptionalAdsyDay', 'firstOptionalAdsyDay must occur on or before the regular firstDay.')
    }
  }
  if (calendar.calendarScope !== undefined) {
    requireText(issues, calendar.calendarScope, path + '.calendarScope')
  }
  if (calendar.excludedCampuses !== undefined) {
    if (!Array.isArray(calendar.excludedCampuses)
      || calendar.excludedCampuses.length === 0
      || calendar.excludedCampuses.some(value => !isNonEmptyString(value))) {
      addIssue(issues, 'error', 'INVALID_EXCLUDED_CAMPUSES', path + '.excludedCampuses', 'excludedCampuses must be a non-empty array of campus names.')
    }
    else if (new Set(calendar.excludedCampuses).size !== calendar.excludedCampuses.length) {
      addIssue(issues, 'error', 'DUPLICATE_EXCLUDED_CAMPUS', path + '.excludedCampuses', 'excludedCampuses must not contain duplicate campus names.')
    }
  }
  if (calendar.campusScope !== undefined) {
    if (Array.isArray(calendar.campusScope)) {
      if (calendar.campusScope.some(value => !isNonEmptyString(value))) {
        addIssue(issues, 'error', 'INVALID_CAMPUS_SCOPE_LIST', path + '.campusScope', 'campusScope must contain campus names.')
      }
    }
    else if (!isObject(calendar.campusScope)) {
      addIssue(issues, 'error', 'INVALID_CAMPUS_SCOPE', path + '.campusScope', 'campusScope must preserve the campus lists from each official source.')
    }
    else {
      for (const field of ['boardApproved', 'calendarPdfListed']) {
        if (!Array.isArray(calendar.campusScope[field]) || calendar.campusScope[field].some(value => !isNonEmptyString(value))) {
          addIssue(issues, 'error', 'INVALID_CAMPUS_SCOPE_LIST', path + '.campusScope.' + field, field + ' must be an array of campus names.')
        }
      }
      if (typeof calendar.campusScope.hasSourceConflict !== 'boolean') {
        addIssue(issues, 'error', 'INVALID_CAMPUS_SCOPE_CONFLICT', path + '.campusScope.hasSourceConflict', 'hasSourceConflict must be a boolean.')
      }
    }
  }
  if (calendar.attendanceUncertaintyDates !== undefined) {
    if (!Array.isArray(calendar.attendanceUncertaintyDates)) {
      addIssue(issues, 'error', 'INVALID_ATTENDANCE_UNCERTAINTY', path + '.attendanceUncertaintyDates', 'Unresolved attendance must be an array of ISO dates.')
    }
    else {
      const seen = new Set()
      calendar.attendanceUncertaintyDates.forEach((value, index) => {
        const datePath = path + '.attendanceUncertaintyDates[' + index + ']'
        const date = requireDate(issues, value, datePath)
        if (seen.has(value)) addIssue(issues, 'error', 'DUPLICATE_ATTENDANCE_UNCERTAINTY', datePath, 'Unresolved attendance dates must be unique.')
        seen.add(value)
        if (date && firstDay && lastDay && (date < firstDay || date > lastDay)) {
          addIssue(issues, 'error', 'ATTENDANCE_UNCERTAINTY_OUTSIDE_YEAR', datePath, 'Unresolved attendance date is outside the student year.')
        }
      })
      if (calendar.attendanceUncertaintyDates.length && calendar.statistics?.some(item => item.id === 'student-attendance-days' && item.basis === 'derived')) {
        addIssue(issues, 'error', 'UNRESOLVED_ATTENDANCE_TOTAL', path + '.statistics', 'Do not publish a calculated attendance total while attendance dates remain unresolved.')
      }
    }
  }
  for (const field of ['firstDayBasis', 'lastDayBasis']) {
    if (calendar?.[field] && !['official', 'derived'].includes(calendar[field])) {
      addIssue(issues, 'error', 'INVALID_CALENDAR_BOUNDARY_BASIS', path + '.' + field, field + ' must be official or derived.')
    }
  }
  if (calendar.lastDayConditional !== undefined && typeof calendar.lastDayConditional !== 'boolean') {
    addIssue(issues, 'error', 'INVALID_LAST_DAY_CONDITIONAL', path + '.lastDayConditional', 'lastDayConditional must be a boolean.')
  }
  if (calendar.lastDayConditional === true) {
    requireText(issues, calendar.lastDayCondition, path + '.lastDayCondition')
    if (!lastDay) {
      addIssue(issues, 'error', 'MISSING_CONDITIONAL_LAST_DAY', path + '.lastDay', 'A conditional last day requires a valid scheduled date.')
    }
  }
  else if (calendar.lastDayCondition !== undefined) {
    addIssue(issues, 'error', 'UNMARKED_LAST_DAY_CONDITION', path + '.lastDayCondition', 'A last-day condition requires lastDayConditional: true.')
  }
  if (match && firstDay && !firstDay.startsWith(match[1] + '-')) {
    addIssue(issues, 'error', 'FIRST_DAY_WRONG_YEAR', path + '.firstDay', 'firstDay should occur in ' + match[1] + '.')
  }
  if (match && lastDay && !lastDay.startsWith(match[2] + '-')) {
    addIssue(issues, 'error', 'LAST_DAY_WRONG_YEAR', path + '.lastDay', 'lastDay should occur in ' + match[2] + '.')
  }

  requireText(issues, calendar?.seo?.title, path + '.seo.title')
  requireText(issues, calendar?.seo?.description, path + '.seo.description')
  requireText(issues, calendar?.hero?.heading, path + '.hero.heading')
  requireText(issues, calendar?.hero?.mobileDescription, path + '.hero.mobileDescription')
  requireText(issues, calendar?.hero?.desktopDescription, path + '.hero.desktopDescription')

  if (calendar.indexable) {
    const createdAt = requireDate(issues, calendar?.createdAt, path + '.createdAt')
    if (calendar.approvedAt !== undefined && calendar.approvedAt !== null) {
      requireDate(issues, calendar.approvedAt, path + '.approvedAt')
    }
    requireDate(issues, calendar?.verifiedAt, path + '.verifiedAt')
    const contentUpdatedAt = requireDate(issues, calendar?.contentUpdatedAt, path + '.contentUpdatedAt')
    for (const field of ['sourceDocumentUpdatedAt', 'boardRevisionApprovedAt', 'boardRevisionEffectiveAt']) {
      if (calendar[field] !== undefined && calendar[field] !== null) {
        requireDate(issues, calendar[field], path + '.' + field)
      }
    }
    if (calendar.lastOperationalUpdateAt !== undefined && calendar.lastOperationalUpdateAt !== null) {
      requireDate(issues, calendar.lastOperationalUpdateAt, path + '.lastOperationalUpdateAt')
    }
    if (calendar.noSchoolWeekdayStatisticMode !== undefined
      && !['confirmed-non-conditional', 'published-schedule'].includes(calendar.noSchoolWeekdayStatisticMode)) {
      addIssue(issues, 'error', 'INVALID_NO_SCHOOL_STATISTIC_MODE', path + '.noSchoolWeekdayStatisticMode', 'Unknown no-school weekday statistic mode.')
    }
    if (calendar.publishStandaloneNoSchoolStatistic !== undefined
      && typeof calendar.publishStandaloneNoSchoolStatistic !== 'boolean') {
      addIssue(issues, 'error', 'INVALID_STANDALONE_NO_SCHOOL_STATISTIC_VISIBILITY', path + '.publishStandaloneNoSchoolStatistic', 'Standalone no-school statistic publication must be a boolean.')
    }
    if (calendar.publishStandaloneNoSchoolStatistic === false
      && calendar.statistics?.some(item => item.id === 'student-no-school-days')) {
      addIssue(issues, 'error', 'HIDDEN_STANDALONE_STATISTIC_STORED', path + '.statistics', 'Regenerate statistics after disabling the standalone no-school subset.')
    }
    if (calendar.standaloneNoSchoolStatisticMode !== undefined
      && !['non-holiday-events', 'single-date-events'].includes(calendar.standaloneNoSchoolStatisticMode)) {
      addIssue(issues, 'error', 'INVALID_STANDALONE_NO_SCHOOL_STATISTIC_MODE', path + '.standaloneNoSchoolStatisticMode', 'Unknown standalone no-school statistic mode.')
    }
    if (calendar.standaloneNoSchoolStatisticLabel !== undefined
      && (typeof calendar.standaloneNoSchoolStatisticLabel !== 'string'
        || !calendar.standaloneNoSchoolStatisticLabel.trim())) {
      addIssue(issues, 'error', 'INVALID_STANDALONE_NO_SCHOOL_STATISTIC_LABEL', path + '.standaloneNoSchoolStatisticLabel', 'The standalone no-school statistic label must be non-empty text.')
    }
    if (calendar.standaloneNoSchoolStatisticExplanation !== undefined
      && (typeof calendar.standaloneNoSchoolStatisticExplanation !== 'string'
        || !calendar.standaloneNoSchoolStatisticExplanation.trim())) {
      addIssue(issues, 'error', 'INVALID_STANDALONE_NO_SCHOOL_STATISTIC_EXPLANATION', path + '.standaloneNoSchoolStatisticExplanation', 'The standalone no-school statistic explanation must be non-empty text.')
    }
    if (calendar.earlyReleaseStatisticExplanation !== undefined
      && (typeof calendar.earlyReleaseStatisticExplanation !== 'string'
        || !calendar.earlyReleaseStatisticExplanation.trim())) {
      addIssue(issues, 'error', 'INVALID_EARLY_RELEASE_STATISTIC_EXPLANATION', path + '.earlyReleaseStatisticExplanation', 'The early-release statistic explanation must be non-empty text.')
    }
    const createdDate = parseIsoDate(createdAt)
    const contentUpdatedDate = parseIsoDate(contentUpdatedAt)
    if (createdDate && contentUpdatedDate && createdDate > contentUpdatedDate) {
      addIssue(issues, 'error', 'CONTENT_UPDATE_BEFORE_CREATION', path + '.contentUpdatedAt', 'contentUpdatedAt cannot be earlier than createdAt.')
    }
    if (!calendar.actions?.officialCalendarUrl && !calendar.actions?.officialPdfUrl) {
      addIssue(issues, 'error', 'MISSING_OFFICIAL_ACTION', path + '.actions', 'An indexable page must link to an official calendar page or PDF.')
    }
    if (countWords(calendar.seo?.description) < 12) {
      addIssue(issues, 'warning', 'THIN_META_DESCRIPTION', path + '.seo.description', 'Meta description is too short to summarize this calendar clearly.')
    }
    if ((calendar.seo?.title || '').length > 70) {
      addIssue(issues, 'warning', 'LONG_TITLE', path + '.seo.title', 'SEO title exceeds 70 characters; check likely truncation and boilerplate.')
    }
  }

  const sourceIds = validateSources(issues, record, calendar, path)
  validateSchoolHours(issues, calendar, path)
  validateSourceDiscrepancies(issues, calendar, sourceIds, path)
  validateEvents(issues, calendar, sourceIds, path)
  validateFaqs(issues, record, calendar, path)
  validateEditorial(issues, calendar, path)
  validateAbout(issues, calendar, path)
  validateHighlights(issues, calendar, path)
  validateStatistics(issues, calendar, path)

  const keyDates = Array.isArray(calendar.keyDates) ? calendar.keyDates : []
  if (calendar.indexable && keyDates.length < 2) {
    addIssue(issues, 'error', 'TOO_FEW_KEY_DATES', path + '.keyDates', 'An indexable calendar must include at least first and last day key dates.')
  }
  keyDates.forEach((item, index) => {
    const itemPath = path + '.keyDates[' + index + ']'
    validateDateRange(issues, item, itemPath)
    if (!eventTypes.has(item?.eventType)) {
      addIssue(issues, 'error', 'INVALID_KEY_DATE_TYPE', itemPath + '.eventType', 'Unknown event type: ' + String(item?.eventType))
    }
    if (item?.basis && !['official', 'derived'].includes(item.basis)) {
      addIssue(issues, 'error', 'INVALID_KEY_DATE_BASIS', itemPath + '.basis', 'Key-date basis must be official or derived.')
    }
    const keyDateBasisFields = ['dateBasis', 'labelBasis', 'eventTypeBasis']
    for (const field of keyDateBasisFields) {
      if (item?.[field] !== undefined && !['official', 'derived'].includes(item[field])) {
        addIssue(issues, 'error', 'INVALID_KEY_DATE_FIELD_BASIS', itemPath + '.' + field, 'Key-date field provenance must be official or derived.')
      }
    }
    if (item?.basis === 'official' && keyDateBasisFields.some(field => item[field] === 'derived')) {
      addIssue(issues, 'error', 'CONFLICTING_KEY_DATE_SUMMARY_BASIS', itemPath, 'A key date with derived fields must not use an unqualified official summary basis.')
    }
    const matchingEvent = (calendar.events || []).find(event => (
      event.dateStart === item?.dateStart
      && (event.dateEnd || event.dateStart) === (item?.dateEnd || item?.dateStart)
      && hasEventType(event, item?.eventType)
    ))
    if (matchingEvent) {
      const eventBases = {
        dateBasis: matchingEvent.dateBasis,
        labelBasis: item.label === matchingEvent.name ? matchingEvent.nameBasis
          : item.label === matchingEvent.displayName ? matchingEvent.displayNameBasis : undefined,
        eventTypeBasis: matchingEvent.eventTypesBasis?.[item.eventType]
          || (matchingEvent.eventType === item.eventType ? matchingEvent.eventTypeBasis : undefined),
      }
      for (const field of keyDateBasisFields) {
        if (item?.[field] !== undefined && eventBases[field] !== undefined && item[field] !== eventBases[field]) {
          addIssue(issues, 'error', 'KEY_DATE_EVENT_BASIS_MISMATCH', itemPath + '.' + field, 'Key-date provenance conflicts with its matching event.')
        }
      }
    }
    if (['CALENDAR_START', 'CALENDAR_END'].includes(item?.eventType) && item?.basis !== 'derived') {
      addIssue(issues, 'error', 'KEY_DATE_BOUNDARY_NOT_DERIVED', itemPath, 'Calendar boundary key dates must use basis=derived.')
    }
    if (['FIRST_DAY', 'LAST_DAY'].includes(item?.eventType) && item?.basis === 'derived') {
      addIssue(issues, 'error', 'DERIVED_KEY_DATE_OFFICIAL_TYPE', itemPath, 'Derived key-date boundaries must use CALENDAR_START or CALENDAR_END.')
    }
  })

  const firstKeyDateType = calendar.firstDayBasis === 'derived' ? 'CALENDAR_START' : 'FIRST_DAY'
  const lastKeyDateType = calendar.lastDayBasis === 'derived' ? 'CALENDAR_END' : 'LAST_DAY'
  if (calendar.firstDay && !keyDates.some(item => item.eventType === firstKeyDateType && item.dateStart === calendar.firstDay)) {
    addIssue(issues, 'error', 'FIRST_KEY_DATE_MISMATCH', path + '.keyDates', 'keyDates must include the calendar firstDay as ' + firstKeyDateType + '.')
  }
  if (calendar.lastDay && !keyDates.some(item => item.eventType === lastKeyDateType && item.dateStart === calendar.lastDay)) {
    addIssue(issues, 'error', 'LAST_KEY_DATE_MISMATCH', path + '.keyDates', 'keyDates must include the calendar lastDay as ' + lastKeyDateType + '.')
  }

  const breaks = Array.isArray(calendar.breaks) ? calendar.breaks : []
  const breakEventsById = new Map((calendar.events || []).map(event => [event.id, event]))
  breaks.forEach((item, index) => {
    const itemPath = path + '.breaks[' + index + ']'
    validateDateRange(issues, item, itemPath)
    requireText(issues, item?.name, itemPath + '.name')
    if (item?.basis !== undefined && !['official', 'derived'].includes(item.basis)) {
      addIssue(issues, 'error', 'INVALID_BREAK_BASIS', itemPath + '.basis', 'Break basis must be official or derived.')
    }
    if (item?.componentEventIds !== undefined) {
      if (!Array.isArray(item.componentEventIds) || item.componentEventIds.length === 0) {
        addIssue(issues, 'error', 'INVALID_BREAK_COMPONENTS', itemPath + '.componentEventIds', 'Break components must be a non-empty array of event IDs.')
      }
      else {
        const seenComponents = new Set()
        for (const eventId of item.componentEventIds) {
          const component = breakEventsById.get(eventId)
          if (seenComponents.has(eventId) || !component) {
            addIssue(issues, 'error', 'INVALID_BREAK_COMPONENT_ID', itemPath + '.componentEventIds', 'Break components must reference unique canonical events: ' + String(eventId))
          }
          else if (component.dateStart < item.dateStart || (component.dateEnd || component.dateStart) > item.dateEnd
            || !(nonStudentStatuses.has(component.schoolStatus) || component.schoolStatus === 'conditional-attendance')) {
            addIssue(issues, 'error', 'INVALID_BREAK_COMPONENT_EVENT', itemPath + '.componentEventIds', 'Break components must be no-school or conditional events within the break range: ' + eventId)
          }
          seenComponents.add(eventId)
        }
      }
    }
    const weekdays = countWeekdays(item?.dateStart, item?.dateEnd)
    if (item?.schoolWeekdaysOff !== null && item?.schoolWeekdaysOff !== undefined) {
      if (!['official', 'derived'].includes(item?.schoolWeekdaysOffBasis)) {
        addIssue(issues, 'error', 'MISSING_BREAK_COUNT_BASIS', itemPath + '.schoolWeekdaysOffBasis', 'Break weekday counts must identify whether the figure is official or derived.')
      }
      if (!isNonEmptyString(item?.schoolWeekdaysOffNote)) {
        addIssue(issues, 'error', 'MISSING_BREAK_COUNT_METHOD', itemPath + '.schoolWeekdaysOffNote', 'Break weekday counts must explain where the official figure appears or how the derived count was calculated.')
      }
    }
    if (item?.schoolWeekdaysOff !== null && weekdays !== null && item.schoolWeekdaysOff !== weekdays) {
      addIssue(issues, item?.schoolWeekdaysOffBasis === 'derived' ? 'error' : 'warning', 'BREAK_WEEKDAY_COUNT', itemPath + '.schoolWeekdaysOff', 'Stored value is ' + item.schoolWeekdaysOff + ', while the inclusive date range contains ' + weekdays + ' weekdays. Confirm whether an adjacent event is intentionally included.')
    }
    if (item?.lastStudentAttendanceDate) {
      const lastAttendanceDate = requireDate(issues, item.lastStudentAttendanceDate, itemPath + '.lastStudentAttendanceDate')
      if (lastAttendanceDate && parseIsoDate(item?.dateStart) && lastAttendanceDate >= item.dateStart) {
        addIssue(issues, 'error', 'INVALID_LAST_ATTENDANCE_DATE', itemPath + '.lastStudentAttendanceDate', 'lastStudentAttendanceDate must occur before dateStart.')
      }
    }
    if (item?.nextStudentAttendanceDate) {
      const returnDate = requireDate(issues, item.nextStudentAttendanceDate, itemPath + '.nextStudentAttendanceDate')
      if (returnDate && parseIsoDate(item?.dateEnd) && returnDate <= item.dateEnd) {
        addIssue(issues, 'error', 'INVALID_NEXT_ATTENDANCE_DATE', itemPath + '.nextStudentAttendanceDate', 'nextStudentAttendanceDate must occur after dateEnd.')
      }
      if (!['official', 'derived'].includes(item?.nextStudentAttendanceDateBasis)) {
        addIssue(issues, 'error', 'MISSING_NEXT_ATTENDANCE_DATE_BASIS', itemPath + '.nextStudentAttendanceDateBasis', 'nextStudentAttendanceDate must identify whether it is official or derived.')
      }
    }
  })
}

function validateRecord(issues, record, filename) {
  const filePath = 'server/data/districts/records/' + filename
  if (!isObject(record)) {
    addIssue(issues, 'error', 'INVALID_RECORD', filePath, 'Record root must be an object.')
    return
  }

  requireText(issues, record.district?.name, filePath + '.district.name')
  requireText(issues, record.district?.slug, filePath + '.district.slug')
  requireText(issues, record.district?.county, filePath + '.district.county')
  if (record.district?.slug && basename(filename, '.json') !== record.district.slug) {
    addIssue(issues, 'error', 'FILENAME_SLUG_MISMATCH', filePath, 'Filename must match district.slug.')
  }

  if (!isHttpUrl(record.calendarDiscovery?.officialWebsiteUrl)) {
    addIssue(issues, 'error', 'INVALID_OFFICIAL_WEBSITE', filePath + '.calendarDiscovery.officialWebsiteUrl', 'Official website must be an absolute HTTP(S) URL.')
  }
  if (!isHttpUrl(record.calendarDiscovery?.calendarPageUrl)) {
    addIssue(issues, 'error', 'INVALID_CALENDAR_PAGE', filePath + '.calendarDiscovery.calendarPageUrl', 'Calendar page must be an absolute HTTP(S) URL.')
  }
  requireDate(issues, record.calendarDiscovery?.lastCheckedAt, filePath + '.calendarDiscovery.lastCheckedAt')

  if (!isObject(record.schoolYears) || Object.keys(record.schoolYears).length === 0) {
    addIssue(issues, 'error', 'MISSING_SCHOOL_YEARS', filePath + '.schoolYears', 'Record must contain at least one school year.')
    return
  }

  for (const [schoolYear, calendar] of Object.entries(record.schoolYears)) {
    validateCalendar(issues, record, schoolYear, calendar, filePath)
  }
}

function checkCrossPageSimilarity(issues, records) {
  const pages = []
  for (const { filename, record } of records) {
    for (const [schoolYear, calendar] of Object.entries(record.schoolYears || {})) {
      const text = (calendar.editorialSummary?.paragraphs || []).join(' ')
      pages.push({
        districtSlug: record.district.slug,
        label: record.district.slug + '/' + schoolYear,
        path: 'server/data/districts/records/' + filename + '.schoolYears.' + schoolYear + '.editorialSummary.paragraphs',
        editorialTokens: shingles(normalizedTokens(text, record, calendar)),
        faqTokens: shingles(normalizedTokens((calendar.faqs || []).map(item => item.answer).join(' '), record, calendar)),
        aboutTokens: shingles(normalizedTokens(Object.values(calendar.about || {}).join(' '), record, calendar)),
      })
    }
  }

  for (let left = 0; left < pages.length; left += 1) {
    for (let right = left + 1; right < pages.length; right += 1) {
      const score = jaccard(pages[left].editorialTokens, pages[right].editorialTokens)
      if (score >= 0.85) {
        addIssue(issues, 'error', 'EDITORIAL_BOILERPLATE', pages[right].path, pages[right].label + ' is ' + Math.round(score * 100) + '% similar to ' + pages[left].label + ' after district/year/date normalization.')
      }
      else if (score >= 0.7) {
        addIssue(issues, 'warning', 'EDITORIAL_SIMILARITY', pages[right].path, pages[right].label + ' is ' + Math.round(score * 100) + '% similar to ' + pages[left].label + '; confirm that both pages contain real year-specific planning value.')
      }

      if (pages[left].districtSlug === pages[right].districtSlug) continue

      const faqScore = jaccard(pages[left].faqTokens, pages[right].faqTokens)
      if (faqScore >= 0.7) {
        addIssue(issues, 'error', 'FAQ_ANSWER_BOILERPLATE', pages[right].path.replace('editorialSummary.paragraphs', 'faqs'), pages[right].label + ' FAQ answers are ' + Math.round(faqScore * 100) + '% similar to ' + pages[left].label + ' after district, year, and date normalization.')
      }
      else if (faqScore >= 0.55) {
        addIssue(issues, 'warning', 'FAQ_ANSWER_SIMILARITY', pages[right].path.replace('editorialSummary.paragraphs', 'faqs'), pages[right].label + ' FAQ answers are ' + Math.round(faqScore * 100) + '% similar to ' + pages[left].label + '; confirm that both sets answer district-specific planning questions.')
      }

      const aboutScore = jaccard(pages[left].aboutTokens, pages[right].aboutTokens)
      if (aboutScore >= 0.7) {
        addIssue(issues, 'error', 'ABOUT_BOILERPLATE', pages[right].path.replace('editorialSummary.paragraphs', 'about'), pages[right].label + ' source and scope copy is ' + Math.round(aboutScore * 100) + '% similar to ' + pages[left].label + ' after district, year, and date normalization.')
      }
      else if (aboutScore >= 0.55) {
        addIssue(issues, 'warning', 'ABOUT_SIMILARITY', pages[right].path.replace('editorialSummary.paragraphs', 'about'), pages[right].label + ' source and scope copy is ' + Math.round(aboutScore * 100) + '% similar to ' + pages[left].label + '; confirm that both describe their actual sources and processing decisions.')
      }
    }
  }
}

function normalizeBacklogDistrictName(value) {
  return String(value || '').replace(/\s+School District$/i, '').trim()
}

function validateDistrictBacklog(issues, records) {
  let source
  try {
    source = readFileSync(districtBacklogPath, 'utf8')
  }
  catch (error) {
    addIssue(issues, 'error', 'MISSING_DISTRICT_BACKLOG', 'docs/fl-school-districts-top1000.md', error.message)
    return
  }

  const rows = source
    .split('\n')
    .filter(line => /^\|\s*\d+\s*\|/.test(line))
    .map(line => line.slice(1, -1).split('|').map(value => value.trim()))

  const rowsBySlug = new Map(rows.filter(row => row[8]).map(row => [row[8], row]))
  const rowsByName = new Map(rows.map(row => [row[5], row]))

  for (const { record } of records) {
    const district = record.district || {}
    const row = rowsBySlug.get(district.slug)
      || rowsByName.get(normalizeBacklogDistrictName(district.name))
    const path = 'docs/fl-school-districts-top1000.md'

    if (!row) {
      addIssue(issues, 'error', 'DISTRICT_MISSING_FROM_BACKLOG', path, district.name + ' has a district record but no matching backlog row.')
      continue
    }
    if (row[7] !== '已建') {
      addIssue(issues, 'error', 'STALE_DISTRICT_BUILD_STATUS', path, district.name + ' has a district record but its backlog status is ' + (row[7] || 'blank') + '.')
    }
    if (row[8] !== district.slug) {
      addIssue(issues, 'error', 'BACKLOG_SLUG_MISMATCH', path, district.name + ' must use slug ' + district.slug + ' in the backlog.')
    }
    if (!parseIsoDate(row[9])) {
      addIssue(issues, 'error', 'MISSING_BACKLOG_CREATED_AT', path, district.name + ' must have a valid Created At date after it is built.')
    }
  }
}

export function auditRecords(records) {
  const issues = []
  for (const { filename, record } of records) validateRecord(issues, record, filename)
  checkCrossPageSimilarity(issues, records)
  return issues.sort((left, right) => (
    left.severity.localeCompare(right.severity)
    || left.path.localeCompare(right.path)
    || left.code.localeCompare(right.code)
  ))
}

export function loadRecords(root = recordsRoot) {
  const records = []
  const issues = []
  const files = readdirSync(root).filter(file => file.endsWith('.json')).sort()

  for (const filename of files) {
    try {
      records.push({
        filename,
        record: JSON.parse(readFileSync(join(root, filename), 'utf8')),
      })
    }
    catch (error) {
      addIssue(issues, 'error', 'INVALID_JSON', 'server/data/districts/records/' + filename, error.message)
    }
  }
  return { records, issues }
}

function printReport(issues, recordCount, calendarCount) {
  const errors = issues.filter(issue => issue.severity === 'error')
  const warnings = issues.filter(issue => issue.severity === 'warning')

  for (const issue of issues) {
    const marker = issue.severity === 'error' ? 'ERROR' : 'WARN '
    console.log(marker + ' [' + issue.code + '] ' + issue.path)
    console.log('      ' + issue.message)
  }

  if (issues.length) console.log('')
  console.log('Content quality check: ' + recordCount + ' district records, ' + calendarCount + ' calendars, ' + errors.length + ' errors, ' + warnings.length + ' warnings.')
  if (errors.length === 0) console.log('Publish gate: PASS')
  else console.log('Publish gate: BLOCKED')
}

function run() {
  const loaded = loadRecords()
  const issues = [...loaded.issues, ...auditRecords(loaded.records)]
  validateDistrictBacklog(issues, loaded.records)
  const calendarCount = loaded.records.reduce((sum, item) => (
    sum + Object.keys(item.record.schoolYears || {}).length
  ), 0)
  printReport(issues, loaded.records.length, calendarCount)
  if (issues.some(issue => issue.severity === 'error')) process.exitCode = 1
}

const invokedPath = process.argv[1] ? fileURLToPath(new URL('file://' + process.argv[1])) : ''
if (invokedPath === fileURLToPath(import.meta.url)) run()
