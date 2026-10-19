<script setup lang="ts">
defineProps<{
  schoolYear: string
  districtCount: number
  regionCount: number
}>()
</script>

<template>
  <section id="home-about-hub" class="page-section calendar-section--surface">
    <div class="site-container" aria-labelledby="home-about-hub-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">About the hub</p>
        <h2 id="home-about-hub-heading">What FL School Calendar is built to do</h2>
      </div>
      <NuxtLink class="text-link" to="/about/">About this project →</NuxtLink>
    </div>

    <div class="home-about-layout">
      <div class="home-about-copy">
        <p>
          FL School Calendar is an independent calendar reference for families
          navigating Florida's locally managed school schedules. The hub
          turns published district calendars into a consistent, readable
          format so parents and guardians can quickly find school-calendar
          boundaries, recesses, holidays, no-school dates, testing context,
          source documents, and revision status without decoding a different
          PDF layout for every district.
        </p>
        <p>
          Coverage is publication-led rather than predictive. A district
          appears only after a source-backed school-calendar record is ready, so
          the directory may not yet include every Florida district. Each
          calendar page identifies the material used and explains whether the
          record is official, revised, historical, or still unavailable.
          Because boards, weather events, and emergency closures can change a
          calendar after publication, families should use this hub for
          planning and confirm time-sensitive changes with their school or
          district.
        </p>
      </div>

      <dl class="home-about-facts">
        <div>
          <dt>Current school calendar</dt>
          <dd>{{ schoolYear.replace('-', '–') }}</dd>
        </div>
        <div>
          <dt>Published calendars</dt>
          <dd>{{ districtCount }} districts</dd>
        </div>
        <div>
          <dt>Active coverage</dt>
          <dd>{{ regionCount }} regions</dd>
        </div>
      </dl>
    </div>
    </div>
  </section>
</template>
