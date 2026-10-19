<script setup lang="ts">
import type {
  DistrictCatalogEntry,
  HomepageFeaturedCalendar,
} from '~~/shared/types/content'
import { calendarRouteSlug, districtCalendarHref, formatSchoolYear } from '~~/shared/utils/content'

const props = defineProps<{
  districts: DistrictCatalogEntry[]
  featured: HomepageFeaturedCalendar | null
  schoolYear: string
}>()

const quickLinks = computed(() => props.districts
  .filter(district => district.calendarPages.some(page =>
    page.indexable && page.schoolYear === props.schoolYear,
  ))
  .slice(0, 5))
const featuredHref = computed(() => props.featured
  ? `/${props.featured.district.slug}/${calendarRouteSlug(props.featured.calendar)}/`
  : '/#districts',
)
</script>

<template>
  <section class="page-section home-hero-section">
    <div class="site-container home-hero" aria-labelledby="home-heading">
      <div class="home-hero-copy">
        <p class="eyebrow home-hero-eyebrow"><span aria-hidden="true">★</span> The Florida school year, made clearer</p>
        <h1 id="home-heading">Plan the {{ formatSchoolYear(schoolYear) }} Florida school year</h1>
        <p class="home-hero-lead">
          Find calendars from Florida public school districts—from the first bell
          to fall break, winter holidays, spring break, and the last day of school.
          Every published calendar links back to its district source.
        </p>

        <ul class="home-hero-highlights" aria-label="Calendar information available">
          <li>District-published sources</li>
          <li>Key dates and school breaks</li>
          <li>Revisions and calendar status</li>
        </ul>

        <div class="home-hero-cta">
          <NuxtLink class="button button--primary" :to="featuredHref">
            {{ featured ? `View ${featured.district.shortName} Calendar ${formatSchoolYear(featured.calendar.schoolYear)}` : 'Explore Florida district calendars' }}
          </NuxtLink>

          <div class="home-search-block">
            <DistrictSearch
              :districts="districts"
              :school-year="schoolYear"
              label="Search published Florida district calendars"
              hide-label
            />
          </div>
        </div>

        <nav v-if="quickLinks.length" class="home-quick-links" aria-label="Available district calendars">
          <span>Available now</span>
          <ul>
            <li v-for="district in quickLinks" :key="district.slug">
              <NuxtLink :to="districtCalendarHref(district, schoolYear)">{{ district.shortName }}</NuxtLink>
            </li>
          </ul>
        </nav>
      </div>

      <aside class="home-florida-card" aria-label="Florida public school calendar guide">
        <div class="home-florida-card-topline">
          <span aria-hidden="true">★</span>
          <span>Sunshine State school year</span>
        </div>
        <img
          src="/android-chrome-512x512.png"
          alt=""
          width="512"
          height="512"
          aria-hidden="true"
        >
        <div class="home-florida-card-copy">
          <strong>Local calendars. One Florida guide.</strong>
          <span>{{ formatSchoolYear(schoolYear) }} district dates and official sources for families across the state.</span>
        </div>
      </aside>
    </div>
  </section>
</template>
