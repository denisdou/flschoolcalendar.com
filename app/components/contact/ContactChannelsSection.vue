<script setup lang="ts">
defineProps<{
  correctionHref: string
  privacyHref: string
  sourceHref: string
}>()
</script>

<template>
  <section class="page-section page-section--tight">
    <div class="site-container link-grid">
      <article class="link-card">
        <span class="eyebrow">Calendar data</span>
        <h2>Report a correction</h2>
        <p>Include the district, school calendar, page URL, date that appears wrong, and an official district source showing the change.</p>
        <a class="text-link" :href="correctionHref">Email a calendar correction</a>
      </article>

      <article class="link-card">
        <span class="eyebrow">Missing coverage</span>
        <h2>Share an official calendar</h2>
        <p>Send the district, school year, calendar type, official calendar page, and direct PDF link. A district-controlled source lets us verify the schedule.</p>
        <a class="text-link" :href="sourceHref">Email a calendar source</a>
      </article>

      <article class="link-card">
        <span class="eyebrow">Privacy</span>
        <h2>Make a privacy request</h2>
        <p>Describe what you want us to review and your state or country of residence. Do not send student records or identity documents unless we first provide a safe verification method.</p>
        <a class="text-link" :href="privacyHref">Email a privacy request</a>
      </article>
    </div>
  </section>
</template>
