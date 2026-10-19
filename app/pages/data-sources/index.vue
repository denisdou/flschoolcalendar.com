<script setup lang="ts">
definePageMeta({ layout: 'default' })

const cards = [
  {
    title: 'Official calendar PDF',
    description: 'The preferred evidence for dates, legends, grade-level schedules, early-release days, and adopted revisions.',
    meta: 'Primary calendar source',
  },
  {
    title: 'Official district calendar page',
    description: 'Used to confirm current downloads, family-facing key dates, document versions, and later school years.',
    meta: 'Primary web source',
  },
  {
    title: 'FLDOE district records',
    description: 'Used for district identity, county, district type, state district number, and research prioritization—not to invent calendar dates.',
    meta: 'Reference source',
  },
]

const sections = [
  {
    title: 'Where the calendar dates come from',
    paragraphs: [
      'Published dates come from materials controlled by the school district: an academic calendar PDF, an official calendar webpage, or a board-adopted calendar document. Whenever possible, the record includes both the direct document and the district page where families can find the current version.',
      'Each calendar page lists the sources used, the date they were retrieved, and the date the record was checked. The Download Official PDF or View Official Calendar button opens the district’s material rather than a copy rewritten to look official.',
    ],
  },
  {
    title: 'How source priority works',
    paragraphs: [
      'A current, district-hosted calendar takes priority over an older board attachment, archived PDF, search-engine snippet, or third-party summary. A revised calendar takes priority over the version it replaces. A family-facing key-date table can clarify return dates, but it is checked against the full calendar before publication.',
      'If two official district sources appear to conflict, the record is not resolved by guesswork. We compare version dates, revision labels, legends, student-day totals, and schedule notes. Any remaining uncertainty is stated on the calendar page or the event is left out until a controlling source is clear.',
    ],
  },
  {
    title: 'What Florida Department of Education data is used for',
    paragraphs: [
      'Florida Department of Education records help establish the district’s official identity, county, district type, state district number, and federal district ID when available. Enrollment figures help prioritize the research backlog and do not determine which calendar dates are published.',
      'FLDOE directory data is not treated as an academic calendar. First days, breaks, holidays, early-release days, and last days still require a district-controlled calendar source.',
    ],
  },
  {
    title: 'What is not accepted as a controlling source',
    paragraphs: [
      'Search snippets, news aggregators, parent forums, commercial calendar sites, and calendars from another district may help locate an official document, but they do not establish a date on their own. School social posts are used cautiously because they may describe one campus rather than the district calendar.',
      'A filename or URL pattern is also not enough. The document itself must identify the district, school year, and schedule it covers.',
    ],
  },
  {
    title: 'Source metadata on every record',
    paragraphs: [
      'The district JSON stores the official website, calendar landing page, direct PDF when available, publication or approval date when stated, retrieval date, verification date, and revision source. These fields support the visible source list and make later checks repeatable.',
      'Operational discovery notes and link patterns help locate replacement PDFs when districts reorganize their websites. They do not appear as calendar facts unless the underlying document has been reviewed.',
    ],
  },
  {
    title: 'Missing and future school years',
    paragraphs: [
      'A blank future year means no official calendar was available for that record when it was checked. The site does not copy last year’s dates, infer a break from neighboring districts, or publish an unofficial prediction just to fill the gap.',
      'Districts release future calendars on different schedules. The official calendar page linked from each record is the best place to look for a newly adopted year that has not yet been added here.',
    ],
  },
  {
    title: 'Help us verify a better source',
    paragraphs: [
      'If you find a newer official calendar, send the district name, school year, page URL, and direct document link through the Contact page. A clear district source is more useful than a screenshot because it lets us verify context, version, and schedule scope.',
    ],
  },
]

useSiteSeo({
  title: 'School Calendar Data Sources',
  description: 'See which official district, PDF, board, and Florida Department of Education sources support FL School Calendar records.',
  path: '/data-sources/',
})
</script>

<template>
  <FrameworkPage
    breadcrumb-label="Data Sources"
    eyebrow="Source policy"
    title="Where our school calendar data comes from"
    lead="District-controlled calendars provide the dates. State records support district identity. Every published page keeps the evidence visible."
    :cards="cards"
    :sections="sections"
  />
</template>
