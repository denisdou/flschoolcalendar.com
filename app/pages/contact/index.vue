<script setup lang="ts">
definePageMeta({ layout: 'default' })

const contactEmail = 'corrections@flschoolcalendar.com'
const correctionHref = 'mailto:corrections@flschoolcalendar.com?subject=Calendar%20correction'
const privacyHref = 'mailto:corrections@flschoolcalendar.com?subject=Privacy%20request'
const sourceHref = 'mailto:corrections@flschoolcalendar.com?subject=District%20or%20calendar%20source'

useSiteSeo({
  title: 'Contact FL School Calendar',
  description: 'Report a school calendar error, share a newer official district source, suggest a missing calendar, or make a privacy request.',
  path: '/contact/',
})
</script>

<template>
  <PageIntroSection
    :breadcrumbs="[{ label: 'Home', href: '/' }, { label: 'Contact' }]"
    eyebrow="Contact"
    title="Contact FL School Calendar"
    lead="Report a date that needs checking, share an official calendar we are missing, or contact us about privacy."
  />
  <ContactChannelsSection
    :correction-href="correctionHref"
    :privacy-href="privacyHref"
    :source-href="sourceHref"
  />
  <ContactGuidanceSection :email="contactEmail" />
</template>
