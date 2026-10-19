# District content quality gate

Run the complete pre-publication check with:

```bash
pnpm content:check
```

The command checks every JSON file in `server/data/districts/records`; it does
not limit validation to files changed in Git. It also runs automatically before
`pnpm build` and `pnpm generate`.

## Result levels

- `ERROR` blocks the build. Errors cover malformed or missing source data,
  invalid date ranges, duplicate events and FAQs, staff-only events, broken
  event/source relationships, incomplete indexable pages, and near-identical
  editorial copy after district names, years, and dates are removed.
- `WARN` does not block the build. Warnings identify likely overlapping FAQ
  intent, unusually thin editorial content, questionable break weekday counts,
  and editorial summaries that may still be too similar.

Warnings always need review before publication. They are warnings rather than
automatic failures because a shared calendar rule or genuinely similar school
year can produce legitimate overlap.

## Editorial similarity

The checker removes district names, abbreviations, school years, and date
numbers before comparing editorial paragraphs. This catches pages that only
swap variables while allowing a shared page structure.

- 70% to 84% similarity: warning and manual review
- 85% or greater: publication-blocking error

Do not resolve a similarity warning by randomly replacing synonyms. Confirm
that each page explains source-backed details specific to that district and
school year, such as grade-level exceptions, return dates, modified schedules,
separate program calendars, split finals, or revision history.

## Source verification boundary

The default check is deterministic and offline. It validates that official URLs
are present, correctly formed, represented in the source data, and referenced
by events. It does not claim that an external URL is currently reachable. The
`verifiedAt`, `retrievedAt`, and `lastCheckedAt` dates must only be updated after
someone has actually checked the official source.

## Page updates and source checks

Every published school-year record keeps two separate dates:

- `createdAt` is when that school-year page was first created in this project.
- `publishedAt` is the official district calendar's publication date when one
  is available; it is not the publication date of this website page.
- `verifiedAt` is the most recent date the official district calendar or PDF was
  checked. A source-only recheck may update this field.
- `contentUpdatedAt` is the most recent date the page's calendar data or
  editorial copy actually changed. Do not update it when a source was checked
  and no page content changed.

The visible page labels these dates as **Official calendar checked** and **Page
content updated**. JSON-LD `dateModified` uses `contentUpdatedAt`, so a routine
source check does not falsely signal that the page content was revised. JSON-LD
`dateCreated` and `datePublished` use the page's `createdAt`; the official
calendar publication date remains source metadata.

## Calendar statistics and provenance

Every student-day statistic displayed in **School year by the numbers** must
declare a `basis`:

- `official` means the district calendar or PDF reports the figure directly.
- `derived` means the figure was calculated from dates or subtotals in an
  official district source.

The page displays that distinction beneath each value. Every break with a
`schoolWeekdaysOff` value must also store `schoolWeekdaysOffBasis` and a
calendar-specific `schoolWeekdaysOffNote` in the JSON. **Longest listed break**
uses that stored explanation instead of generating generic provenance copy in
the component. Derived break counts must match the Monday-through-Friday dates
inside the stored range; a mismatch blocks publication. If the source does not
support a student-day total, the page omits that metric; it must never
substitute zero or assume a standard 180-day year.

The fixed UI label only identifies the class of evidence as **Official figure**
or **Derived figure**. The explanation itself comes from that calendar's JSON
`note` and must state where the official total appears or which source values
were added or counted. The publish gate blocks student-day statistics that omit
either `basis` or this calendar-specific evidence note.

**Total weekdays off** is displayed only when all of the following checks pass:

- the official district calendar directly reports the student-day total;
- the page has valid first and last student dates;
- every counted no-school event applies calendar-wide rather than to one grade;
- only Monday-through-Friday dates with no student attendance are counted;
- overlapping holidays and breaks are deduplicated; and
- the canonical events referenced by `noSchoolDayEventIds` expand to a total
  that exactly matches the weekdays in the school year minus the
  district-reported student days.

The visible explanation states that this is a derived figure, gives the date
range, excludes weekends and shortened school days, and identifies the official
student-day figure used for reconciliation. When any eligibility check fails,
the metric is omitted rather than estimated. Quarter and semester day counts
remain unpublished until their term boundaries and grade scope can be validated
with the same standard.
