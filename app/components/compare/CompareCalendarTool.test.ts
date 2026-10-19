import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import type { LocationQuery } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CompareCalendarTool from './CompareCalendarTool.vue'
import CompareDistrictSearch from './CompareDistrictSearch.vue'
import alief from '../../../test/fixtures/districts/alief-isd.json'
import aldine from '../../../test/fixtures/districts/aldine-isd.json'
import alvin from '../../../test/fixtures/districts/alvin-isd.json'
import type { DistrictRecord } from '../../../shared/types/content'
import { buildDistrictCatalog } from '../../../shared/utils/districts'

type TestRoute = { path: string, query: LocationQuery, hash: string, fullPath: string }
const mocks = vi.hoisted(() => ({ route: {} as TestRoute, replace: vi.fn() }))
mockNuxtImport('useRoute', () => () => mocks.route)
mockNuxtImport('useRouter', () => () => ({
  replace: mocks.replace,
  afterEach: () => () => {},
  beforeEach: () => () => {},
  beforeResolve: () => () => {},
  onError: () => () => {},
}))

const districts = buildDistrictCatalog([alief, aldine, alvin] as DistrictRecord[]).districts
let wrapper: ReturnType<typeof mount> | undefined

function setQuery(query: LocationQuery, hash = '') {
  mocks.route.query = query
  mocks.route.hash = hash
  const params = new URLSearchParams(query as Record<string, string>).toString()
  mocks.route.fullPath = '/compare/' + (params ? '?' + params : '') + hash
}

function render(availableDistricts = districts) {
  wrapper = mount(CompareCalendarTool, {
    props: { districts: availableDistricts, schoolYear: '2026-2027' },
    global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } },
  })
  return wrapper
}

beforeEach(() => {
  mocks.replace.mockReset()
  mocks.route = reactive({ path: '/compare/', query: {}, hash: '', fullPath: '/compare/' })
  setQuery({ left: 'alief-isd', right: 'aldine-isd' })
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined })

describe('compare deep-link initialization and navigation', () => {
  it('loads the supplied district pair without replacing its URL', async () => {
    const page = render()
    await flushPromises()
    expect(page.find('.comparison-table').exists()).toBe(true)
    expect(page.find('#compare-first-district').element).toHaveProperty('value', alief.district.name)
    expect(page.find('#compare-second-district').element).toHaveProperty('value', aldine.district.name)
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('never writes the temporary prerender route or restored query back into the URL', async () => {
    const page = render()
    setQuery({})
    await flushPromises()
    expect(mocks.replace).not.toHaveBeenCalled()
    setQuery({ left: 'alief-isd', right: 'aldine-isd' })
    await flushPromises()
    expect(page.find('.comparison-table').exists()).toBe(true)
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('reads back/forward route changes without causing a second navigation', async () => {
    const page = render()
    setQuery({ left: 'aldine-isd', right: 'alvin-isd' })
    await flushPromises()
    expect(page.find('#compare-first-district').element).toHaveProperty('value', aldine.district.name)
    expect(page.find('#compare-second-district').element).toHaveProperty('value', alvin.district.name)
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('resolves a deep link when the district catalog arrives without rewriting it', async () => {
    const page = render([])
    await page.setProps({ districts })
    await flushPromises()
    expect(page.find('.comparison-table').exists()).toBe(true)
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('does not redirect or sanitize invalid/duplicate query parameters on load', async () => {
    setQuery({ left: 'alief-isd', right: 'alief-isd' })
    const page = render()
    await flushPromises()
    expect(page.find('.comparison-table').exists()).toBe(false)
    setQuery({ left: 'not-a-district', right: 'aldine-isd' })
    await flushPromises()
    expect(page.find('.comparison-table').exists()).toBe(false)
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('updates only on a user selection and preserves other query parameters and the hash', async () => {
    setQuery({ left: 'alief-isd', right: 'aldine-isd', utm_source: 'shared-link' }, '#results')
    const page = render()
    page.findAllComponents(CompareDistrictSearch)[1]!.vm.$emit('update:modelValue', 'alvin-isd')
    await nextTick()
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith({
      path: '/compare/',
      query: { left: 'alief-isd', right: 'alvin-isd', utm_source: 'shared-link' },
      hash: '#results',
    })
  })

  it('does not navigate when the selected district has not changed', async () => {
    const page = render()
    page.findAllComponents(CompareDistrictSearch)[1]!.vm.$emit('update:modelValue', 'aldine-isd')
    await nextTick()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('clears just one selection and prevents selecting the same district twice', async () => {
    const page = render()
    page.findAllComponents(CompareDistrictSearch)[1]!.vm.$emit('update:modelValue', '')
    await nextTick()
    expect(mocks.replace).toHaveBeenLastCalledWith({ path: '/compare/', query: { left: 'alief-isd' }, hash: '' })
    page.findAllComponents(CompareDistrictSearch)[0]!.vm.$emit('update:modelValue', 'aldine-isd')
    await nextTick()
    expect(mocks.replace).toHaveBeenLastCalledWith({ path: '/compare/', query: { left: 'aldine-isd' }, hash: '' })
  })
})
