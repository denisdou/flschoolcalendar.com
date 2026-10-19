<script setup lang="ts">
import type { CalendarFaqItem } from '~~/shared/types/content'
import { absoluteUrl, formatSchoolYear } from '~~/shared/utils/content'

definePageMeta({ layout: 'default' })

const currentSchoolYear = useCurrentSchoolYear()
const { data: catalog } = await useDistrictCatalog()
const districts = computed(() => catalog.value?.districts || [])
const route = useRoute()
const siteUrl = useRuntimeConfig().public.siteUrl

function querySlug(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function comparisonName(name: string): string {
  return name.replace(/ School District$/, '')
}

const selectedComparison = computed(() => {
  const leftSlug = querySlug(route.query.left)
  const rightSlug = querySlug(route.query.right)
  if (!leftSlug || !rightSlug || leftSlug === rightSlug) return null

  const isComparable = (district: typeof districts.value[number]) => district.calendarPages.some(page =>
    page.indexable && page.schoolYear === currentSchoolYear,
  )
  const left = districts.value.find(district => district.slug === leftSlug && isComparable(district))
  const right = districts.value.find(district => district.slug === rightSlug && isComparable(district))
  if (!left || !right) return null

  return {
    left: comparisonName(left.name),
    right: comparisonName(right.name),
    leftSlug: left.slug,
    rightSlug: right.slug,
  }
})
const canonicalPath = computed(() => {
  const selection = selectedComparison.value
  if (!selection) return '/compare/'
  const query = new URLSearchParams({ left: selection.leftSlug, right: selection.rightSlug })
  return '/compare/?' + query.toString()
})
const formattedSchoolYear = formatSchoolYear(currentSchoolYear)
const pageTitle = computed(() => selectedComparison.value
  ? `${selectedComparison.value.left} vs ${selectedComparison.value.right} Calendar ${formattedSchoolYear}`
  : `${formattedSchoolYear} Florida School Calendar Comparison | FL School Calendar`)
const pageDescription = computed(() => selectedComparison.value
  ? `Compare ${selectedComparison.value.left} and ${selectedComparison.value.right} ${formattedSchoolYear} school calendar dates: first and last days, winter break, spring break, and exact differences.`
  : 'Search for two Florida school districts and compare official first days, last days, winter break, spring break, and exact calendar-day differences.')
const pageHeading = computed(() => selectedComparison.value
  ? `${selectedComparison.value.left} vs ${selectedComparison.value.right} Calendar Comparison`
  : 'Compare two school district calendars')
const compareFaqs: CalendarFaqItem[] = [
  {
    question: 'How is the number of days between two district dates calculated?',
    answer: 'The comparison uses calendar days between the dates printed in each district’s published calendar. For example, if one first day is September 8 and the other is September 10, the result is a two-calendar-day difference. Weekends and holidays are not removed, so the result should not be read as a difference in instructional days.',
  },
  {
    question: 'Does a longer first-to-last-day span mean students attend more days?',
    answer: 'No. The span counts every calendar day from the published first day through the published last day, inclusive. A district may have a longer span because of different recess dates, conference days, religious observances, snow-day planning, or grade-specific schedules. Families should use the span as a planning comparison and consult the official calendar for instructional-day details.',
  },
  {
    question: 'Why can winter or spring break have more than one difference?',
    answer: 'A break is a date range, so the tool compares its start date, end date, and inclusive calendar-day duration. Two districts might begin winter recess on the same day but return on different days, or use the same number of days at different points in the month. The result column explains each boundary separately instead of reducing the range to one potentially misleading number.',
  },
  {
    question: 'What happens when a district has not published one of the comparison items?',
    answer: 'The cell is marked Not published and the row is treated as missing data, not as a match or a zero-day difference. FL School Calendar does not copy a nearby district’s dates or project dates from a previous school calendar. Parents should open the linked district page and official source, especially when arranging child care or travel around an unreported recess.',
  },
  {
    question: 'Are the two calendars compared for the same school calendar?',
    answer: `Yes. Both selectors are limited to published, indexable ${formatSchoolYear(currentSchoolYear)} records. Historical calendars are not mixed into the current comparison. The status and checked date shown for each district help families see whether the underlying record is official, revised, or otherwise qualified before relying on a result.`,
  },
  {
    question: 'Can the comparison replace the official district calendar?',
    answer: 'No. This page is a planning aid that normalizes a small set of commonly requested dates. Districts may revise calendars after weather closures, board action, or operational changes, and grade-specific start or dismissal rules may not fit a single comparison row. Use each district-name link to review its full calendar, source PDF, verification date, notes, and revisions before making final plans.',
  },
]

useSiteSeo({
  title: pageTitle,
  description: pageDescription,
  path: canonicalPath,
  appendSiteName: false,
  schema: computed(() => ({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        name: pageTitle.value,
        url: absoluteUrl(siteUrl, canonicalPath.value),
        description: pageDescription.value,
      },
      {
        '@type': 'FAQPage',
        mainEntity: compareFaqs.map(item => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://flschoolcalendar.com/' },
          { '@type': 'ListItem', position: 2, name: 'Compare', item: 'https://flschoolcalendar.com/compare/' },
        ],
      },
    ],
  })),
})
</script>

<template>
  <PageIntroSection
    :breadcrumbs="[{ label: 'Home', href: '/' }, { label: 'Compare' }]"
    eyebrow="Side-by-side planning tool"
    :title="pageHeading"
    :lead="`Search for two districts with published ${formatSchoolYear(currentSchoolYear)} calendars. Differences are highlighted and calculated in calendar days; matching items are marked Same.`"
    class-name="compare-hero"
  />
  <CompareCalendarTool :districts="districts" :school-year="currentSchoolYear" />
  <CompareHowItWorks :school-year="currentSchoolYear" />
  <CompareMethodSection />
  <CalendarFaqSection :items="compareFaqs" surface />
</template>
