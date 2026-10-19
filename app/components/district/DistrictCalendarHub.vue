<script setup lang="ts">
import type { DistrictRecord } from '~~/shared/types/content'
import { calendarRouteSlug, formatCalendarLabel, formatDateRange } from '~~/shared/utils/content'
import CalendarFaq from '../calendar/CalendarFaq.vue'
import PageIntroSection from '../content/PageIntroSection.vue'
import RelatedResources from '../content/RelatedResources.vue'

const props = defineProps<{ record: DistrictRecord }>()
const hubPath = computed(() => `/${props.record.district.slug}/`)
const calendars = computed(() => Object.values(props.record.schoolYears)
  .filter(calendar => calendar.indexable)
  .sort((a, b) => a.schoolYear.localeCompare(b.schoolYear)))
const resources = computed(() => props.record.page.relatedResources.filter(link => link.href !== hubPath.value))
</script>

<template>
  <PageIntroSection
    :breadcrumbs="[{ label: 'Home', href: '/' }, { label: record.page.heading }]"
    :eyebrow="record.page.eyebrow"
    :title="record.page.heading"
    :lead="record.page.summary"
  />

  <section class="page-section calendar-section">
    <div class="site-container">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Published calendars</p>
          <h2>Choose a school year</h2>
        </div>
      </div>
      <div class="link-grid">
        <NuxtLink
          v-for="calendar in calendars"
          :key="calendarRouteSlug(calendar)"
          class="link-card"
          :to="hubPath + calendarRouteSlug(calendar) + '/'"
        >
          <div>
            <h3>{{ formatCalendarLabel(calendar) }}</h3>
            <p>
              First day: {{ formatDateRange(calendar.firstDay, null) }}<br>
              Last day: {{ formatDateRange(calendar.lastDay, null) }}
            </p>
          </div>
          <span class="text-link">View holidays, breaks &amp; school hours →</span>
        </NuxtLink>
      </div>
    </div>
  </section>

  <section v-if="record.page.faqs?.length" class="page-section calendar-section">
    <div class="site-container">
      <CalendarFaq :items="record.page.faqs" :heading="record.district.shortName + ' calendar questions'" />
    </div>
  </section>

  <section v-if="resources.length" class="page-section calendar-section calendar-section--surface">
    <div class="site-container">
      <RelatedResources :links="resources" title="Official calendar resources" />
    </div>
  </section>
</template>
