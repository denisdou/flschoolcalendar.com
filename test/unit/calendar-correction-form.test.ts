import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { useRuntimeConfig } from '#imports'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import CalendarCorrection from '../../app/components/calendar/CalendarCorrection.vue'
import record from '../../server/data/districts/records/alachua-county-school-district.json'
import type { DistrictCalendar, DistrictIdentity } from '../../shared/types/content'

let originalKey: string
const { send } = vi.hoisted(() => ({ send: vi.fn() }))
mockNuxtImport('$fetch', () => send)
beforeEach(() => {
  const config = useRuntimeConfig()
  originalKey = config.public.turnstileSiteKey
  config.public.turnstileSiteKey = 'test-site-key'
  send.mockReset()
})
const reset = vi.fn()
const Challenge = defineComponent({
  props: ['siteKey', 'active'], emits: ['update:token'],
  setup(_, { expose }) { expose({ reset }); return {} },
  template: '<div class="test-challenge" />',
})
const form = () => mount(CalendarCorrection, {
  props: { district: record.district as DistrictIdentity, calendar: record.schoolYears['2026-2027'] as unknown as DistrictCalendar },
  global: { stubs: { TurnstileChallenge: Challenge } },
})
afterEach(() => {
  useRuntimeConfig().public.turnstileSiteKey = originalKey
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('correction form submission', () => {
  it('waits for verification, sends page context and confirms success only after acceptance', async () => {
    send.mockResolvedValue({ ok: true })
    const wrapper = form()
    await wrapper.get('.calendar-correction-strip button').trigger('click')
    await wrapper.get('textarea').setValue('Please check the new official calendar.')
    await wrapper.get('input').setValue('parent@example.org')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    wrapper.findComponent(Challenge).vm.$emit('update:token', 'valid-test-token')
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(send).toHaveBeenCalledWith('/api/corrections', expect.objectContaining({
      method: 'POST', retry: 0,
      body: expect.objectContaining({
        district: record.district.name, schoolYear: '2026-2027',
        page: 'https://flschoolcalendar.com/alachua-county-school-district/2026-2027/',
        email: 'parent@example.org', message: 'Please check the new official calendar.', turnstileToken: 'valid-test-token',
      }),
    }))
    expect(wrapper.get('[role="status"]').text()).toContain('sent for review')
    wrapper.unmount()
  })

  it('keeps input on failure, refreshes verification and reuses the same idempotency key on retry', async () => {
    send.mockRejectedValueOnce({ data: { message: 'Please verify again.' } }).mockResolvedValueOnce({ ok: true })
    const wrapper = form()
    await wrapper.get('.calendar-correction-strip button').trigger('click')
    await wrapper.get('textarea').setValue('Please check the updated date.')
    wrapper.findComponent(Challenge).vm.$emit('update:token', 'first-token')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Please verify again.')
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('Please check the updated date.')
    expect(reset).toHaveBeenCalledOnce()
    wrapper.findComponent(Challenge).vm.$emit('update:token', 'fresh-token')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(send.mock.calls[0]![1].body.submissionId).toBe(send.mock.calls[1]![1].body.submissionId)
    wrapper.unmount()
  })

  it('prevents duplicate clicks while sending and ignores an expired token', async () => {
    let resolve!: (result: { ok: boolean }) => void
    send.mockImplementation(() => new Promise<{ ok: boolean }>(done => { resolve = done }))
    const wrapper = form()
    await wrapper.get('textarea').setValue('Please check the updated date.')
    wrapper.findComponent(Challenge).vm.$emit('update:token', '')
    await wrapper.get('form').trigger('submit')
    expect(send).not.toHaveBeenCalled()
    wrapper.findComponent(Challenge).vm.$emit('update:token', 'valid-token')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')
    expect(send).toHaveBeenCalledOnce()
    expect(wrapper.get('button[type="submit"]').text()).toBe('Sending…')
    resolve({ ok: true })
    await flushPromises()
    wrapper.unmount()
  })
})
