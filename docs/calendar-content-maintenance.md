# Calendar content maintenance standard

Last updated: 2026-10-15. Scope: Florida district JSON records and their student-facing calendar pages.

Use this standard together with the [content quality gate](content-quality-gate.md).
Use the [Florida district backlog](fl-school-districts-top1000.md) to track publication.
Florida county districts use FLDOE identifiers 01–67. Verify local time zones,
official district names, calendar scope, and current official sources individually.
Copied reference records under `test/fixtures/` are test data and are never Florida evidence.
A saved review is not a substitute for checking a later official revision.

- Publish calendar detail URLs with a school year, such as
  `/alachua-county-school-district/2026-2027/`. Do not create district overview
  pages at `/district-slug/`, add them to the catalog/sitemap, or prerender them.
  District-level JSON metadata and FAQs can remain as source content without
  creating an additional public page.

## Official evidence and PDF interpretation

- Check the district calendar page and the current linked PDF. A locally downloaded
  file may be an older revision; do not assume its filename proves current approval.
- `status: official` means the calendar is the district's current published source,
  not that the stored version has separately verified Board adoption. Record a
  confirmed governing-body date in `approvedAt`; otherwise leave it null and preserve
  any approval uncertainty in `sourceDiscrepancies`.
- Inspect both extracted text and rendered pages. Colors, rectangles, circles,
  half-circles, outlines and legend entries can carry different meanings.
- Match the exact shape to the legend, not just its color. A grading-period boundary
  is not evidence of an ENVI21ON day or a student holiday.
- Verify all dates in a multi-day event. Do not turn separate closures into one
  officially named break, or bridge a possible attendance day without evidence.
- Read calendar scope before extracting events: traditional, ADSY and campus-specific
  calendars must not be mixed into one districtwide attendance schedule.
- Do not update source verification timestamps merely because documentation or
  editorial wording changed.
- A calendar PDF is not the only source of in-year operating-schedule changes.
  During an authorized review, check recent district News and Live Feed notices for
  bell schedules, schedule changes, calendar updates, school hours, student holidays
  and school days. Read the linked notice, not just its headline. Recording discovery
  targets does not implement a crawler or start recurring monitoring.

## Facts, editorial labels and uncertainty

- Keep official event names source-faithful. Use natural search language in SEO,
  hero text and FAQs without implying it is the district's official event label.
- `nameSourceId` identifies evidence supporting the display name, not a promise
  that the exact string appears in the source. Display names may expand source
  abbreviations or normalize wording without adding facts. Use `officialLabel`
  when retaining the exact source wording is important.
- `nameBasis: official` likewise permits source-faithful normalization, such as
  "Veterans Day Holiday" from "Veteran's Day Holiday" or spelling out "1st".
  It does not mean a verbatim transcription. Use `derived` when the name adds an
  editorial interpretation; preserve source text separately in `officialLabel`.
- An event's `basis` describes its existence in the source, not all fields in the
  object. `KeyDate.basis` is a legacy whole-key-date summary, not event-existence
  provenance. Omit that summary when origins differ, and keep `dateBasis`,
  `labelBasis` and `eventTypeBasis` aligned with the supporting event. An official
  intersession range can have an official label and a derived internal taxonomy
  without asserting that every field is official.
- `basis: official` is for source-supported facts; `derived` is for calculations or
  editorial inferences. Classify notes separately using `noteBasis`.
- Keep field-level provenance separate from the event itself: `schoolStatusBasis`
  describes a normalized schedule classification, and
  `occursOnRegularInstructionalDayBasis` describes the regular-schedule overlap.
  Neither field defines campus-level participation or attendance requirements.
- A return date inferred from adjacent closures is derived unless the source states
  it directly. Keep each official closure separate even when students are off
  continuously across the sequence.
- Use `no-classes` when the evidence only establishes no classes. Do not imply that
  buildings or offices are closed, or that no students can be on campus.
- For a past make-up reserve with a later official schedule reminder, preserve the
  original conditional attendance fields and baseline statistics. Set
  `attendanceContingencyStatus: historical` with a source-supported status label
  and `attendanceStatusBasisSourceId` to present its contingency as history in
  the event table, monthly calendar and ICS. A reminder establishes an announced
  schedule, not independently verified actual attendance. Update related break
  descriptions too; do not derive historical status from elapsed time alone.
- Preserve principal-authorized program class-day exchanges separately from employee
  opt-work choices. Miami-Dade adult education planning days have a no-class baseline
  but may become class days in exchange for another scheduled day. Keep that exception
  in conditional attendance fields and the event status label; do not invent weather
  reserves or replacement dates. `noSchoolWeekdayStatisticExplanation` can explain
  this source-specific reason for excluding dates from the fixed no-class subset.
- When a date has an explicit published no-class baseline but the applicability of
  a course-exchange exception is unconfirmed, use `schoolStatus: no-classes`,
  `attendanceChangeEligibility: unconfirmed`,
  `scheduledAsNoSchool: true` and `countsAsStudentAttendanceDayUnderPublishedSchedule: false`.
  Omit `mayBecomeAttendanceDay` and its basis rather than asserting true or false.
  Retain the date in `conditionalNoSchoolDayEventIds`, which includes both confirmed
  change permissions and unresolved exceptions; membership does not prove permission.
  State the unresolved scope in
  its note and source discrepancy, and explain its exclusion from the fixed subset.
- Include staff-development dates only when they affect student attendance. Exclude
  employee-only events and unrelated summer-program dates from the regular-year
  student event list.
- When sources conflict, record the evidence in `about.processing` and the affected
  dates in `attendanceUncertaintyDates`. Do not invent either an attendance event or
  a confirmed closure. Explain what families should confirm in a concise FAQ.
- When new official evidence resolves a source discrepancy, retain its source IDs
  and explanation with `resolution: resolved` so the decision remains traceable.
- Resolve uncertainty only after checking sufficiently clear official evidence for
  the relevant campus and school year; update affected events and stored statistics
  together.
- A college or external-program milestone does not establish district campus
  operating status. Use the existing `not-applicable` status with a meaningful
  display label when that operating-status dimension does not apply. Do not infer
  attendance requirements solely from a milestone.
- Use `note: null` when the name, dates and status already explain the event, and
  omit `noteBasis` for an empty note. Retain notes for useful times, return-date
  implications, conditional rules and genuinely necessary scope information.

## JSON as the canonical data source

- Store each event once in `events`; reference it through `noSchoolDayEventIds` rather
  than maintaining a second array of copied event objects.
- New calendars with published no-school dates that may later become attendance days
  should use `confirmedNoSchoolDayEventIds` and `conditionalNoSchoolDayEventIds`
  instead of the legacy `noSchoolDayEventIds`. The confirmed list drives guaranteed
  closure counts; the conditional list records dates that are currently no school
  but retain a make-up-day activation path.
- Keep event IDs unique and all source/event references valid.
- Keep event date ranges, break ranges and the next actual attendance date distinct.
  Adjacent holidays can delay return without extending the officially named break.
- Store calculated statistics and calendar-specific explanations in JSON. Recalculate
  during content maintenance, not on every page render.
- Label official figures and derived figures clearly. Deduplicate overlapping
  closures and exclude weekends from weekday closure counts. Preserve explicitly
  scheduled weekend attendance, such as Miami-Dade Juvenile Justice Saturday classes,
  and count shortened school days as attendance days when supported by the calendar.
- A sum of published semester subtotals is `derived` unless the annual total is
  itself printed. Explain the operands and distinguish it from a date-grid count.
  If those methods disagree, record the discrepancy in processing notes; do not
  invent a closure or remove a date to force agreement.
- Use `studentDayStatisticLabel` to identify a calculated attendance total clearly.
  `studentDayStatisticExplanation` preserves its calendar-specific counting scope
  during regeneration without changing the count; published totals keep their source note.
  These fields are generator inputs; the matching `statistics` fields are generated
  output for display, not a second set of independently maintained copy. Edit the
  inputs and regenerate, then verify that stored statistics match the calculator.
- For conditional make-up dates, express the current planned exclusion with
  `countsAsStudentAttendanceDayUnderPublishedSchedule: false`, rather than an
  absolute attendance flag. When the published schedule clearly shows no student
  classes, use the corresponding current no-school `schoolStatus` and preserve the
  possible change separately with `mayBecomeAttendanceDay: true`. A legacy or
  unresolved conditional classification may continue to use `conditional-attendance`.
  Keep these dates outside confirmed closure IDs.
- Withhold a calculated attendance total if unresolved attendance dates could change
  it. Do not publish zero as a placeholder or assume a standard 180-day year.
- Omit zero-valued metrics. A standalone closure count must be labeled as standalone,
  not as the total number of days without school.
- Use `standaloneNoSchoolStatisticLabel` when a calendar needs a more specific
  family-facing label for that subset, such as student holidays for staff learning
  or preparation. The label does not change which dates are counted and survives
  statistics regeneration; it must not describe the subset as all days off.
- Use `standaloneNoSchoolStatisticExplanation` when the subset needs a source-specific
  definition, particularly for staff days inside a named break. It overrides the
  generic explanation without changing the calculated count and survives regeneration.
- Set `publishStandaloneNoSchoolStatistic: false` to omit a potentially misleading
  overlapping subset. Both regeneration and display respect this flag; remove the
  stored subset rather than merely deleting its label.
- Use `earlyReleaseStatisticExplanation` when the shortened-day count needs a
  source-backed grade or campus breakdown. Regeneration preserves this explanation;
  a count of unique listed dates must not imply every student leaves early on each.
  Use `earlyReleaseStatisticLabel` to identify a partial confirmed count when the
  full-year dismissal policy is still pending; regeneration preserves this label.
- Distinguish a listed break from a continuous no-class stretch; their ranges and
  lengths can differ. Explain what a metric actually counts.
- Keep reviewed break labels and explanations in their `statistics[]` objects.
  The statistics generator preserves this wording by ID for the longest stretch,
  long weekends and full-week breaks while recalculating values and provenance.
  A changed value resets the explanation to its calculated default; review any
  embedded dates whenever the underlying schedule or counting scope changes.
  Legacy `longestBreakStatisticLabel` / `longestBreakStatisticExplanation`,
  `longWeekendStatisticLabel` / `longWeekendStatisticExplanation` and full-week
  equivalents remain supported and take precedence, but new copy need not be
  duplicated there. Use `calculateCalendarStatistics(calendar,
  { preserveStoredBreakWording: true })` to check the publication output; the default
  calculator remains independent of stored statistics.
- For a calendar whose intersessions pause regular classes, use
  `longWeekendStatisticMode: independent-regular-class-pauses` to exclude a
  confirmed holiday weekend that joins a longer intersession pause. This does
  not turn intersession into a guaranteed holiday or change attendance totals.
  Use `fullWeekBreakStatisticMode: named-breaks-excluding-intersessions` when
  counting only named full-week breaks, with `fullWeekBreakStatisticLabel` and
  `fullWeekBreakStatisticExplanation` describing that scope. Other calendars
  retain the default confirmed-closure calculation.
- When every named break is conditional, statistics describe fixed no-class
  stretches and fixed long weekends. They exclude the conditional breaks; the
  calendar's planning spans still show the scheduled vacations and their caveats.
- Do not label intersession or other programs with unresolved participation rules
  as confirmed weekdays off. Set the planning window's `schoolWeekdaysOff` to null
  and use its optional `note` for participation guidance; confirmed holiday counts
  remain separate.
- Use the shared school-year calculation for global navigation, homepage and footer
  labels. Specific published calendars retain their actual school-year dates.

## Calendar and dismissal-time scope

- Store school-level clock times in `schoolHours`. The independent bell-times
  module and TOC entry appear only when that field contains usable schedule rows.
  Rows may supply `regularHours`, `earlyReleaseHours` (or `earlyReleaseTime`),
  `lateArrivalHours`, `examDismissalHours`, `note`, `sourceId` and `basis`.
  The module also supports existing full-day/half-day program sessions. Keep
  actual times and schedule caveats in JSON; do not extract them from FAQs or
  substitute a generic PDF source for a missing time-source ID.
- Preserve in-year bell-schedule changes with optional inclusive `effectiveFrom`
  and `effectiveThrough` school dates. Current-hours modules should show only the
  current schedule; do not display expired hours as an additional regular-hours row.
  Preserve replaced schedules in non-display discovery notes or a maintenance archive
  when needed. Historical rows may be displayed only when explicitly requested.
  Publication
  dates in the card footer are separate from effective dates on schedule rows.
  Leave `effectiveThrough` null unless the official schedule gives an end date;
  the school year's last day is not an announced bell-time expiration. Keep source links grouped in the footer,
  with each source's publication date, rather than repeating them on every row.
- When all displayed school-hours rows carry the same note, show it once above
  the schedules without removing row-level evidence from JSON. Keep partial or
  campus-specific notes on their applicable rows; do not expand their scope.
- Apply source precedence to the specific schedule and effective period. A later
  announcement can supersede an earlier bell schedule even when the PDF never changes;
  retaining the old hours as current is not an unresolved source conflict. For Corpus
  Christi 2026-27, the September 3 announcement restores middle-school hours to
  8:50 a.m.–4:10 p.m. effective September 21, superseding July 22's opening
  8:30 a.m.–3:50 p.m. schedule. Metro Prep kept high-school hours throughout.
- Scope attendance FAQs to the calendar variant they answer. A question on an
  Elementary or Secondary page must not imply districtwide applicability when ECHS
  or another campus calendar differs. Recheck the answer's yes/no polarity when
  changing a question from "Are there classes?" to "Are students off?".
- Separate the scope of an event date from the scope of its dismissal time. A date
  can apply to Pre-K–6 without every grade or session sharing one release time.
  State half-day Pre-K exceptions wherever an unqualified time would mislead:
  hero, time cards, FAQs and event notes. Cite the official time source separately
  from the calendar source when needed.
- Keep conditional make-up names faithful to the relevant calendar's student/staff
  label. Do not copy a regular-calendar label or date into ECHS without evidence.
- In cross-calendar FAQs, cover the relevant exceptions without turning an unlisted
  holiday into a confirmed attendance event. Check each Florida district's own
  alternative, charter, laboratory, virtual, and program calendars separately.
- Distinguish a fall college start from a spring start or return in SEO and prose.
  Attribute a schedule's stated purpose conservatively; do not turn "aligns with"
  into an unsupported comparative claim such as "aligns more closely".

## English-only editorial rules

- All parent-facing content is English. An English FAQ can explain language
  availability when verified on the Florida district's official calendar page.
  Keep answers and resource descriptions in English. Prior project approvals
  about individual districts do not establish facts for Florida calendars.
- Use the existing `NON_STUDENT_DAY` classification for an unnamed Non-school
  Day, rather than inventing a holiday name. It is not limited to staff workdays;
  any statistic using that classification must describe the full counted subset.
- Write for parents, not data reviewers. Avoid phrases such as "this route", "stored
  as", "kept as student events" and descriptions of how a PDF grid was parsed.
- Where early dismissal is verified, give it a dedicated `editorialSummary.paragraphs`
  entry covering the dates or recurring pattern, school/grade scope and pickup details.
  Keep an existing suitable paragraph rather than adding a duplicate. Preserve any
  unconfirmed dismissal or emergency-conversion caveat; a modified instructional day
  must keep that label unless early release is explicitly established.
- Keep the Early Release date table concise: event names and dates only, without
  row descriptions, evidence notes or a repeated status column. A school/grade
  restriction stays in the event name; explanations belong in the dedicated paragraph.
  Group repeated arrangements into one row and list every date by month and year.
  Keep different scopes, schedules and attendance conditions separate; do not append
  a scope again when the event title already identifies the same students.
- Keep visual-mark interpretation and extraction details in processing notes. FAQ
  answers should explain attendance implications and what families need to confirm.
- Prefer natural US K-12 language, such as "February student break" rather than
  "midterm break". Ask directly when Thanksgiving break begins and which
  staff-development days have no school for students.
- Give each FAQ an independent intent. Do not split official PDF download and latest
  calendar navigation into redundant questions, or combine keywords with a slash.
- There is no fixed FAQ quota. Retain distinct, useful questions and remove repetition.
- A dates question and a dismissal-time question can be independent intents. Avoid
  template FAQs about missing data without a useful calendar-specific reason; this
  does not prohibit report-card FAQs when dates are published or demand is evidenced.
- Lead each calendar variant with its own useful differences, not the same holiday
  sequence. Keep highlights affirmative and put corrective comparisons in targeted
  FAQs when needed. Keep count reconciliation and extraction details out of
  editorial paragraphs; use statistics explanations and processing notes instead.
- District-specific copy must come from evidence: campus applicability, special
  schedules, report-card dates, revised dates and program structure—not generic
  district promotional language.
- Do not keep rewriting titles, descriptions or paragraphs that are already accurate
  and natural unless new evidence or an actual usability issue warrants a change.

## Display and verification

- Use optional `eventDisplayGroups` to present contiguous segments of the same
  holiday as one list entry. Reference canonical event IDs and explain conditional
  make-up dates in the group note. Use the same groups in ICS, including the exact
  conditional ranges and their make-up priority in descriptions. Keep date grids,
  statistics and countdowns on original events; staff workdays stay outside the
  named holiday group. Group IDs provide stable export UIDs.
- Keep one canonical event when a date has several meanings. Its primary
  `eventType` controls the main display identity; optional `eventTypes` contains
  all classifications, including the primary type, without duplicates. Use
  `hasEventType` / `getEventTypes` for classification filters rather than testing
  only `eventType`. A last day may also be an early-release and grading-end date;
  count it once and export all classifications in the same ICS event.
- Preserve separate official meanings in the data even when they share a date.
  Check the UI before proposing grouping changes; a monthly date cell may already
  show all its events together.
- A published UIL cutoff can coexist with a grading-period end or early-release
  event. Keep one canonical occurrence, include `SCHOOL_MILESTONE` in `eventTypes`,
  and use optional `uilEligibility` metadata for the cutoff or eligibility-change
  meaning, its grade scope, source and provenance. That milestone scope does not
  narrow the attendance or dismissal scope of the entire event. An eligibility
  change on a no-school date remains a separate non-attendance milestone.
- Use `coveredByBreakEventId` for a supplemental occurrence inside a published
  no-school break. Preserve the event and source labels, but do not list it as
  another independent break when the enclosing break is shown.
- Attendance badges, monthly colors and confirmed-break countdowns must inspect
  `mayBecomeAttendanceDay`, not just `schoolStatus`. A published no-classes
  baseline with possible activation is conditional, not a guaranteed holiday.
- Preserve the official "Half Day for Students" wording when no dismissal time is
  published. Do not invent a release time from the normalized event type.
- For data or UI changes, run `pnpm content:check`, `pnpm test` and `pnpm typecheck`.
  Inspect visible results when presentation changes. Do not treat offline checks as
  confirmation that current official URLs are reachable.
- Regenerate ICS with `pnpm ics:generate` when canonical event data or exported text
  changes. Review generated changes and keep export dates aligned with JSON.
- Add focused regression coverage for PDF interpretation, uncertain attendance dates,
  duplicate-date presentation, English-only content and stored statistic provenance.
- Saving a source conflict does not start recurring monitoring. Schedule or perform
  future checks only when requested or as part of an authorized content update.

## Site-owned printable PDFs after an audit

- `public/pdf/` contains the site-generated printable calendars; district PDFs remain
  unchanged in `sources` and `actions.officialPdfUrl` as evidence. Download buttons
  open the local file in a new tab without forcing a download, with
  `?v=<contentUpdatedAt>` for the article's update date.
- After finishing a calendar audit, update its real `contentUpdatedAt`, run the
  content gate, then run `pnpm pdf:generate --district <district-slug> --school-year <year-or-route-slug>`.
  Use `pnpm pdf:generate` to process all audited published calendars. Drafts are
  excluded. `verifiedAt` and `contentUpdatedAt` must exist before first export.
- The generator uses the website's light color palette and the same month range,
  Monday-first grids, date tones, grouped holiday lists and attendance conditions
  as the web calendar, through `calendarMonthlyEvents.mjs`. Multi-day dates show
  their start and end without repeating the year. All month grids fit on page one;
  no entries are shortened into a "+N more" notice. Internal meetings, employee-only
  administrative dates and out-of-year staff workdays are excluded.
  Early-release dates follow the month grids on the same page whenever space permits,
  with the applicable school or grade scope. Overflow continues on page two with a
  repeated table header; the section heading is never left without a table row.
  Early-release date labels include the year, unlike the compact month-grid labels.
  Repeated schedules can share one row listing every date. Without overflow the PDF
  has only one page. There are no scope paragraphs, generic
  planning/disclaimer text, source lists, Key Dates, Other Important Dates or
  Extended Time Off sections. The header's FLschoolcalendar.com link opens the
  homepage; the footer's "View Calendar Online" link opens that calendar's detail page.
- Filenames are stable across updates, including distinct program-calendar routes.
  Input/style fingerprints and file hashes are recorded in `public/pdf/manifest.json`.
  Unchanged files are skipped; there is no scheduled generation or generation in
  `dev`, `build`, or `generate`. Normal builds only run `pnpm pdf:check` and stop if
  a published PDF is missing or stale. Commit the updated PDF and manifest together.
- One-time local renderer setup (Python 3.9+):

  ```sh
  python3 -m venv .venv-pdf
  .venv-pdf/bin/python -m pip install -r scripts/pdf-requirements.txt
  ```

  An existing interpreter can be selected with `CALENDAR_PDF_PYTHON`. Python is
  required only when rendering changed PDFs; `pnpm pdf:check` needs only Node/pnpm.
- Render changed PDFs with Poppler and inspect the overview, all section
  transitions and long table rows before publication. Recheck school/grade scopes,
  conditional make-up wording, last-day conditions, date ranges and document dates.
  Do not infer dismissal times or include employee-only dates in Other Important Dates.
