<script setup lang="ts">
import type { DistrictCatalogEntry, LinkItem } from '~~/shared/types/content'
import { districtCalendarHref, formatDateRange, formatSchoolYear } from '~~/shared/utils/content'

const props = withDefaults(defineProps<{
  sectionId?: string
  eyebrow?: string
  title?: string
  districtLabel?: string
  links?: LinkItem[]
  districts?: DistrictCatalogEntry[]
  schoolYear?: string
}>(), {
  sectionId: 'related-resources',
  eyebrow: 'Continue browsing',
  districtLabel: 'Published district',
  links: () => [],
  districts: () => [],
  schoolYear: undefined,
})

function relatedDistrictHref(district: DistrictCatalogEntry): string {
  return districtCalendarHref(district, props.schoolYear)
}

function relatedCalendar(district: DistrictCatalogEntry) {
  return district.calendarPages.find(page =>
    page.indexable && (!props.schoolYear || page.schoolYear === props.schoolYear),
  ) || district.calendarPages.find(page => page.indexable)
}
</script>

<template>
  <div
    v-if="links.length || districts.length"
    :id="sectionId"
    :aria-labelledby="sectionId + '-heading'"
  >
    <div class="section-heading">
      <div>
        <p class="eyebrow">{{ eyebrow }}</p>
        <h2 :id="sectionId + '-heading'">{{ title || 'Related calendar resources' }}</h2>
      </div>
    </div>
    <div class="link-grid">
      <NuxtLink
        v-for="district in districts"
        :key="'district-' + district.slug"
        class="link-card"
        :to="relatedDistrictHref(district)"
      >
        <div>
          <span class="metadata-label">{{ districtLabel }}</span>
          <h3>{{ district.name }}</h3>
          <p>{{ district.county }} · {{ district.region }}</p>
          <dl v-if="relatedCalendar(district)" class="related-calendar-dates">
            <div>
              <dt>First day</dt>
              <dd>
                <time :datetime="relatedCalendar(district)?.firstDay || undefined">
                  {{ formatDateRange(relatedCalendar(district)?.firstDay || null, null) }}
                </time>
              </dd>
            </div>
            <div>
              <dt>Last day</dt>
              <dd>
                <time :datetime="relatedCalendar(district)?.lastDay || undefined">
                  {{ formatDateRange(relatedCalendar(district)?.lastDay || null, null) }}
                </time>
              </dd>
            </div>
          </dl>
        </div>
        <span class="text-link">
          View {{ schoolYear ? formatSchoolYear(schoolYear) : 'calendar' }} →
        </span>
      </NuxtLink>
      <template
        v-for="link in links"
        :key="'resource-' + link.href"
      >
        <a
          v-if="link.external"
          class="link-card"
          :href="link.href"
          target="_blank"
          rel="noopener noreferrer"
        >
          <div>
            <h3>{{ link.label }}</h3>
            <p v-if="link.description">{{ link.description }}</p>
          </div>
          <span class="text-link">View official source →</span>
        </a>
        <NuxtLink v-else class="link-card" :to="link.href">
          <div>
            <h3>{{ link.label }}</h3>
            <p v-if="link.description">{{ link.description }}</p>
          </div>
          <span class="text-link">Explore →</span>
        </NuxtLink>
      </template>
    </div>
  </div>
</template>
