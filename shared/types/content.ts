export type PriorityLevel = 'P0' | 'P1' | 'P2' | 'P3'
export type CalendarStatus = 'draft' | 'official' | 'revised' | 'historical'
export type SchoolStatus =
  | 'schools-open'
  | 'schools-closed'
  | 'no-classes'
  /** Regular classes pause; selected students may still attend a scheduled program. */
  | 'no-regular-classes'
  | 'early-dismissal'
  | 'modified-schedule'
  | 'special-schedule'
  | 'program-specific'
  /** No session for the scoped program; does not assert a campus or office closure. */
  | 'program-not-scheduled'
  | 'optional-attendance'
  | 'varied-by-school'
  | 'varied-by-grade'
  | 'remote-instruction'
  | 'no-students'
  | 'staff-only'
  | 'exam-day'
  | 'not-applicable'
  | 'conditional-attendance'
  | 'unknown'

export type EventType =
  | 'FIRST_DAY'
  | 'LAST_DAY'
  | 'CALENDAR_START'
  | 'CALENDAR_END'
  | 'HOLIDAY'
  | 'UNCONFIRMED_HOLIDAY'
  | 'STUDENT_BREAK'
  | 'FALL_BREAK'
  | 'THANKSGIVING_BREAK'
  | 'WINTER_BREAK'
  | 'MIDWINTER_BREAK'
  | 'TRACK_BREAK'
  | 'SPRING_BREAK'
  | 'PARENT_CONFERENCE'
  | 'TEACHER_CONFERENCE'
  | 'SUPERINTENDENT_DAY'
  | 'STAFF_DEVELOPMENT'
  | 'NON_STUDENT_DAY'
  | 'EARLY_RELEASE'
  | 'HALF_DAY'
  | 'LATE_START'
  | 'MINIMUM_DAY'
  | 'MODIFIED_DAY'
  | 'INTERSESSION'
  | 'INTERSESSION_CLASSES'
  | 'PROGRAM_EXTENDED_DAY'
  | 'PROGRAM_ADSY_DAY'
  | 'SUMMER_PROGRAM'
  | 'ENRICHMENT_DAY'
  | 'EXAM'
  | 'FINAL_EXAM'
  | 'STATE_TEST'
  | 'REGENTS'
  | 'REMOTE_INSTRUCTION'
  | 'SEMESTER_START'
  | 'SEMESTER_END'
  | 'EMERGENCY_CLOSURE'
  | 'SNOW_DAY'
  | 'MAKEUP_DAY'
  /** Published Weather Day marker; does not by itself establish a closure or make-up activation policy. */
  | 'WEATHER_DAY'
  | 'BAD_WEATHER_DAY'
  | 'RESERVED_ATTENDANCE_DAY'
  | 'CONDITIONAL_SCHOOL_DAY'
  | 'BACK_TO_SCHOOL_NIGHT'
  /** School visiting event with no implied time of day. */
  | 'OPEN_HOUSE'
  | 'MEET_THE_TEACHER'
  | 'PROGRESS_REPORT'
  | 'REPORT_CARD'
  | 'GRADING_PERIOD_START'
  | 'GRADING_PERIOD_END'
  | 'COLLEGE_TERM_START'
  | 'COLLEGE_TERM_END'
  | 'SCHOOL_MILESTONE'

export interface LinkItem {
  label: string
  href: string
  description?: string | null
  external?: boolean
}

export interface DistrictIdentity {
  id: string
  districtNumber: string | null
  timeZone: string
  name: string
  shortName: string
  slug: string
  county: string
  countySlug: string
  region: string
  regionSlug: string
  districtType: string
  priority: PriorityLevel
  schoolAgePopulation: number
}

export interface CalendarDiscovery {
  officialWebsiteUrl: string | null
  calendarPageUrl: string | null
  documentsPageUrl: string | null
  crawlEnabled: boolean
  discoveryStrategy: 'manual' | 'html-links' | 'sitemap' | 'custom'
  linkTextPatterns: string[]
  pdfUrlPatterns: string[]
  crawlerNotes: string | null
  lastCheckedAt: string | null
}

export interface CalendarSource {
  id: string
  label: string
  type: 'district-website' | 'campus-website' | 'official-webpage' | 'calendar-page' | 'official-pdf' | 'board-document'
  url: string
  resolvedPdfUrl?: string
  contentHash?: string
  publishedAt: string | null
  retrievedAt: string
  /** Approval date printed within the source itself. */
  printedBoardApprovalDate?: string
  /** Revision date printed within the source itself. */
  printedRevisionDate?: string
}

export interface CalendarSourceDiscrepancy {
  field: string
  sourceIds: string[]
  resolution: 'unresolved' | 'source-conflict' | 'resolved'
  effect: string
  gridDate?: string
  captionDate?: string
  pdfPrintedDate?: string
  districtNewsDate?: string
  officialPdfDate?: string
  officialWebpageDate?: string
  revisionMaterialsDate?: string
  originalCalendarBoardApprovalDate?: string
}

export interface CalendarEvent {
  id: string
  /** Null only when official sources conflict and no canonical date is published. */
  dateStart: string | null
  dateEnd: string | null
  /** Primary classification for ordering and legacy compatibility; use hasEventType for membership queries. */
  eventType: EventType
  /** Publication status of an individual event, independent of the adopted school-year calendar. */
  status?: 'proposed' | 'confirmed'
  /** A date range within which individual assignments occur, not a daily attendance or exam requirement. */
  isWindow?: boolean
  /** Provenance of the primary eventType, independent of the published date and source label. */
  eventTypeBasis?: 'official' | 'derived'
  /** Complete classifications, including eventType; when absent, getEventTypes returns the single primary type. */
  eventTypes?: EventType[]
  /** Field-level provenance for every classification when one event has multiple meanings. */
  eventTypesBasis?: Partial<Record<EventType, 'official' | 'derived'>>
  /** UIL meaning on a canonical event; does not narrow the event's attendance or dismissal scope. */
  uilEligibility?: {
    kind: 'cutoff' | 'eligibility-change'
    gradeScope: string
    sourceId: string
    basis: 'official' | 'derived'
  }
  /** Marks the final student date on an existing attendance event without adding a duplicate boundary event. */
  isFinalStudentDate?: boolean
  /** Distinguishes a published last day from a final date inferred from calendar boundaries. */
  finalStudentDateBasis?: 'official' | 'derived'
  /** Limits the endpoint to the regular attendance year, excluding later supplemental programs or care. */
  finalStudentDateScope?: 'regular-year'
  /** Source-based canonical label; may be normalized or combine facts, and is not necessarily verbatim source text. */
  name: string
  /** Optional family-facing alternative to the canonical name; exact source wording belongs in officialLabel. */
  displayName?: string
  /** Provenance of the family-facing display label. */
  displayNameBasis?: 'official' | 'derived'
  /** Official source supporting the family-facing display label when it differs from the event's date source. */
  displayNameSourceId?: string | null
  /** Source wording retained when the public event name is normalized for families. */
  officialLabel?: string
  /** Separate verbatim source labels for an occurrence listed in multiple calendar sections. */
  officialLabels?: string[]
  /** Supplemental occurrence already covered by a named no-school break; does not add another break. */
  coveredByBreakEventId?: string
  schoolStatus: SchoolStatus
  /** Provenance of the normalized attendance or schedule classification, separate from the event date/name. */
  schoolStatusBasis?: 'official' | 'derived'
  /** Source-faithful display wording when a normalized status is broader than the PDF label. */
  schoolStatusLabel?: string
  /** Why attendance status cannot be resolved from the cited source. */
  schoolStatusReason?: 'source-conflict' | 'source-does-not-state'
  /** Primary evidence for the event's existence; field-specific sources may support its name, time, schedule or attendance status. */
  sourceId: string
  /** Evidence supporting the display name, which may expand abbreviations or normalize wording; not a verbatim-string claim. */
  nameSourceId?: string | null
  /** Source support for the public name, including faithful normalization; officialLabel preserves verbatim source wording. */
  nameBasis?: 'official' | 'derived'
  /** Sources supporting a public event name assembled from more than one official source. */
  nameSourceIds?: string[]
  /** Official source for a published event time when it differs from the date source. */
  timeSourceId?: string | null
  /** Source for a schedule description that does not necessarily publish clock times. */
  scheduleSourceId?: string | null
  /** Official sources jointly supporting a schedule that applies across multiple campuses. */
  scheduleSourceIds?: string[]
  note: string | null
  /** Official only when the whole note is directly expressed by the source; synthesis, missing-information observations, adjacency, and return-date relationships are derived. Omit when note is null. */
  noteBasis?: 'official' | 'derived'
  /** Official sources supporting a note that combines evidence from multiple pages or documents. */
  noteSourceIds?: string[]
  /**
   * Event existence/source provenance, not a blanket assertion that the object is official.
   * dateBasis, nameBasis, eventTypeBasis, noteBasis and schoolStatusBasis describe their own fields.
   * A field is official only when its specific proposition is directly expressed by the source;
   * inferred classifications, combined facts and attendance interpretations are derived.
   */
  basis?: 'official' | 'derived'
  /** Provenance of the complete occurrence or range, not just its endpoints. Combining separately printed source entries into a range is derived even when every included date is official. */
  dateBasis?: 'official' | 'derived' | 'source-conflict'
  /** Meaning of dateStart when it is retained only for sorting an unresolved event. */
  dateStartBasis?: 'official' | 'derived' | 'grid-candidate'
  /** Confirmed date for downstream publication; null when official sources conflict. */
  canonicalDate?: string | null
  /** Candidate dates preserved from conflicting official evidence. */
  candidateDates?: Array<{
    date: string
    sourceRole: 'calendar-grid' | 'fair-day-caption' | 'official-pdf' | 'official-webpage'
  }>
  scheduleType?: 'MODIFIED_DAY' | 'MINIMUM_DAY' | null
  scheduleTypeSourceId?: string | null
  scheduleCode?: 'M' | 'EM' | 'MM' | 'MHM' | 'HM' | null
  /** Grades or program covered by a schedule change or program-not-scheduled entry. */
  scheduleScope?: string | null
  /** Regular attendance schedule; separate from the grades whose first day this event marks. */
  scheduleStatus?: 'regular' | null
  /** Grade-scoped exceptions; do not apply a half-day schedule to the entire event. */
  scheduleDetails?: Array<{
    gradeScope: string
    scheduleType: 'HALF_DAY'
    sourceId: string
    basis: 'official' | 'derived'
  }>
  gradeScope?: string | null
  /** Provenance of a normalized or inferred grade/campus scope. */
  gradeScopeBasis?: 'official' | 'derived'
  /** Official source supporting the event's grade or campus scope. */
  gradeScopeSourceId?: string | null
  /** Official sources jointly supporting a grade or campus scope. */
  gradeScopeSourceIds?: string[]
  /** People explicitly covered by an event when the source scope is broader than student grades. */
  participantScope?: string | null
  /** Provenance of the event audience or participant scope. */
  participantScopeBasis?: 'official' | 'derived'
  /** Official source supporting the event audience or participant scope. */
  participantScopeSourceId?: string | null
  /** Official sources jointly supporting the event audience or participant scope. */
  participantScopeSourceIds?: string[]
  /** Portion of the official grade scope relevant to the supplemental program represented by this route. */
  programRelevantScope?: string | null
  /** Provenance of the route-specific program scope. */
  programRelevantScopeBasis?: 'official' | 'derived'
  /** Official source supporting the program boundaries used to derive programRelevantScope. */
  programRelevantScopeSourceId?: string | null
  /** Scheduled attendance date on this calendar, not a universal attendance requirement. Use participantScope for a selected or supplemental program. */
  countsAsStudentAttendanceDay?: boolean
  /** Whether the program date falls on a regular instructional date in the district calendar. */
  occursOnRegularInstructionalDay?: boolean
  /** Provenance of the date's overlap with the regular instructional schedule. */
  occursOnRegularInstructionalDayBasis?: 'official' | 'derived'
  /** @deprecated Use occursOnRegularInstructionalDay; this field describes date overlap, not an additive day count. */
  countsAsRegularInstructionalDay?: boolean
  /** Whether participating students are expected to attend the supplemental program on this date. */
  countsAsProgramAttendanceDate?: boolean
  /** Attendance under the currently published baseline; does not assert that later revisions cannot change the date. */
  countsAsStudentAttendanceDayUnderPublishedSchedule?: boolean
  /** Provenance of the baseline attendance flag, independent of the event's official existence or taxonomy. */
  countsAsStudentAttendanceDayUnderPublishedScheduleBasis?: 'official' | 'derived'
  /** Whether the published calendar currently schedules this conditional date as no school. */
  scheduledAsNoSchool?: boolean
  /** Provenance for interpreting the conditional date as no school under the published schedule. */
  scheduledAsNoSchoolBasis?: 'official' | 'derived'
  /** Whether the published contingency lists this date as a possible required attendance day. Omit when change eligibility is unconfirmed. */
  mayBecomeAttendanceDay?: boolean
  /** Preserves the published no-class baseline when applicability of a course-exchange exception is unconfirmed. This does not assert permission to hold classes. */
  attendanceChangeEligibility?: 'unconfirmed'
  /** Provenance for the original possible attendance designation. */
  mayBecomeAttendanceDayBasis?: 'official' | 'derived'
  /** Retains an original make-up contingency as history, without implying pending activation or verified actual attendance. */
  attendanceContingencyStatus?: 'historical'
  /** Official source that defines the event's published attendance status. */
  attendanceStatusBasisSourceId?: string
  /** Whether the event date is confirmed by the cited official source. */
  isDateConfirmed?: boolean
  /** Excludes unresolved or otherwise unsafe events from generated calendar subscriptions. */
  excludeFromIcs?: boolean
  /** Conflicting candidate dates printed within one official source. */
  dateConflict?: {
    gridDate: string
    captionDate: string
    resolution: 'unresolved' | 'resolved'
  }
  /** True when one official source contains conflicting labels for this event. */
  sourceInternalConflict?: boolean
  /** True when current official sources disagree about this event's attendance status or schedule. */
  sourceConflict?: boolean
  /** Exact schedule or attendance field in conflict; other event facts remain source-supported. */
  conflictField?: string
  /** Official sources whose published information conflicts with the canonical event source. */
  conflictSourceIds?: string[]
}

export interface KeyDate {
  label: string
  dateStart: string
  dateEnd: string | null
  eventType: EventType
  /** Legacy whole-key-date provenance summary, not event-existence provenance. Omit for mixed provenance and use field-level bases instead. */
  basis?: 'official' | 'derived'
  /** Provenance of the complete published occurrence or range, separate from its classification. A range assembled from distinct source entries is derived, not official merely because its endpoints are official. */
  dateBasis?: 'official' | 'derived'
  /** Provenance of the displayed label, which may retain a literal source category. */
  labelBasis?: 'official' | 'derived'
  /** Provenance of the semantic classification independently of date and label. */
  eventTypeBasis?: 'official' | 'derived'
}

/** Presentation-only grouping; canonical event dates and attendance flags remain separate. */
export interface CalendarEventDisplayGroup {
  id: string
  name: string
  eventIds: string[]
  note: string
}

export interface CalendarBreak {
  name: string
  dateStart: string
  dateEnd: string
  /** Official range or a derived span assembled from separate attendance events and weekends. */
  basis?: 'official' | 'derived'
  /** Canonical events supporting this span; conditional components retain their activation caveats. */
  componentEventIds?: string[]
  lastStudentAttendanceDate: string | null
  nextStudentAttendanceDate: string | null
  nextStudentAttendanceDateBasis?: 'official' | 'derived'
  schoolWeekdaysOff: number | null
  schoolWeekdaysOffBasis?: 'official' | 'derived'
  schoolWeekdaysOffNote?: string | null
  /** Parent-facing participation or scope caveat, independent of any closure count. */
  note?: string | null
}

export interface CalendarHighlight {
  label: string
  value: string
  basis?: 'official' | 'derived'
  /** Identifies a sum of published term totals independently of the user-facing label. */
  calculationMethod?: 'sum-published-semester-days' | 'sum-published-quarter-days'
  note: string | null
}

export interface CalendarStatistic {
  id: string
  label: string
  value: string
  basis: 'official' | 'derived'
  explanation: string
}

export interface CalendarSchoolHours {
  scope: string
  /** Inclusive school-date applicability; source publication dates belong in sources[]. */
  effectiveFrom?: string | null
  effectiveThrough?: string | null
  regularHours?: string | null
  earlyReleaseHours?: string | null
  earlyReleaseTime?: string | null
  lateArrivalHours?: string | null
  examDismissalHours?: string | null
  note?: string | null
  sourceId?: string
  basis?: 'official' | 'derived'
}

export interface CalendarSessionHours {
  start: string
  end: string
  scope?: string
  mandatoryAttendance?: boolean
}

export interface CalendarProgramHours {
  fullDay?: CalendarSessionHours
  halfDay?: CalendarSessionHours
  sourceId?: string
  basis?: 'official' | 'derived'
}

export interface CalendarRevision {
  version: number
  changedAt: string
  eventId: string | null
  field: string
  oldValue: string | null
  newValue: string
  reason: string | null
  sourceUrl: string
  verifiedAt: string
}

export interface CalendarFaqItem {
  question: string
  answer: string
}

export interface CalendarEditorialSummary {
  heading: string
  paragraphs: string[]
  highlights: string[]
}

export interface NearbyComparison {
  districtSlugs: string[]
  rows: Array<{ label: string; values: Record<string, string> }>
  insights: string[]
}

export interface CalendarCampusScope {
  boardApproved: string[]
  calendarPdfListed: string[]
  hasSourceConflict: boolean
}

export interface DistrictCalendar {
  schoolYear: string
  routeSlug?: string
  calendarLabel?: string
  calendarScope?: string
  /** Campuses that use a different calendar and must not inherit this calendar's events. */
  excludedCampuses?: string[]
  /** In-year dates whose student attendance cannot be resolved from official sources. */
  attendanceUncertaintyDates?: string[]
  /** Source lifecycle: official means currently district-published; approvedAt separately proves governing-body adoption. */
  status: CalendarStatus
  indexable: boolean
  createdAt: string | null
  /** Date the governing body approved the calendar, when confirmed by an official source. */
  approvedAt?: string | null
  publishedAt: string | null
  verifiedAt: string | null
  contentUpdatedAt: string | null
  lastOfficialRevisionAt: string | null
  /** Update date printed on the source document, which may predate a later board revision. */
  sourceDocumentUpdatedAt?: string | null
  /** Date the governing body approved the latest confirmed calendar revision. */
  boardRevisionApprovedAt?: string | null
  /** Date the latest governing-body revision took effect. */
  boardRevisionEffectiveAt?: string | null
  /** Date of the latest official operational schedule update when the annual calendar itself was not revised. */
  lastOperationalUpdateAt?: string | null
  /** Controls whether conditional make-up dates are excluded from the family-facing no-school weekday statistic. */
  noSchoolWeekdayStatisticMode?: 'confirmed-non-conditional' | 'published-schedule'
  /** Calendar-specific label for counted no-school weekdays; does not change the counted dates. */
  noSchoolWeekdayStatisticLabel?: string
  /** Source-specific explanation when conditional attendance is a program class exchange rather than weather make-up. */
  noSchoolWeekdayStatisticExplanation?: string
  /** Controls which confirmed events count as standalone no-school days. */
  standaloneNoSchoolStatisticMode?: 'non-holiday-events' | 'single-date-events'
  /** Optional family-facing label for this subset; changes presentation, not counted dates. */
  standaloneNoSchoolStatisticLabel?: string
  /** Calendar-specific counting explanation, preserved when stored statistics are regenerated. */
  standaloneNoSchoolStatisticExplanation?: string
  /** Source-backed grade/campus explanation for shortened dates, preserved during regeneration. */
  earlyReleaseStatisticExplanation?: string
  /** Identifies a partial confirmed count without changing the shortened dates counted. */
  earlyReleaseStatisticLabel?: string
  /** Calendar-specific label for a published or calculated student-day total, preserved during regeneration. */
  studentDayStatisticLabel?: string
  /** Counting-scope explanation for a calculated student-day total; published totals retain their source note. */
  studentDayStatisticExplanation?: string
  /** Calendar-specific label for the calculated longest break; does not change counted dates. */
  longestBreakStatisticLabel?: string
  /** Calendar-specific explanation of the longest-break counting scope, preserved during regeneration. */
  longestBreakStatisticExplanation?: string
  /** Calendar-specific label for the calculated three- or four-day no-class stretches. */
  longWeekendStatisticLabel?: string
  /** Calendar-specific counting scope, preserved when statistics are regenerated. */
  longWeekendStatisticExplanation?: string
  /** Optionally exclude holiday weekends joined to longer intersession pauses. */
  longWeekendStatisticMode?: 'confirmed-no-school-stretches' | 'independent-regular-class-pauses'
  /** Count confirmed closure stretches by default, or only named breaks outside intersessions. */
  fullWeekBreakStatisticMode?: 'confirmed-no-school-stretches' | 'named-breaks-excluding-intersessions'
  fullWeekBreakStatisticLabel?: string
  fullWeekBreakStatisticExplanation?: string
  /** Opt out of publishing the overlapping standalone-day subset; defaults to true. */
  publishStandaloneNoSchoolStatistic?: boolean
  /** Board approval date printed in the primary calendar source. */
  printedBoardApprovalDate?: string
  firstDay: string | null
  /** First optional supplemental-program date when it precedes the regular first day. */
  firstOptionalAdsyDay?: string | null
  lastDay: string | null
  /** The published last day is subject to a condition, rather than a guaranteed final attendance date. */
  lastDayConditional?: boolean
  /** Source-supported condition attached to the published last day. */
  lastDayCondition?: string
  firstDayBasis?: 'official' | 'derived'
  lastDayBasis?: 'official' | 'derived'
  campusScope?: string[] | CalendarCampusScope
  seo: { title: string; description: string }
  hero: {
    heading: string
    mobileDescription: string
    desktopDescription: string
  }
  editorialSummary: CalendarEditorialSummary
  keyDates: KeyDate[]
  actions: {
    staticIcsUrl: string | null
    googleCalendarUrl: string | null
    appleCalendarUrl: string | null
    officialPdfUrl: string | null
    officialCalendarUrl: string | null
  }
  highlights: CalendarHighlight[]
  statistics: CalendarStatistic[]
  comparativeInsights: string[]
  schoolHours?: CalendarSchoolHours[] | CalendarProgramHours | null
  events: CalendarEvent[]
  eventDisplayGroups?: CalendarEventDisplayGroup[]
  breaks: CalendarBreak[]
  /** Legacy canonical list for calendars that do not split confirmed and conditional no-school events. */
  noSchoolDayEventIds?: string[]
  /** Events that are confirmed no-school dates and cannot become attendance days under a make-up designation. */
  confirmedNoSchoolDayEventIds?: string[]
  /** Events currently scheduled with no student classes that may later become attendance days. */
  conditionalNoSchoolDayEventIds?: string[]
  nearbyComparison: NearbyComparison | null
  revisions: CalendarRevision[]
  about: {
    dataSource: string
    processing: string
    updates: string
    disclaimer: string
  }
  faqs: CalendarFaqItem[]
  sources: CalendarSource[]
  sourceDiscrepancies?: CalendarSourceDiscrepancy[]
  relatedResources: LinkItem[]
}

export interface DistrictRecord {
  schemaVersion: string
  district: DistrictIdentity
  calendarDiscovery: CalendarDiscovery
  page: {
    eyebrow: string
    heading: string
    summary: string
    seo: { title: string; description: string }
    /** District-level questions; opt in to a published hub instead of repeating future-year intent on year pages. */
    faqs?: CalendarFaqItem[]
    relatedResources: LinkItem[]
  }
  schoolYears: Record<string, DistrictCalendar>
}

export interface DistrictCatalogEntry extends Omit<
  DistrictIdentity,
  'priority' | 'schoolAgePopulation'
> {
  summary: string
  /** Present only for an opted-in district calendar hub. */
  hubHref?: string
  calendarPages: Array<{
    schoolYear: string
    routeSlug: string
    calendarLabel: string | null
    href: string
    status: CalendarStatus
    indexable: boolean
    createdAt: string | null
    verifiedAt: string | null
    contentUpdatedAt: string | null
    firstDay: string | null
    lastDay: string | null
    lastDayConditional?: boolean
    lastDayCondition?: string
    keyDates: KeyDate[]
  }>
}

export interface DistrictCatalog {
  schemaVersion: string
  counts: {
    districts: number
    counties: number
    regions: number
    indexableCalendars: number
  }
  districts: DistrictCatalogEntry[]
}

export interface HomepageFeaturedCalendar {
  district: Pick<
    DistrictIdentity,
    'name' | 'shortName' | 'slug' | 'county' | 'region'
  >
  summary: string
  calendar: Pick<
    DistrictCalendar,
    | 'schoolYear'
    | 'routeSlug'
    | 'calendarLabel'
    | 'status'
    | 'verifiedAt'
    | 'contentUpdatedAt'
    | 'firstDay'
    | 'lastDay'
    | 'keyDates'
    | 'actions'
  >
}
