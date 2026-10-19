<script setup lang="ts">
import { FOOTER_CALENDAR_DISTRICTS } from '~~/shared/config/site'

const runtimeConfig = useRuntimeConfig()
const currentSchoolYear = useCurrentSchoolYear()
const currentYear = String(runtimeConfig.public.siteBuildDate).slice(0, 4)
const { data: catalog } = await useDistrictCatalog()

const featuredCalendarLinks = computed(() =>
  FOOTER_CALENDAR_DISTRICTS.flatMap(({ slug, label }) => {
    const district = (catalog.value?.districts || []).find(item => item.slug === slug)
    const calendar = district?.calendarPages.find(page =>
      page.indexable && page.schoolYear === currentSchoolYear,
    )

    return calendar
      ? [{
          label: `${label} Calendar ${calendar.schoolYear}`,
          href: calendar.href,
        }]
      : []
  }),
)
</script>

<template>
  <footer class="site-footer">
    <div class="site-container">
      <div class="footer-grid">
        <section>
          <NuxtLink class="brand" to="/">
            <img
              class="brand-mark"
              src="/flschoolcalendar-logo.webp"
              alt=""
              width="512"
              height="512"
              loading="lazy"
              aria-hidden="true"
            >
            <span>FL School Calendar</span>
          </NuxtLink>
          <p class="footer-summary">
            A parent-friendly directory of Florida public school district
            calendars, official sources, date comparisons, and ICS downloads.
          </p>
        </section>

        <section>
          <h2 class="footer-heading">Explore</h2>
          <ul class="footer-links">
            <li><NuxtLink to="/#districts">Districts</NuxtLink></li>
            <li><NuxtLink to="/compare/">Compare</NuxtLink></li>
            <li v-for="calendar in featuredCalendarLinks" :key="calendar.href">
              <NuxtLink :to="calendar.href">{{ calendar.label }}</NuxtLink>
            </li>
          </ul>
        </section>

        <section>
          <h2 class="footer-heading">Data &amp; trust</h2>
          <ul class="footer-links">
            <li><NuxtLink to="/data-sources/">Data sources</NuxtLink></li>
            <li><NuxtLink to="/methodology/">Methodology</NuxtLink></li>
            <li><NuxtLink to="/updates/">Updates</NuxtLink></li>
          </ul>
        </section>

        <section>
          <h2 class="footer-heading">About</h2>
          <ul class="footer-links">
            <li><NuxtLink to="/about/">About FL School Calendar</NuxtLink></li>
            <li><a href="mailto:corrections@flschoolcalendar.com">Report an error</a></li>
          </ul>
        </section>
      </div>

      <div class="footer-bottom">
        <span>© {{ currentYear }} FL School Calendar</span>
        <nav class="footer-legal-links" aria-label="Legal and contact links">
          <NuxtLink to="/privacy/">Privacy</NuxtLink>
          <span aria-hidden="true">·</span>
          <NuxtLink to="/terms/">Terms</NuxtLink>
          <span aria-hidden="true">·</span>
          <NuxtLink to="/contact/">Contact</NuxtLink>
        </nav>
        <span>Independent calendar reference. Always verify changes with the district.</span>
      </div>
    </div>
  </footer>
</template>
