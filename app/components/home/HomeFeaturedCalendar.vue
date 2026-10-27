<script setup lang="ts">
import type { HomepageFeaturedCalendar, KeyDate } from '~~/shared/types/content'
import { calendarPdfDownloadUrl } from '~~/shared/utils/calendarPdf'
import { calendarRouteSlug, formatCalendarLabel, formatDateRange } from '~~/shared/utils/content'

const props = defineProps<{
  featured: HomepageFeaturedCalendar | null
}>()

const preferredTypeGroups: KeyDate['eventType'][][] = [
  ['FIRST_DAY', 'CALENDAR_START'],
  ['WINTER_BREAK'],
  ['SPRING_BREAK'],
  ['LAST_DAY', 'CALENDAR_END'],
]
const featuredDates = computed(() => preferredTypeGroups
  .map(types => props.featured?.calendar.keyDates.find(date => types.includes(date.eventType)))
  .filter((date): date is KeyDate => Boolean(date)),
)
const calendarHref = computed(() => props.featured
  ? `/${props.featured.district.slug}/${calendarRouteSlug(props.featured.calendar)}/`
  : '/#districts',
)
</script>

<template>
  <section class="page-section home-feature-section">
    <div v-if="featured" class="site-container home-feature" aria-labelledby="featured-calendar-heading">
      <div class="home-feature-header">
        <div>
          <div class="home-feature-kicker">
            <span class="eyebrow">Featured official calendar</span>
            <StatusBadge :status="featured.calendar.status" />
          </div>
          <h2 id="featured-calendar-heading">
            {{ featured.district.name }} {{ formatCalendarLabel(featured.calendar) }}
          </h2>
          <p>{{ featured.summary }}</p>
        </div>
        <div class="home-feature-actions">
          <NuxtLink class="button button--primary" :to="calendarHref">Open calendar</NuxtLink>
          <a
            class="button button--secondary"
            :href="calendarPdfDownloadUrl(featured.district, featured.calendar)"
            target="_blank"
            rel="noopener noreferrer"
          >
            Download PDF
          </a>
        </div>
      </div>

      <dl class="home-feature-dates">
        <div v-for="date in featuredDates" :key="date.label">
          <dt>{{ date.label }}</dt>
          <dd>
            <time :datetime="date.dateStart">{{ formatDateRange(date.dateStart, date.dateEnd) }}</time>
          </dd>
        </div>
      </dl>

      <div class="home-feature-footer">
        <span>{{ featured.district.county }} · {{ featured.district.region }}</span>
        <span v-if="featured.calendar.verifiedAt">
          Verified
          <time :datetime="featured.calendar.verifiedAt">
            {{ formatDateRange(featured.calendar.verifiedAt, null) }}
          </time>
        </span>
      </div>
    </div>
    <div v-else class="site-container">
      <EmptyState
        title="The Florida calendar directory is being prepared"
        description="The first featured calendar will appear after its dates and official district sources pass review."
      />
    </div>
  </section>
</template>
