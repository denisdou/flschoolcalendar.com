import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TurnstileChallenge from '../../app/components/forms/TurnstileChallenge.vue'
import type { TurnstileApi } from '../../app/utils/turnstile'

const { load } = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('../../app/utils/turnstile', () => ({ loadTurnstile: load }))
const api = { render: vi.fn<TurnstileApi['render']>(() => 'test-widget'), reset: vi.fn(), remove: vi.fn() }
beforeEach(() => {
  vi.clearAllMocks()
  load.mockReset().mockResolvedValue(api)
})

describe('correction verification lifecycle', () => {
  it('loads only when opened, clears expired tokens and removes its widget when closed', async () => {
    const wrapper = mount(TurnstileChallenge, { props: { active: false, siteKey: 'test-key' } })
    await flushPromises()
    expect(load).not.toHaveBeenCalled()
    await wrapper.setProps({ active: true })
    await flushPromises()
    const options = api.render.mock.calls[0]![1] as Parameters<TurnstileApi['render']>[1]
    expect(options.action).toBe('calendar_correction')
    options.callback('verified-token')
    expect(wrapper.emitted('update:token')!.at(-1)).toEqual(['verified-token'])
    options['expired-callback']()
    expect(wrapper.emitted('update:token')!.at(-1)).toEqual([''])
    await wrapper.setProps({ active: false })
    expect(api.remove).toHaveBeenCalledWith('test-widget')
    wrapper.unmount()
  })

  it('allows retrying a blocked script without losing the form', async () => {
    load.mockRejectedValueOnce(new Error('script blocked'))
    const wrapper = mount(TurnstileChallenge, { props: { active: true, siteKey: 'test-key' } })
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('could not load')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(api.render).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('does not render a late-loading challenge after the dialog closes', async () => {
    let resolve!: (value: typeof api) => void
    load.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const wrapper = mount(TurnstileChallenge, { props: { active: true, siteKey: 'test-key' } })
    await flushPromises()
    await wrapper.setProps({ active: false })
    resolve(api)
    await flushPromises()
    expect(api.render).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
