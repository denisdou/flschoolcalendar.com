<script setup lang="ts">
import type {
  DistrictCalendar,
  DistrictCatalogEntry,
  DistrictIdentity,
} from '~~/shared/types/content'
import {
  buildCalendarComparison,
  hasUsefulCalendarDifferences,
} from '~~/shared/utils/calendarComparison'
import { calendarRouteSlug, districtCalendarHref, formatCalendarLabel, formatDateRange, formatSchoolYear } from '~~/shared/utils/content'

const props = defineProps<{
  district: DistrictIdentity
  calendar: DistrictCalendar
  nearbyDistricts: DistrictCatalogEntry[]
  otherDistricts: DistrictCatalogEntry[]
}>()

type CalendarPage = DistrictCatalogEntry['calendarPages'][number]

type NearbyCalendarItem = {
  district: DistrictCatalogEntry
  calendar: CalendarPage
  canCompare: boolean
}

const currentCalendarPage = computed<CalendarPage>(() => ({
  schoolYear: props.calendar.schoolYear,
  routeSlug: calendarRouteSlug(props.calendar),
  calendarLabel: props.calendar.calendarLabel || null,
  href: `/${props.district.slug}/${calendarRouteSlug(props.calendar)}/`,
  status: props.calendar.status,
  indexable: props.calendar.indexable,
  createdAt: props.calendar.createdAt,
  verifiedAt: props.calendar.verifiedAt,
  contentUpdatedAt: props.calendar.contentUpdatedAt,
  firstDay: props.calendar.firstDay,
  lastDay: props.calendar.lastDay,
  keyDates: props.calendar.keyDates,
}))

function calendarFor(district: DistrictCatalogEntry): CalendarPage | null {
  return district.calendarPages.find(page =>
    page.indexable && page.schoolYear === props.calendar.schoolYear,
  ) || null
}

const nearbyItems = computed<NearbyCalendarItem[]>(() => props.nearbyDistricts.flatMap((district) => {
  const calendar = calendarFor(district)
  if (!calendar) return []

  const comparison = buildCalendarComparison(
    props.district.shortName,
    currentCalendarPage.value,
    district.shortName,
    calendar,
  )

  return [{
    district,
    calendar,
    canCompare: hasUsefulCalendarDifferences(comparison),
  }]
}))

const otherItems = computed(() => props.otherDistricts.flatMap((district) => {
  const calendar = calendarFor(district)
  return calendar ? [{ district, calendar }] : []
}))
</script>

<template>
  <div
    v-if="nearbyItems.length || otherItems.length"
    id="related-calendars"
    aria-labelledby="related-calendars-heading"
  >
    <div class="section-heading">
      <div>
        <p class="eyebrow">Related calendars</p>
        <h2 id="related-calendars-heading">Related school calendars</h2>
      </div>
      <span class="section-heading-meta">{{ formatCalendarLabel(calendar) }}</span>
    </div>

    <div v-if="nearbyItems.length" class="related-calendar-group">
      <div class="related-calendar-group-heading">
        <h3>Nearby school calendars</h3>
        <p>
          Compare {{ district.shortName }} with published {{ formatSchoolYear(calendar.schoolYear) }} calendars in {{ district.region }}.
        </p>
      </div>

      <div class="link-grid">
        <article
          v-for="item in nearbyItems"
          :key="item.district.slug"
          class="link-card related-calendar-card"
        >
          <div>
            <span class="metadata-label">{{ item.district.county }} · {{ item.district.region }}</span>
            <h3>{{ item.district.name }}</h3>
            <dl class="related-calendar-dates">
              <div>
                <dt>First day</dt>
                <dd>
                  <time :datetime="item.calendar.firstDay || undefined">
                    {{ formatDateRange(item.calendar.firstDay, null) }}
                  </time>
                </dd>
              </div>
              <div>
                <dt>Last day</dt>
                <dd>
                  <time :datetime="item.calendar.lastDay || undefined">
                    {{ formatDateRange(item.calendar.lastDay, null) }}
                  </time>
                </dd>
              </div>
            </dl>
          </div>

          <div class="related-calendar-actions">
            <NuxtLink
              v-if="item.canCompare"
              class="button button--secondary"
              :to="{
                path: '/compare/',
                query: { left: district.slug, right: item.district.slug },
              }"
            >
              Compare calendars
            </NuxtLink>
            <NuxtLink class="text-link" :to="item.calendar.href">
              View {{ item.district.name }} {{ formatSchoolYear(item.calendar.schoolYear) }} calendar →
            </NuxtLink>
          </div>
        </article>
      </div>
    </div>

    <div v-if="otherItems.length" class="related-calendar-group">
      <div class="related-calendar-group-heading">
        <h3>More {{ formatSchoolYear(calendar.schoolYear) }} Florida calendars</h3>
      </div>

      <div class="link-grid">
        <NuxtLink
          v-for="item in otherItems"
          :key="item.district.slug"
          class="link-card"
          :to="districtCalendarHref(item.district, calendar.schoolYear)"
        >
          <div>
            <span class="metadata-label">{{ item.district.county }} · {{ item.district.region }}</span>
            <h3>{{ item.district.name }}</h3>
            <dl class="related-calendar-dates">
              <div>
                <dt>First day</dt>
                <dd>
                  <time :datetime="item.calendar.firstDay || undefined">
                    {{ formatDateRange(item.calendar.firstDay, null) }}
                  </time>
                </dd>
              </div>
              <div>
                <dt>Last day</dt>
                <dd>
                  <time :datetime="item.calendar.lastDay || undefined">
                    {{ formatDateRange(item.calendar.lastDay, null) }}
                  </time>
                </dd>
              </div>
            </dl>
          </div>
          <span class="text-link">
            View {{ item.district.name }} {{ formatSchoolYear(item.calendar.schoolYear) }} calendar →
          </span>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
