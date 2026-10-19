<script setup lang="ts">
definePageMeta({ layout: 'default' })

const currentSchoolYear = useCurrentSchoolYear()
const { data: catalog } = await useDistrictCatalog()
const counts = computed(() => catalog.value?.counts || {
  districts: 0,
  counties: 0,
  regions: 0,
  indexableCalendars: 0,
})

const cards = computed(() => [
  {
    title: `${counts.value.districts} published districts`,
    description: 'Districts with at least one source-backed calendar in the public directory.',
    meta: 'Current coverage',
    href: '/#districts',
  },
  {
    title: `${counts.value.indexableCalendars} calendar pages`,
    description: 'Separate school years and schedule variants each receive their own calendar page.',
    meta: 'Published records',
  },
  {
    title: `${counts.value.counties} counties represented`,
    description: `${counts.value.regions} broad planning regions remain available as directory filters.`,
    meta: 'Directory reach',
  },
])

const sections = computed(() => [
  {
    title: 'A simpler way to read district calendars',
    paragraphs: [
      `FL School Calendar is an independent directory of Florida public school district calendars. It turns official PDFs and district calendar pages into consistent ${currentSchoolYear.replace('-', '–')} views that are easier to scan, compare, and add to a personal calendar.`,
      'A district page brings together the first and last day, school breaks, student holidays, no-school days, early-release days when published, source links, verification dates, and revision notes. Most published calendars can also be downloaded as an ICS file or opened in Google Calendar or Apple Calendar.',
    ],
  },
  {
    title: 'Built for family planning',
    paragraphs: [
      'The site focuses on questions families regularly need to answer: When does school start? Which weekdays are students off? When do classes resume after a break? Is an early-release date districtwide or limited to certain grades? The same structure is used across districts so those answers do not depend on learning a new PDF layout every time.',
      'The Compare tool places two published calendars side by side for common planning dates. Regional and county filters help families browse nearby districts, while each calendar page keeps the original district source close at hand.',
    ],
  },
  {
    title: 'What gets published',
    paragraphs: [
      'Coverage grows one verified record at a time. A calendar is published only after its dates, labels, school-year boundaries, and official sources have been checked. When a district uses materially different elementary, secondary, traditional, year-round, or specialty schedules, those variants may receive separate pages rather than being blended into one misleading calendar.',
      'The directory is not a complete list of every Florida school or every campus event. Private schools, most independent charter calendars, athletics, board meetings, staff-only events, and school-specific activities are outside the core scope unless they directly change student attendance for the published calendar.',
    ],
  },
  {
    title: 'Independent, with official sources kept visible',
    paragraphs: [
      'FL School Calendar is not operated by the Florida Department of Education, a county school board, a school district, or a school. District names are used to identify the public calendars families are looking for; the linked source documents remain with their publishers.',
      'Official does not mean unchangeable. Districts can revise calendars, and emergency closures may never appear in the original annual PDF. Use this site for planning, then confirm time-sensitive dates, bell times, transportation, enrollment, and same-day changes with the district or school.',
    ],
  },
  {
    title: 'Corrections are source-led',
    paragraphs: [
      'If a published date looks wrong, send the calendar page, the date in question, and an official district link that shows the correction. We review the source before changing the record and preserve meaningful changes in the calendar page’s revision history.',
      'The Methodology and Data Sources pages explain the editorial rules in more detail. The Contact page is the best route for corrections, missing official calendars, and privacy questions.',
    ],
  },
])

useSiteSeo({
  title: 'About FL School Calendar',
  description: 'Learn how FL School Calendar turns official Florida district calendars into family-friendly dates, comparisons, source records, and ICS downloads.',
  path: '/about/',
})
</script>

<template>
  <FrameworkPage
    breadcrumb-label="About"
    eyebrow="About the project"
    title="Florida school calendars, made easier to use"
    lead="A parent-friendly directory that organizes official district calendars without hiding the source or the limits of the data."
    :cards="cards"
    :sections="sections"
  />
</template>
