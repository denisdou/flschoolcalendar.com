<script setup lang="ts">
definePageMeta({ layout: 'default' })

const cards = [
  {
    title: 'Checked date',
    description: 'Shows when the cited district source was most recently reviewed for that calendar record.',
    meta: 'Source review',
  },
  {
    title: 'Calendar status',
    description: 'Distinguishes official, revised official, and historical records without implying that dates can never change.',
    meta: 'Record state',
  },
  {
    title: 'Revision history',
    description: 'Records a material date or label change with its reason, source, and verification time.',
    meta: 'Change record',
  },
]

const sections = [
  {
    title: 'Updates live with the calendar they affect',
    paragraphs: [
      'Each district calendar page carries its own checked date, official source list, status, and revision history. Keeping the update beside the calendar makes it clear which school year and schedule variant changed.',
      'This page explains the update process; it is not a live emergency feed. For same-day closures, weather decisions, or transportation changes, use the district or school’s official alert channels.',
    ],
  },
  {
    title: 'What triggers a record change',
    paragraphs: [
      'A record is updated when a district publishes a revised PDF, changes a date on its official calendar page, clarifies which grades follow a schedule, or replaces a previously cited document. Corrections supported by a newer official source follow the same process.',
      'Material changes include first or last days, student holidays, school breaks, return dates, early-release days, no-student days, calendar scope, and source URLs. Spelling or formatting fixes may be made without changing the meaning of an event.',
    ],
  },
  {
    title: 'What a revision records',
    paragraphs: [
      'When a source-backed change affects published calendar information, the revision entry can identify the affected event or field, the earlier value, the replacement value, the reason for the change, the official source, and the date it was verified.',
      'The calendar’s status may change to Revised official when the district labels or publishes a replacement version. Earlier school years remain Historical official when they are retained for reference.',
    ],
  },
  {
    title: 'Source checks without a date change',
    paragraphs: [
      'A checked date can move forward even when the calendar itself does not change. That means the cited source was reviewed again, not that every district communication or campus schedule was audited.',
      'An imported ICS file does not receive those later checks automatically. Download a fresh copy after a revision or update the affected event in your personal calendar.',
    ],
  },
  {
    title: 'Report a newer calendar or correction',
    paragraphs: [
      'Use the Contact page and include the district, school year, calendar variant, affected date, and an official link. We verify the source before publishing a correction and do not use screenshots or third-party summaries as the sole evidence for a districtwide change.',
    ],
  },
]

useSiteSeo({
  title: 'School Calendar Updates and Revisions',
  description: 'How FL School Calendar records source checks, revised district calendars, corrected dates, and verification history.',
  path: '/updates/',
  robots: 'index,follow',
})
</script>

<template>
  <FrameworkPage
    breadcrumb-label="Updates"
    eyebrow="Updates and corrections"
    title="How calendar changes are recorded"
    lead="Meaningful changes stay attached to the district calendar, with the source and verification context families need to understand the update."
    :cards="cards"
    :sections="sections"
  />
</template>
