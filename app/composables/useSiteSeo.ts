import type { MaybeRefOrGetter } from 'vue'
import { absoluteUrl } from '~~/shared/utils/content'

export function useSiteSeo(options: {
  title: MaybeRefOrGetter<string>
  description: MaybeRefOrGetter<string>
  path: MaybeRefOrGetter<string>
  robots?: string
  appendSiteName?: boolean
  schema?: MaybeRefOrGetter<Record<string, unknown> | Array<Record<string, unknown>>>
}) {
  const config = useRuntimeConfig()
  const canonical = computed(() => absoluteUrl(config.public.siteUrl, toValue(options.path)))
  const socialImage = absoluteUrl(config.public.siteUrl, '/flschoolcalendar-1200x630.png')
  const socialImageAlt = 'Florida School Calendar — official district calendars, bell schedules, and key dates across Florida'
  const fullTitle = computed(() => {
    const title = toValue(options.title)
    return options.appendSiteName === false || title.includes('FL School Calendar')
      ? title
      : title + ' | FL School Calendar'
  })
  const description = computed(() => toValue(options.description))
  useSeoMeta({
    title: () => fullTitle.value,
    description: () => description.value,
    ogTitle: () => fullTitle.value,
    ogDescription: () => description.value,
    ogUrl: () => canonical.value,
    ogType: 'website',
    ogSiteName: 'FL School Calendar',
    ogLocale: 'en_US',
    ogImage: socialImage,
    ogImageWidth: 1200,
    ogImageHeight: 630,
    ogImageType: 'image/png',
    ogImageAlt: socialImageAlt,
    twitterCard: 'summary_large_image',
    twitterTitle: () => fullTitle.value,
    twitterDescription: () => description.value,
    twitterImage: socialImage,
    twitterImageAlt: socialImageAlt,
    robots: options.robots || 'index,follow',
  })
  useHead(() => ({
    link: [{ rel: 'canonical', href: canonical.value }],
    script: options.schema
      ? [{
          type: 'application/ld+json',
          innerHTML: JSON.stringify(toValue(options.schema)),
        }]
      : [],
  }))
}
