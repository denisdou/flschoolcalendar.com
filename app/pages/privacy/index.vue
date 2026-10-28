<script setup lang="ts">
definePageMeta({ layout: 'default' })

const siteUpdatedAt = formatLongDate(String(useRuntimeConfig().public.siteBuildDate))

const cards = [
  {
    title: 'No user accounts',
    description: 'Calendar search, district pages, comparisons, and downloads work without registration or a profile.',
    meta: 'Current site',
  },
  {
    title: 'Website analytics',
    description: 'The production site uses Google Analytics 4 to understand page visits and improve the calendar directory.',
    meta: 'Current configuration',
  },
  {
    title: 'Corrections you choose to send',
    description: 'Calendar correction forms send your message and optional reply address. Contact links also let you email us directly.',
    meta: 'Voluntary contact',
  },
]

const sections = [
  {
    title: 'Scope and who we are',
    paragraphs: [
      'This Privacy Policy applies to flschoolcalendar.com, including its district calendar pages, comparison tool, public JSON responses, and ICS downloads. FL School Calendar is an independent calendar reference and is not part of the Florida Department of Education, a school district, or a school.',
      'This policy describes the site as it operates today. It does not cover school districts, document hosts, Google, Apple, or other websites and services opened from our pages; their own privacy policies apply when you use them.',
    ],
  },
  {
    title: 'Information you can use without giving us',
    paragraphs: [
      'You do not need an account to search districts, browse calendar pages, compare two districts, open an official source, or download an ICS file. The site does not offer user profiles, comments, checkout, payments, or a place to upload student records.',
      'District search and comparison controls run in the browser. Homepage keyword, region, and county filters are temporary and are not written into the page URL. Comparison choices may appear in the URL so a comparison can be revisited or shared. Do not put a name, email address, student identifier, or other sensitive information into a search field or URL.',
    ],
  },
  {
    title: 'Technical information processed when you visit',
    paragraphs: [
      'Like most websites, our hosting, delivery, and security infrastructure may process standard request information such as an IP address, requested page, date and time, referring page, browser, device, and error or security details. This information is used to deliver the site, diagnose failures, and protect it from abuse.',
      'Because this is a statically generated site, calendar browsing does not create a district-calendar account or save a personal planning profile on our server.',
    ],
  },
  {
    title: 'Cookies and analytics choices',
    paragraphs: [
      'When enabled, the production site uses Google Analytics 4 to understand page visits and site usage. The Google tag sends information such as page URLs, referring pages, and browser and device information to Google and may use first-party cookies to distinguish visitors and sessions.',
      'You can use browser controls or content blockers to limit cookies and third-party scripts. Google, your browser, email provider, and external calendar services handle information under their own privacy policies.',
    ],
  },
  {
    title: 'Email and correction requests',
    paragraphs: [
      'Calendar pages offer a correction form. When you submit it, we receive your message, the calendar page URL, district, school year and any reply email address you provide. Cloudflare Turnstile checks the submission for abuse, and Resend delivers the correction email. Opening the form loads Turnstile, which may process browser, device and network information for that check.',
      'The Contact page and file-sharing links still open your email service. When you send an email through your own provider, we receive your sending address, subject line, message, links, attachments and any other information you include.',
      'Please send only what is needed to identify a calendar issue or request. Do not email student education records, medical details, Social Security numbers, government identification, passwords, or other sensitive personal information. A district name, school year, affected date, page URL, and official source link are normally enough for a correction.',
    ],
  },
  {
    title: 'How information is used',
    paragraphs: ['We use information for the limited purposes needed to operate and improve FL School Calendar.'],
    items: [
      'Deliver, secure, troubleshoot, and maintain the website, data files, and calendar downloads.',
      'Understand website usage through Google Analytics reports and improve calendar navigation and content.',
      'Investigate calendar corrections and verify newer official sources.',
      'Respond to privacy requests, questions, and other messages.',
      'Prevent abuse, protect rights and safety, and comply with applicable legal obligations.',
    ],
  },
  {
    title: 'When information may be shared',
    paragraphs: [
      'Information may be processed by providers that host, deliver, secure, or support the site and email. Cloudflare Turnstile checks correction forms for abuse; Resend processes submitted correction messages and optional reply addresses to deliver them to us. Google processes website analytics information through Google Analytics. We may also disclose information when you ask us to, when reasonably necessary to investigate abuse or protect rights and safety, or when required by law.',
      'The current site does not display advertising, run affiliate tracking, or process payments. We do not intentionally provide contact emails or correction messages to data brokers or use them for cross-context behavioral advertising.',
    ],
  },
  {
    title: 'Third-party links and calendar services',
    paragraphs: [
      'Calendar pages link to district websites, PDF hosts, Google Calendar, Apple Calendar, and other external services. When you follow a link, subscribe to a calendar, or open an official PDF, that provider may receive technical information and handle it under its own policy. FL School Calendar does not control those services.',
    ],
  },
  {
    title: 'Retention and security',
    paragraphs: [
      'Technical logs and email messages are kept only as long as reasonably needed for their operational purpose, dispute resolution, security, or legal obligations. Different providers and information types may use different retention periods.',
      'We use reasonable safeguards appropriate to the limited information handled by the site, but no internet transmission, mailbox, or storage system is completely secure. Email is not an appropriate way to send sensitive student or identity information.',
    ],
  },
  {
    title: 'Children’s privacy',
    paragraphs: [
      'FL School Calendar is written for parents, guardians, educators, researchers, and other adults. It is not directed to children under 13, and we do not knowingly collect personal information online from a child under 13. If you believe a child sent personal information to us, contact us so we can review and delete it when appropriate.',
    ],
  },
  {
    title: 'Your choices and privacy requests',
    paragraphs: [
      'Depending on where you live and whether a privacy law applies, you may have rights to request access to, correction of, or deletion of personal information, or to receive other information about its handling. You may also be entitled to use an authorized agent or appeal a request decision in some jurisdictions.',
      'Email corrections@flschoolcalendar.com with “Privacy request” in the subject line and explain what you are asking us to review. We may request information reasonably needed to verify that the request concerns you. Do not send identity documents unless we first provide an appropriate verification method.',
    ],
  },
  {
    title: 'Policy changes and contact',
    paragraphs: [
      'We may update this policy when the site, its providers, or applicable requirements change. The Last updated date identifies the current version. If a change materially affects previously collected information, we will provide any additional notice required by law.',
      'For a privacy question or request, email corrections@flschoolcalendar.com with “Privacy” in the subject line.',
    ],
  },
]

useSiteSeo({
  title: 'Privacy Policy',
  description: 'How FL School Calendar handles technical logs, Google Analytics, email corrections, cookies, and privacy requests.',
  path: '/privacy/',
})
</script>

<template>
  <FrameworkPage
    breadcrumb-label="Privacy"
    eyebrow="Privacy"
    title="Privacy Policy"
    lead="What the current site collects, what it does not collect, and how to contact us about privacy."
    :notice="`Last updated ${siteUpdatedAt}.`"
    :cards="cards"
    :sections="sections"
  />
</template>
