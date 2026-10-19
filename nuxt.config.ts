import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import type { DistrictRecord } from './shared/types/content'
import { dateInCalendarTimeZone } from './shared/utils/calendarDate'
import { resolveCurrentSchoolYear } from './shared/utils/content'
import { buildDistrictCatalog } from './shared/utils/districts'

const districtRecordsPath = fileURLToPath(
  new URL('./server/data/districts/records/', import.meta.url),
)

function readDistrictRecords(): DistrictRecord[] {
  if (!existsSync(districtRecordsPath)) {
    return []
  }

  return readdirSync(districtRecordsPath)
    .filter(file => file.endsWith('.json'))
    .map(file => JSON.parse(
      readFileSync(join(districtRecordsPath, file), 'utf8'),
    ) as DistrictRecord)
}

const districtCatalog = buildDistrictCatalog(readDistrictRecords())
const currentSchoolYear = resolveCurrentSchoolYear()
const siteBuildDate = dateInCalendarTimeZone()
const isProduction = process.env.NODE_ENV === 'production'
const googleAnalyticsId = process.env.NUXT_PUBLIC_GOOGLE_ANALYTICS_ID || ''
const googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION || ''
const googleAnalyticsBootstrap = `
(function () {
  var measurementId = '${googleAnalyticsId}';
  var loaded = false;
  function loadGoogleAnalytics() {
    if (loaded) return;
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', measurementId);
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
    document.head.appendChild(script);
  }
  function scheduleGoogleAnalytics() {
    window.requestAnimationFrame(function () {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(loadGoogleAnalytics, { timeout: 2000 });
      } else {
        window.setTimeout(loadGoogleAnalytics, 1000);
      }
    });
  }
  if (document.readyState === 'complete') scheduleGoogleAnalytics();
  else window.addEventListener('load', scheduleGoogleAnalytics, { once: true });
}());
`
const fixedRoutes = [
  '/',
  '/compare/',
  '/methodology/',
  '/data-sources/',
  '/sitemap.xml',
]
const publishedDistricts = districtCatalog.districts
const districtHubRoutes = publishedDistricts.flatMap(district => district.hubHref ? [district.hubHref] : [])
const calendarRoutes = publishedDistricts.flatMap(district =>
  district.calendarPages.filter(page => page.indexable).map(page => page.href),
)
const apiRoutes = [
  '/api/districts.json',
  '/api/homepage-featured.json',
  ...publishedDistricts.map(district => '/api/districts/' + district.slug + '.json'),
]

export default defineNuxtConfig({
  compatibilityDate: '2026-08-24',
  devtools: { enabled: false },
  features: { inlineStyles: true },
  ssr: true,
  css: ['~/assets/css/main.css'],
  components: [{ path: '~/components', pathPrefix: false }],
  modules: ['@nuxt/content'],
  content: {
    database: {
      type: 'sqlite',
      filename: '/tmp/flschoolcalendar-content.sqlite',
    },
    _localDatabase: {
      type: 'sqlite',
      filename: '/tmp/flschoolcalendar-content-local.sqlite',
    },
  },
  vite: { plugins: [tailwindcss()] },
  typescript: { typeCheck: true, strict: true },
  runtimeConfig: {
    public: {
      siteUrl: 'https://flschoolcalendar.com',
      currentSchoolYear,
      siteBuildDate,
    },
  },
  nitro: {
    preset: 'static',
    // Shared utilities are externalized by the SSR build but must be bundled
    // into Nitro, not resolved from source paths by the prerender runtime.
    externals: {
      inline: [fileURLToPath(new URL('./shared/', import.meta.url))],
    },
    prerender: {
      autoSubfolderIndex: true,
      crawlLinks: true,
      failOnError: true,
      ignore: [route =>
        route !== '/'
        && !route.endsWith('/')
        && !/\/[^/]+\.[^/]+$/.test(route),
      ],
      routes: [
        ...fixedRoutes,
        ...districtHubRoutes,
        ...calendarRoutes,
        ...apiRoutes,
      ],
    },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#f6f8fa' },
        { name: 'color-scheme', content: 'light dark' },
        { name: 'application-name', content: 'FL School Calendar' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'apple-mobile-web-app-title', content: 'FL School Calendar' },
        ...(isProduction && googleSiteVerification
          ? [{
              name: 'google-site-verification',
              content: googleSiteVerification,
            }]
          : []),
      ],
      script: isProduction && googleAnalyticsId
        ? [
            {
              key: 'google-analytics-init',
              innerHTML: googleAnalyticsBootstrap,
              tagPosition: 'bodyClose',
            },
          ]
        : [],
      link: [
        { rel: 'icon', href: '/flschoolcalendar-mark.svg', type: 'image/svg+xml', sizes: 'any' },
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'icon', href: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
        { rel: 'icon', href: '/favicon-48x48.png', type: 'image/png', sizes: '48x48' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
        { rel: 'manifest', href: '/site.webmanifest' },
      ],
    },
  },
})
