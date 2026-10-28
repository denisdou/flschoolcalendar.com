<script setup lang="ts">
definePageMeta({ layout: 'default' })

const siteUpdatedAt = formatLongDate(String(useRuntimeConfig().public.siteBuildDate))

const sections = [
  {
    title: 'Using this site means accepting these Terms',
    paragraphs: [
      'These Terms of Use apply to flschoolcalendar.com, its district calendar pages, comparison tool, public JSON responses, ICS files, and links to third-party calendar services. By using the site, you agree to these Terms and the Privacy Policy. If you do not agree, please do not use the site.',
    ],
  },
  {
    title: 'FL School Calendar is an independent planning reference',
    paragraphs: [
      'FL School Calendar is not affiliated with, endorsed by, or operated by the Florida Department of Education, a county school board, a school district, or a school. District names identify the public calendars being summarized and do not imply sponsorship.',
      'The site organizes dates from official district materials, but it is not an official notice service. A district may revise its calendar after our checked date, and emergency closures or campus-specific changes may not appear here. Confirm important dates, exact times, and same-day changes with the district or school before making attendance, childcare, travel, or work arrangements.',
    ],
  },
  {
    title: 'Calendar pages, downloads, and subscriptions',
    paragraphs: [
      'Calendar pages and comparison results are provided for general information and planning. The official PDF or district calendar link remains the controlling source. A difference calculated by the Compare tool is a calendar-day comparison, not a legal, instructional, payroll, or attendance determination.',
      'A downloaded ICS file is a copy of the calendar at the time of download. Google Calendar and Apple Calendar links rely on third-party services and their refresh behavior. We do not guarantee that an imported or subscribed calendar will receive a correction immediately—or at all—so you should recheck the district source when a date matters.',
    ],
  },
  {
    title: 'Reasonable use is welcome',
    paragraphs: [
      'You may browse the site, link to its pages, print information for personal use, download available calendar files, and use calendar facts for family, educational, research, journalistic, or other lawful purposes.',
      'You may not misuse the site or its infrastructure. In particular, you may not:',
    ],
    items: [
      'Present FL School Calendar as an official district service or use its name and design in a way that falsely suggests endorsement.',
      'Probe for vulnerabilities, bypass access controls, interfere with normal operation, distribute malicious code, or use the contact address for spam or harassment.',
      'Run automated requests at a rate that disrupts the site or imposes an unreasonable load.',
      'Republish substantial portions of the site’s original writing, design, or compiled records as a substitute or competing copy without permission.',
      'Use the site to collect, expose, or exchange confidential student information or other unlawful material.',
    ],
  },
  {
    title: 'Public JSON and calendar files',
    paragraphs: [
      'Public JSON endpoints and ICS files are offered without a service-level commitment. File locations, fields, route structure, and update frequency may change as the project develops. If you build a tool that depends on this data, cache responsibly, preserve the source and verification context, handle missing fields, and allow for calendar variants and later corrections.',
    ],
  },
  {
    title: 'Ownership and official source materials',
    paragraphs: [
      'The site’s software, visual design, original explanatory writing, and original selection and arrangement of content are owned by or licensed to FL School Calendar. Official district documents, district names, logos, trademarks, and third-party materials remain with their respective owners.',
      'Linking to an official document or summarizing public calendar facts does not transfer ownership of that document to FL School Calendar. Nothing in these Terms is intended to limit rights available under fair use or other applicable law.',
    ],
  },
  {
    title: 'Corrections and email submissions',
    paragraphs: [
      'You may submit a calendar correction through the form or email a correction, official source, district suggestion, privacy request, or question. Do not send student education records, medical information, government identification numbers, account credentials, or other sensitive personal information.',
      'You keep any rights you have in material you send, while giving us permission to review, quote, edit, and use it as reasonably needed to investigate the request and improve the site. You must have the right to send the material. We are not required to publish every submission or respond within a particular time.',
    ],
  },
  {
    title: 'Third-party websites and services',
    paragraphs: [
      'The site links to school districts, PDF hosts, Google Calendar, Apple Calendar, and other third-party services. Those services control their own content, availability, security, accessibility, and privacy practices. A link is provided for convenience and source verification; it is not a guarantee of the third party or its content.',
    ],
  },
  {
    title: 'Availability and changes to the service',
    paragraphs: [
      'We may add, revise, remove, or suspend a page, data file, feature, or route without notice. We may also limit abusive automated traffic or other activity that threatens the site. We do not promise uninterrupted access, permanent storage of a historical calendar, or support for a particular third-party calendar application.',
    ],
  },
  {
    title: 'Disclaimer of warranties',
    paragraphs: [
      'To the fullest extent permitted by law, the site and its content are provided “as is” and “as available.” We do not warrant that every date, label, source link, export, comparison, or revision is complete, current, error-free, uninterrupted, secure, or suitable for a particular decision. Some jurisdictions do not allow certain warranty exclusions, so part of this section may not apply to you.',
    ],
  },
  {
    title: 'Limitation of liability',
    paragraphs: [
      'To the fullest extent permitted by law, FL School Calendar and its operators will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for losses arising from reliance on a date, a missed calendar update, an export, a comparison result, or a third-party service. Nothing in these Terms excludes liability that cannot legally be excluded or limits non-waivable consumer rights.',
    ],
  },
  {
    title: 'Changes to these Terms and governing law',
    paragraphs: [
      'We may update these Terms when the site or applicable requirements change. The Last updated date identifies the current version. Continued use after an update means you accept the revised Terms to the extent permitted by law.',
      'These Terms are governed by the laws of the State of Florida and applicable federal law, without regard to conflict-of-law rules, except where mandatory law requires otherwise. If one provision is found unenforceable, the remaining provisions continue in effect.',
    ],
  },
  {
    title: 'Questions about these Terms',
    paragraphs: [
      'Email corrections@flschoolcalendar.com with “Terms question” in the subject line. Calendar corrections and privacy requests can also be sent through the Contact page.',
    ],
  },
]

useSiteSeo({
  title: 'Terms of Use',
  description: 'Terms for using FL School Calendar pages, district comparisons, public JSON, source links, and ICS calendar downloads.',
  path: '/terms/',
})
</script>

<template>
  <FrameworkPage
    breadcrumb-label="Terms"
    eyebrow="Terms of use"
    title="Terms of Use"
    lead="The conditions that apply when you browse, download, compare, or reuse information from FL School Calendar."
    :notice="`Last updated ${siteUpdatedAt}. These Terms do not limit rights that cannot be waived under applicable law.`"
    :sections="sections"
  />
</template>
