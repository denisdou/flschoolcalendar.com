<script setup lang="ts">
definePageMeta({ layout: 'default' })

const cards = [
  {
    title: 'Student attendance first',
    description: 'Events are included when they affect whether students attend or when the school day ends early.',
    meta: 'Scope rule',
  },
  {
    title: 'Inclusive date ranges',
    description: 'The start and end date describe the full published event, with the student return date stored separately.',
    meta: 'Date rule',
  },
  {
    title: 'Source-backed revisions',
    description: 'Material changes retain the official source, reason, prior value, and verification date.',
    meta: 'Update rule',
  },
]

const sections = [
  {
    title: '1. Identify the district and calendar type',
    paragraphs: [
      'Research begins with the district’s official website and Florida Department of Education identity data. We confirm the district name, county, district type, and official web address before collecting calendar dates.',
      'We also identify the schedule the document actually covers. A district may publish separate calendars for elementary and secondary grades, traditional and year-round schools, or a specialty program. Distinct schedules are kept separate when combining them would give families the wrong dates.',
    ],
  },
  {
    title: '2. Find the strongest available source',
    paragraphs: [
      'The preferred source is an official district calendar PDF or an official calendar page that names the dates directly. A board-adopted calendar or board document can support the record when the district publishes it as the controlling schedule.',
      'Search results, third-party calendar sites, social posts, and neighboring district calendars are not used as substitutes for an official source. If a later school year has not been published, it remains absent instead of being projected from an earlier year.',
    ],
  },
  {
    title: '3. Read the document as a calendar, not just as text',
    paragraphs: [
      'PDF text extraction is checked against the rendered pages because many calendars communicate meaning through color, shading, symbols, underlines, legends, or separate grade-level rows. Month grids, written date notes, legends, instructional-day totals, and return dates are compared before a record is published.',
      'When an official webpage and its PDF describe a student closure differently, we resolve the apparent difference using the student attendance pattern. For example, a final teacher workday may extend the period students are off even when the colored break ends one weekday earlier.',
    ],
  },
  {
    title: '4. Keep only student-relevant events',
    paragraphs: [
      'The core event list includes first and last days, holidays, school breaks, no-student days, early dismissals, late starts, and other dates that directly change the student schedule.',
      'Board meetings, payroll dates, staff anniversaries, and employee-only workdays before the first day or after the last day are left out. A professional development or teacher workday during the school year is included when it means students do not attend.',
    ],
  },
  {
    title: '5. Normalize dates without changing their meaning',
    paragraphs: [
      'All dates use the YYYY-MM-DD format in the district JSON. A multi-day event uses an inclusive start and end date. The accompanying break record stores the last school day before the closure, the day students return, and the number of affected Monday-through-Friday school days.',
      'A holiday that falls inside a longer school break is normally described in the note or FAQ rather than added as a duplicate event. Grade-specific dates are labeled instead of being presented as districtwide. Conference ranges that cross a weekend explain that only scheduled school days use the modified timetable.',
    ],
  },
  {
    title: '6. Check the complete school year',
    paragraphs: [
      'Before publication, event IDs, source references, date order, school-year boundaries, duplicate FAQs, and break continuity are validated. Published instructional-day and minimum-day totals are cross-checked when the official document provides them.',
      'The site then generates the downloadable ICS calendar and runs type checking plus a production build. Generated district pages, JSON endpoints, and calendar files must all be present before the record is considered complete.',
    ],
  },
  {
    title: 'Calendar status and verification dates',
    paragraphs: [
      'Official means the record was prepared from a district source. Revised official means a later district version was used. Historical official identifies an earlier school year retained for reference. Draft records do not appear as public calendar pages.',
      'The checked date tells readers when the source was last reviewed; it is not a promise that the district made no later change. A calendar page may also show the source publication date and a revision history when those details are available.',
    ],
  },
  {
    title: 'Known limits',
    paragraphs: [
      'An annual district calendar rarely contains every campus bell time, testing appointment, graduation ceremony, transportation change, or emergency closure. Imported ICS files are planning copies and do not automatically receive later corrections.',
      'For a decision that depends on a date or exact time, open the official source and check the district or school’s latest message. Reported errors are welcome, but a record is changed only after the supporting source can be verified.',
    ],
  },
]

useSiteSeo({
  title: 'School Calendar Data Methodology',
  description: 'How FL School Calendar selects official sources, reads district PDFs, normalizes student dates, checks multi-day breaks, and publishes revisions.',
  path: '/methodology/',
})
</script>

<template>
  <FrameworkPage
    breadcrumb-label="Methodology"
    eyebrow="Editorial methodology"
    title="How district calendars become verified records"
    lead="A repeatable workflow for turning official school calendars into accurate, student-focused dates without flattening important schedule differences."
    :cards="cards"
    :sections="sections"
  />
</template>
