import { getDistrictCatalog } from '../services/districtCatalog'

const siteUrl = 'https://flschoolcalendar.com'
const alwaysIndexable = [
  '/',
  '/compare/',
  '/methodology/',
  '/data-sources/',
  '/updates/',
  '/about/',
  '/privacy/',
  '/terms/',
  '/contact/',
]

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export default defineEventHandler(async (event) => {
  const catalog = await getDistrictCatalog(event)
  const publishedDistricts = catalog.districts
  const routes = new Set(alwaysIndexable)

  for (const district of publishedDistricts) {
    if (district.hubHref) routes.add(district.hubHref)
    for (const page of district.calendarPages) {
      if (page.indexable) {
        routes.add(page.href)
      }
    }
  }

  const body = [...routes]
    .sort()
    .map(route => '  <url><loc>' + escapeXml(siteUrl + route) + '</loc></url>')
    .join('\n')

  setHeader(event, 'content-type', 'application/xml; charset=UTF-8')
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + body
    + '\n</urlset>\n'
})
