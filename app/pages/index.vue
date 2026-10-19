<script setup lang="ts">
import type { CalendarFaqItem } from '~~/shared/types/content'

definePageMeta({ layout: 'default' })

const currentSchoolYear = useCurrentSchoolYear()
const { data: catalog } = await useDistrictCatalog()
const { data: featured } = await useHomepageFeaturedCalendar()
const districts = computed(() => catalog.value?.districts || [])
const currentYearDistricts = districts.value.filter(district =>
  district.calendarPages.some(page => page.indexable && page.schoolYear === currentSchoolYear),
)
const districtCount = currentYearDistricts.length
const regionCount = new Set(currentYearDistricts.map(district => district.regionSlug)).size

const homeFaqs: CalendarFaqItem[] = [
  {
    question: 'What is FL School Calendar?',
    answer: `FL School Calendar is an independent directory that organizes published Florida public school district calendars into a consistent format. It helps families find ${currentSchoolYear.replace('-', '–')} dates, understand calendar status, compare districts, and return to the district materials used as sources. It is not a school district, the Florida Department of Education, or an emergency notification service.`,
  },
  {
    question: 'Are the calendar dates on this site official?',
    answer: 'Every published district page is tied to official district material and is labeled by status, such as official, revised, or historical. An official label means the record was prepared from an official source; it does not mean the calendar can never change. Weather closures, board action, or local operational decisions may occur after verification, so families should confirm late changes directly with the district.',
  },
  {
    question: `Which districts are included for ${currentSchoolYear.replace('-', '–')}?`,
    answer: `The homepage currently lists all ${districtCount} district calendars that have passed this hub's ${currentSchoolYear.replace('-', '–')} publication check, organized across ${regionCount} active Florida regions. Coverage expands as additional source-backed records are completed. If a district does not appear in search, that means its calendar has not been published in this directory yet—not that the district lacks an official calendar.`,
  },
  {
    question: 'How does FL School Calendar verify a district calendar?',
    answer: 'The publication workflow records the official calendar page or document, its retrieval and verification dates, normalized school-calendar events, and any known revision. Published pages expose their source links so readers can inspect the evidence directly. When a district changes an official date, the record can be updated with revision context instead of silently replacing the earlier information.',
  },
  {
    question: 'Can I compare calendars or add dates to my own calendar?',
    answer: 'Yes. The Compare page lets you select two published districts and marks matching dates, different dates, and applicable day gaps. District detail pages also provide calendar and download actions when the underlying record supports them. Treat exported files as planning copies: they do not update automatically if a district later revises its calendar.',
  },
  {
    question: 'Does the hub cover charter schools, private schools, and every statewide exam date?',
    answer: 'The directory is organized around published Florida public school district calendars. A charter, private, religious, or specialized school may follow a different schedule even when it is located inside the same district boundary. State testing dates are included only when they appear on the district calendar; families should use their own school communications for student-specific exams, attendance, transportation, and dismissal details.',
  },
]

useSiteSeo({
  title: 'Florida School District Calendars | FL School Calendar',
  description: 'Find verified public school district calendars across Florida, including first day, last day, holidays, breaks, revisions, and official sources.',
  path: '/',
  schema: {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        name: 'FL School Calendar',
        url: 'https://flschoolcalendar.com/',
      },
      {
        '@type': 'Organization',
        name: 'FL School Calendar',
        url: 'https://flschoolcalendar.com/',
        logo: {
          '@type': 'ImageObject',
          url: 'https://flschoolcalendar.com/flschoolcalendar-mark.svg',
        },
      },
      {
        '@type': 'FAQPage',
        mainEntity: homeFaqs.map(item => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer,
          },
        })),
      },
    ],
  },
})
</script>

<template>
  <HomeSearchHero
    :districts="districts"
    :featured="featured || null"
    :school-year="currentSchoolYear"
  />
  <HomeFeaturedCalendar :featured="featured || null" />
  <HomeDistrictList :districts="districts" :school-year="currentSchoolYear" />
  <HomeHowItWorks />
  <HomeAboutHub
    :school-year="currentSchoolYear"
    :district-count="districtCount"
    :region-count="regionCount"
  />
  <HomeTrustBand />
  <CalendarFaqSection :items="homeFaqs" surface />
</template>
