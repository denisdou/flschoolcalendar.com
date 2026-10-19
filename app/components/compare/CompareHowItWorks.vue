<script setup lang="ts">
import { formatSchoolYear } from '~~/shared/utils/content'

defineProps<{ schoolYear: string }>()
</script>

<template>
  <section class="page-section calendar-section--surface" aria-labelledby="compare-how-heading">
    <div class="site-container">
      <div class="section-heading">
        <div>
          <p class="eyebrow">How it works</p>
          <h2 id="compare-how-heading">From official calendars to a readable difference</h2>
        </div>
      </div>
      <ol class="comparison-how-grid">
        <li>
          <span>01</span>
          <h3>Choose the same school calendar</h3>
          <p>The selectors only include districts with a published {{ formatSchoolYear(schoolYear) }} record, so dates from different years cannot be mixed.</p>
        </li>
        <li>
          <span>02</span>
          <h3>Normalize common dates</h3>
          <p>First day, last day, and major recess ranges are matched by event type even when districts use slightly different names.</p>
        </li>
        <li>
          <span>03</span>
          <h3>Calculate and qualify</h3>
          <p>Each boundary is compared in calendar days. Equal values say Same; differences are highlighted; missing values are never estimated.</p>
        </li>
      </ol>
    </div>
  </section>
</template>
