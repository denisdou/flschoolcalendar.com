import { pathToFileURL } from 'node:url'

export const SITE_URL = 'https://flschoolcalendar.com'
export const KEY = 'aaf9b66dcaf847a1a1922a08c27677e4'
export const KEY_LOCATION = `${SITE_URL}/${KEY}.txt`
export const ENDPOINT = 'https://www.bing.com/indexnow'
const BATCH_SIZE = 10_000

const help = `Submit production URLs to Bing via IndexNow (Node.js 20+).

Usage:
  pnpm indexnow --all                 Submit all production sitemap URLs
  pnpm indexnow --date YYYY-MM-DD      Submit URLs last edited on this date
  pnpm indexnow --since YYYY-MM-DD     Submit URLs last edited on/after this date

Options:
  --dry-run   Print selected URLs and payloads without submitting
  --help      Show this help

Dates come from production contentUpdatedAt, not verifiedAt or official revisions.
District hubs use the latest contentUpdatedAt of their indexable calendars.
Other pages use sitemap lastmod when available; undated pages are skipped in date mode.
`

export function validDate(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
}

export function parseArgs(args) {
  const options = { mode: null, date: null, dryRun: false, help: false }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else if (['--all', '--date', '--since'].includes(arg)) {
      if (options.mode) throw new Error('Choose exactly one of --all, --date, or --since.')
      options.mode = arg.slice(2)
      if (arg !== '--all') {
        options.date = args[++i]
        if (!validDate(options.date)) throw new Error(`${arg} requires a valid YYYY-MM-DD date.`)
      }
    }
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!options.help && !options.mode) throw new Error('Choose --all, --date YYYY-MM-DD, or --since YYYY-MM-DD.')
  return options
}

function productionUrl(value) {
  const url = new URL(value, SITE_URL)
  if (url.origin !== SITE_URL || url.username || url.password || url.search || url.hash) {
    throw new Error(`Not a canonical production URL: ${value}`)
  }
  return url.href
}

function decodeXml(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity) => {
    if (entity.startsWith('#')) {
      return String.fromCodePoint(entity[1].toLowerCase() === 'x'
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10))
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[entity.toLowerCase()]
  })
}

// This site's sitemap is a single urlset, not a sitemap index.
export function parseSitemap(xml) {
  if (!/<urlset\b/.test(xml) || !/<\/urlset>\s*$/.test(xml)) {
    throw new Error('Production sitemap is not a complete XML urlset.')
  }
  const entries = new Map()
  for (const match of xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/g)) {
    const loc = match[1].match(/<loc>([\s\S]*?)<\/loc>/)?.[1]
    if (!loc) throw new Error('Sitemap entry is missing loc.')
    const url = productionUrl(decodeXml(loc.trim()))
    const lastmod = match[1].match(/<lastmod>([\s\S]*?)<\/lastmod>/)?.[1]?.trim().slice(0, 10)
    entries.set(url, { url, updatedAt: validDate(lastmod) ? lastmod : null })
  }
  if (!entries.size) throw new Error('Production sitemap contains no URLs.')
  return [...entries.values()]
}

export function buildUpdatedDates(catalog) {
  if (!Array.isArray(catalog?.districts)) throw new Error('Production district catalog is invalid.')
  const dates = new Map()
  for (const district of catalog.districts) {
    if (!Array.isArray(district.calendarPages)) throw new Error('District catalog is missing calendarPages.')
    const hubDates = []
    for (const page of district.calendarPages) {
      if (!page.indexable) continue
      const url = productionUrl(page.href)
      if (page.contentUpdatedAt != null && !validDate(page.contentUpdatedAt)) {
        throw new Error(`Invalid contentUpdatedAt for ${url}: ${page.contentUpdatedAt}`)
      }
      // Null is intentional: never substitute a verification/revision date.
      dates.set(url, page.contentUpdatedAt || null)
      if (page.contentUpdatedAt) hubDates.push(page.contentUpdatedAt)
    }
    if (district.hubHref) {
      dates.set(productionUrl(district.hubHref), hubDates.sort().at(-1) || null)
    }
  }
  return dates
}

export function selectEntries(entries, options, updatedDates = new Map()) {
  if (options.mode === 'all') return entries
  return entries.flatMap(entry => {
    const updatedAt = updatedDates.has(entry.url) ? updatedDates.get(entry.url) : entry.updatedAt
    if (!updatedAt) return []
    const matches = options.mode === 'date' ? updatedAt === options.date : updatedAt >= options.date
    return matches ? [{ ...entry, updatedAt }] : []
  })
}

export function createPayloads(entries) {
  const urls = [...new Set(entries.map(entry => productionUrl(entry.url)))]
  const payloads = []
  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    payloads.push({
      host: new URL(SITE_URL).host,
      key: KEY,
      keyLocation: KEY_LOCATION,
      urlList: urls.slice(i, i + BATCH_SIZE),
    })
  }
  return payloads
}

async function request(url, fetchImpl, options = {}) {
  const response = await fetchImpl(url, {
    ...options,
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`)
  return response
}

export async function run(args, { fetchImpl = fetch, log = console.log } = {}) {
  const options = parseArgs(args)
  if (options.help) { log(help); return }

  const xml = await (await request(`${SITE_URL}/sitemap.xml`, fetchImpl)).text()
  const entries = parseSitemap(xml)
  let dates = new Map()
  if (options.mode !== 'all') {
    const catalog = await (await request(`${SITE_URL}/api/districts.json`, fetchImpl)).json()
    dates = buildUpdatedDates(catalog)
    const undated = entries.filter(entry => !(dates.has(entry.url) ? dates.get(entry.url) : entry.updatedAt)).length
    log(`Date source: production contentUpdatedAt. Skipping ${undated} undated URLs.`)
  }
  const selected = selectEntries(entries, options, dates)
  log(`Selected ${selected.length} of ${entries.length} production sitemap URLs (${options.mode}${options.date ? ': ' + options.date : ''}).`)
  if (!selected.length) { log('No matching URLs; nothing submitted.'); return }
  const payloads = createPayloads(selected)
  if (options.dryRun) {
    log('DRY RUN: no IndexNow submission sent.')
    for (const payload of payloads) log(JSON.stringify(payload, null, 2))
    return
  }

  const keyBody = await (await request(KEY_LOCATION, fetchImpl)).text()
  if (keyBody.replace(/^\uFEFF/, '').trim() !== KEY) {
    throw new Error('Production key file does not contain the configured IndexNow key.')
  }
  for (const [index, payload] of payloads.entries()) {
    const response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    })
    if (![200, 202].includes(response.status)) {
      const details = (await response.text()).slice(0, 500)
      throw new Error(`Batch ${index + 1}/${payloads.length} failed: HTTP ${response.status} ${details}. Earlier accepted batches are not rolled back.`)
    }
    log(`Batch ${index + 1}/${payloads.length}: ${payload.urlList.length} URLs, HTTP ${response.status}${response.status === 202 ? ' (key validation pending)' : ' (received)'}.`)
  }
  log('Submission completed. Receipt does not guarantee crawling or indexing.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).catch(error => {
    console.error(`IndexNow: ${error.message}${error.cause?.message ? ' (' + error.cause.message + ')' : ''}`)
    process.exitCode = 1
  })
}
