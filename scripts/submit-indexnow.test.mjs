import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SITE_URL, KEY, KEY_LOCATION, ENDPOINT,
  parseArgs, parseSitemap, buildUpdatedDates, selectEntries, createPayloads, run,
} from './submit-indexnow.mjs'

const sitemap = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${SITE_URL}/</loc></url>
<url><loc>${SITE_URL}/spring-isd/</loc></url>
<url><loc>${SITE_URL}/spring-isd/2026-2027/</loc></url>
<url><loc>${SITE_URL}/spring-isd/2026-2027-ace/</loc></url>
</urlset>`
const catalog = { districts: [{
  hubHref: '/spring-isd/',
  calendarPages: [
    { href: '/spring-isd/2026-2027/', indexable: true, contentUpdatedAt: '2026-10-06' },
    { href: '/spring-isd/2026-2027-ace/', indexable: true, contentUpdatedAt: '2026-10-07' },
    { href: '/unpublished/', indexable: false, contentUpdatedAt: '2026-10-08' },
  ],
}] }

test('mode validation rejects missing/conflicting modes and invalid dates', () => {
  for (const args of [[], ['--all', '--date', '2026-10-06'], ['--date'], ['--since', '2026-02-30'], ['--date', '2026-1-1']]) {
    assert.throws(() => parseArgs(args))
  }
  assert.equal(parseArgs(['--all', '--dry-run']).dryRun, true)
})

test('date filtering uses content edits, latest published hub edit and inclusive since', () => {
  const entries = parseSitemap(sitemap)
  const dates = buildUpdatedDates(catalog)
  assert.equal(selectEntries(entries, parseArgs(['--all'])).length, 4)
  assert.deepEqual(selectEntries(entries, parseArgs(['--date', '2026-10-06']), dates).map(e => e.url), [
    `${SITE_URL}/spring-isd/2026-2027/`,
  ])
  assert.deepEqual(selectEntries(entries, parseArgs(['--since', '2026-10-07']), dates).map(e => e.url), [
    `${SITE_URL}/spring-isd/`, `${SITE_URL}/spring-isd/2026-2027-ace/`,
  ])
  const noEdit = buildUpdatedDates({ districts: [{ calendarPages: [{
    href: '/spring-isd/2026-2027/', indexable: true, contentUpdatedAt: null,
    verifiedAt: '2026-10-06', lastOfficialRevisionAt: '2026-10-06',
  }] }] })
  assert.equal(selectEntries(entries.slice(2, 3), parseArgs(['--date', '2026-10-06']), noEdit).length, 0)
})

test('sitemap rejects wrong hosts, HTML and truncation; batches deduplicate and cap at 10,000', () => {
  assert.throws(() => parseSitemap(sitemap.replace(SITE_URL, 'https://example.com')))
  assert.throws(() => parseSitemap('<html>Unavailable</html>'))
  assert.throws(() => parseSitemap(sitemap.replace('</urlset>', '')))
  const entries = Array.from({ length: 10_001 }, (_, i) => ({ url: `${SITE_URL}/${i}/` }))
  const payloads = createPayloads([...entries, entries[0]])
  assert.deepEqual(payloads.map(p => p.urlList.length), [10_000, 1])
})

function mockFetch({ key = KEY, status = 200 } = {}) {
  const calls = []
  return {
    calls,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options })
      if (url === `${SITE_URL}/sitemap.xml`) return new Response(sitemap)
      if (url === `${SITE_URL}/api/districts.json`) return Response.json(catalog)
      if (url === KEY_LOCATION) return new Response(key + '\n')
      if (url === ENDPOINT && options.method === 'POST') return new Response('', { status })
      throw new Error(`Unexpected request: ${url}`)
    },
  }
}

test('dry run and zero matches never send POST requests', async () => {
  for (const args of [['--all', '--dry-run'], ['--date', '2026-10-01']]) {
    const mock = mockFetch()
    await run(args, { fetchImpl: mock.fetchImpl, log() {} })
    assert.equal(mock.calls.some(c => c.options.method === 'POST'), false)
  }
})

test('submission validates production key and sends selected URLs with expected protocol fields', async () => {
  const mock = mockFetch({ status: 202 })
  const logs = []
  await run(['--date', '2026-10-06'], { fetchImpl: mock.fetchImpl, log: text => logs.push(text) })
  const payload = JSON.parse(mock.calls.find(c => c.options.method === 'POST').options.body)
  assert.deepEqual(payload, {
    host: 'flschoolcalendar.com', key: KEY, keyLocation: KEY_LOCATION,
    urlList: [`${SITE_URL}/spring-isd/2026-2027/`],
  })
  assert.ok(logs.some(line => line.includes('key validation pending')))
  const wrongKey = mockFetch({ key: '<html>404</html>' })
  await assert.rejects(run(['--all'], { fetchImpl: wrongKey.fetchImpl, log() {} }), /key file/)
  assert.equal(wrongKey.calls.some(c => c.options.method === 'POST'), false)
})

test('Bing failures propagate instead of reporting success', async () => {
  const mock = mockFetch({ status: 429 })
  await assert.rejects(run(['--all'], { fetchImpl: mock.fetchImpl, log() {} }), /HTTP 429/)
})
