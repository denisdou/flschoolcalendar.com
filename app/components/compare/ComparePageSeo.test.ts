import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { reactive, ref, type Ref } from 'vue'
import type { LocationQuery } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ComparePage from '../../pages/compare/index.vue'
import type { DistrictCatalogEntry, DistrictRecord } from '../../../shared/types/content'
import { buildDistrictCatalog } from '../../../shared/utils/districts'
import prosper from '../../../test/fixtures/districts/prosper-isd.json'
import dallas from '../../../test/fixtures/districts/dallas-isd.json'
import alief from '../../../test/fixtures/districts/alief-isd.json'

const mocks = vi.hoisted(() => ({
  route: {} as { query: LocationQuery },
  catalog: {} as Ref<{ districts: DistrictCatalogEntry[] }>,
  head: vi.fn(),
  seo: vi.fn(),
}))
mockNuxtImport('useRoute', () => () => mocks.route)
mockNuxtImport('useCurrentSchoolYear', () => () => '2026-2027')
mockNuxtImport('useDistrictCatalog', () => () => Promise.resolve({ data: mocks.catalog }))
mockNuxtImport('useHead', original => (...args: Parameters<typeof original>) => {
  mocks.head(...args)
  return original(...args)
})
mockNuxtImport('useSeoMeta', () => mocks.seo)

const districts = buildDistrictCatalog([prosper, dallas, alief] as DistrictRecord[]).districts
let wrapper: Awaited<ReturnType<typeof mountSuspended>> | undefined

async function render() {
  wrapper = await mountSuspended(ComparePage, {
    global: { stubs: {
      PageIntroSection: true,
      CompareCalendarTool: true,
      CompareHowItWorks: true,
      CompareMethodSection: true,
      CalendarFaqSection: true,
    } },
  })
  await flushPromises()
}

function currentHead() {
  const getter = mocks.head.mock.calls.map(call => call[0]).find(value =>
    typeof value === 'function' && value().link?.some((link: { rel: string }) => link.rel === 'canonical'),
  )
  expect(getter).toBeTypeOf('function')
  return getter()
}

function canonical() {
  return currentHead().link.find((link: { rel: string }) => link.rel === 'canonical').href
}

beforeEach(() => {
  mocks.head.mockReset()
  mocks.seo.mockReset()
  mocks.route = reactive({ query: {} })
  mocks.catalog = ref({ districts })
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined })

describe('comparison canonical and reactive metadata', () => {
  it('keeps the base canonical when no complete valid pair is selected', async () => {
    await render()
    const queries: LocationQuery[] = [
      {},
      { left: 'prosper-isd' },
      { right: 'dallas-isd' },
      { left: 'prosper-isd', right: 'prosper-isd' },
      { left: 'unknown', right: 'dallas-isd' },
      { left: ['prosper-isd', 'alief-isd'], right: 'dallas-isd' },
    ]
    for (const query of queries) {
      mocks.route.query = query
      await flushPromises()
      expect(canonical()).toBe('https://flschoolcalendar.com/compare/')
    }
  })

  it('uses the selected pair without tracking parameters and matches Open Graph and structured data', async () => {
    mocks.route.query = { right: 'dallas-isd', left: 'prosper-isd', utm_source: 'share' }
    await render()
    const expected = 'https://flschoolcalendar.com/compare/?left=prosper-isd&right=dallas-isd'
    expect(canonical()).toBe(expected)
    const meta = mocks.seo.mock.calls.find(call => call[0].ogUrl)?.[0]
    expect(meta.ogUrl()).toBe(expected)
    expect(meta.title()).toContain('Prosper')
    expect(meta.title()).toContain('Dallas')
    const schema = JSON.parse(currentHead().script[0].innerHTML)
    expect(schema['@graph'][0].url).toBe(expected)
  })

  it('reacts to selection changes, back navigation and clearing a selection', async () => {
    mocks.route.query = { left: 'prosper-isd', right: 'dallas-isd' }
    await render()
    mocks.route.query = { left: 'prosper-isd', right: 'alief-isd' }
    await flushPromises()
    expect(canonical()).toBe('https://flschoolcalendar.com/compare/?left=prosper-isd&right=alief-isd')
    mocks.route.query = { left: 'dallas-isd', right: 'prosper-isd' }
    await flushPromises()
    expect(canonical()).toBe('https://flschoolcalendar.com/compare/?left=dallas-isd&right=prosper-isd')
    mocks.route.query = { left: 'dallas-isd' }
    await flushPromises()
    expect(canonical()).toBe('https://flschoolcalendar.com/compare/')
  })

  it('updates one actual head link when selecting and clearing a comparison', async () => {
    mocks.route.query = { left: 'prosper-isd', right: 'dallas-isd' }
    await render()
    await vi.waitFor(() => {
      const links = document.head.querySelectorAll('link[rel="canonical"]')
      expect(links).toHaveLength(1)
      expect(links[0]?.getAttribute('href')).toBe('https://flschoolcalendar.com/compare/?left=prosper-isd&right=dallas-isd')
    })
    mocks.route.query = {}
    await flushPromises()
    await vi.waitFor(() => {
      const links = document.head.querySelectorAll('link[rel="canonical"]')
      expect(links).toHaveLength(1)
      expect(links[0]?.getAttribute('href')).toBe('https://flschoolcalendar.com/compare/')
    })
  })

  it('updates when the catalog arrives without treating unavailable calendars as valid selections', async () => {
    mocks.catalog.value = { districts: [] }
    mocks.route.query = { left: 'prosper-isd', right: 'dallas-isd' }
    await render()
    expect(canonical()).toBe('https://flschoolcalendar.com/compare/')
    mocks.catalog.value = { districts }
    await flushPromises()
    expect(canonical()).toBe('https://flschoolcalendar.com/compare/?left=prosper-isd&right=dallas-isd')
    mocks.catalog.value = { districts: districts.map(district => ({
      ...district,
      calendarPages: district.calendarPages.map(page => ({ ...page, indexable: false })),
    })) }
    await flushPromises()
    expect(canonical()).toBe('https://flschoolcalendar.com/compare/')
  })
})
