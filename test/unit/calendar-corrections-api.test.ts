// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { handleCalendarCorrection, type CorrectionConfig } from '../../server/utils/calendarCorrections'
import worker from '../../worker'

const config: CorrectionConfig = {
  resendApiKey: 'test-resend-secret', from: 'FL School Calendar <notice@flschoolcalendar.com>',
  to: 'corrections@flschoolcalendar.com', turnstileSecret: 'test-turnstile-secret',
  turnstileHosts: 'flschoolcalendar.com,www.flschoolcalendar.com', trustProxy: false,
  siteUrl: 'https://flschoolcalendar.com',
}
const payload = {
  district: 'Alachua County Public Schools', schoolYear: '2026-2027',
  page: 'https://flschoolcalendar.com/alachua-county-school-district/2026-2027/',
  message: 'Please check the official spring break dates.', email: 'parent@example.org',
  turnstileToken: 'test-widget-token', submissionId: '8f1c1e24-1e8b-4b30-b5ab-c27d12d980ab',
}
const request = (changes = {}, headers = {}) => new Request('https://flschoolcalendar.com/api/corrections', {
  method: 'POST', headers: { Origin: 'https://flschoolcalendar.com', 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify({ ...payload, ...changes }),
})
const verified = () => Response.json({ success: true, action: 'calendar_correction', hostname: 'flschoolcalendar.com' })
const accepted = () => Response.json({ id: 'test-email-id' })

describe('verified correction emails', () => {
  it('verifies Turnstile before sending the correction to the configured mailbox', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(verified()).mockResolvedValueOnce(accepted())
    const response = await handleCalendarCorrection(request(), config, send)
    expect(response.status).toBe(202)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ ok: true })
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[0]![0]).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    expect(JSON.parse(String(send.mock.calls[0]![1]!.body))).toEqual({ secret: config.turnstileSecret, response: payload.turnstileToken })
    expect(send.mock.calls[1]![0]).toBe('https://api.resend.com/emails')
    const options = send.mock.calls[1]![1]!
    expect(options.headers).toMatchObject({ Authorization: `Bearer ${config.resendApiKey}`, 'Idempotency-Key': `calendar-correction/${payload.submissionId}` })
    const mail = JSON.parse(String(options.body))
    expect(mail).toMatchObject({ from: config.from, to: [config.to], reply_to: payload.email })
    expect(mail.subject).toContain(payload.district)
    expect(mail.subject).toContain(payload.schoolYear)
    expect(mail.text).toContain(payload.page)
    expect(mail.text).toContain(payload.message)
    expect(mail).not.toHaveProperty('html')
  })

  it('supports anonymous reports without using the visitor as sender or accepting their recipient override', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(verified()).mockResolvedValueOnce(accepted())
    expect((await handleCalendarCorrection(request({ email: '', to: 'attacker@example.org', from: 'attacker@example.org' }), config, send)).status).toBe(202)
    expect(JSON.parse(String(send.mock.calls[1]![1]!.body))).toMatchObject({ from: config.from, to: [config.to] })
    expect(JSON.parse(String(send.mock.calls[1]![1]!.body))).not.toHaveProperty('reply_to')
  })

  it.each([
    { message: '' }, { message: 'x'.repeat(5001) }, { email: 'parent@example.org\r\nBcc: attacker@example.org' },
    { district: 'District\nBcc: other' }, { schoolYear: '2026-2028' },
    { page: 'https://other.example/alachua/2026-2027/' }, { page: 'https://flschoolcalendar.com/alachua/' },
    { page: payload.page + '?email=other' }, { page: 'https://parent@flschoolcalendar.com/alachua/2026-2027/' },
    { turnstileToken: '' }, { turnstileToken: 'x'.repeat(2049) }, { submissionId: 'not-a-uuid' },
  ])('rejects invalid form fields before contacting external services: %j', async (changes) => {
    const send = vi.fn<typeof fetch>()
    expect((await handleCalendarCorrection(request(changes), config, send)).status).toBe(400)
    expect(send).not.toHaveBeenCalled()
  })

  it.each([
    { success: false },
    { success: true, action: 'different_action', hostname: 'flschoolcalendar.com' },
    { success: true, action: 'calendar_correction', hostname: 'other.example' },
  ])('never sends mail for invalid or mismatched verification: %j', async (validation) => {
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(validation))
    expect((await handleCalendarCorrection(request(), config, send)).status).toBe(400)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('fails closed when verification is unavailable', async () => {
    const send = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('network unavailable'))
    expect((await handleCalendarCorrection(request(), config, send)).status).toBe(502)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('does not report successful submission or expose provider errors when Resend fails', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(verified()).mockResolvedValueOnce(Response.json({ message: 'private provider detail' }, { status: 429 }))
    const response = await handleCalendarCorrection(request(), config, send)
    expect(response.status).toBe(502)
    expect(await response.text()).not.toContain('private provider detail')
  })

  it('preserves the idempotency key across retries while verifying a fresh challenge each time', async () => {
    const send = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(verified()).mockRejectedValueOnce(new Error('email response lost'))
      .mockResolvedValueOnce(verified()).mockResolvedValueOnce(accepted())
    expect((await handleCalendarCorrection(request(), config, send)).status).toBe(502)
    expect((await handleCalendarCorrection(request({ turnstileToken: 'new-token' }), config, send)).status).toBe(202)
    expect(send.mock.calls[1]![1]!.headers).toEqual(send.mock.calls[3]![1]!.headers)
    expect(send.mock.calls[1]![1]!.body).toEqual(send.mock.calls[3]![1]!.body)
  })

  it('forwards the visitor IP only when proxy trust is explicitly enabled', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(verified()).mockResolvedValueOnce(accepted())
    await handleCalendarCorrection(request({}, { 'CF-Connecting-IP': '192.0.2.1' }), { ...config, trustProxy: 'true' }, send)
    expect(JSON.parse(String(send.mock.calls[0]![1]!.body)).remoteip).toBe('192.0.2.1')
  })

  it('rejects cross-origin submissions, non-JSON payloads and absent server credentials', async () => {
    const send = vi.fn<typeof fetch>()
    expect((await handleCalendarCorrection(request({}, { Origin: 'https://other.example' }), config, send)).status).toBe(403)
    expect((await handleCalendarCorrection(request({}, { 'Content-Type': 'text/plain' }), config, send)).status).toBe(415)
    expect((await handleCalendarCorrection(request(), { ...config, resendApiKey: '' }, send)).status).toBe(503)
    expect(send).not.toHaveBeenCalled()
  })

  it('bounds the actual request body rather than relying on Content-Length', async () => {
    const send = vi.fn<typeof fetch>()
    expect((await handleCalendarCorrection(request({ message: 'x'.repeat(33_000) }), config, send)).status).toBe(413)
    expect(send).not.toHaveBeenCalled()
  })

  it('routes only the correction endpoint through the Worker and preserves static asset requests', async () => {
    const assets = vi.fn<typeof fetch>().mockResolvedValue(new Response('static asset'))
    expect(await (await worker.fetch(new Request('https://flschoolcalendar.com/pdf/calendar.pdf'), { ASSETS: { fetch: assets } })).text()).toBe('static asset')
    expect(assets).toHaveBeenCalledOnce()
    expect((await worker.fetch(new Request('https://flschoolcalendar.com/api/corrections'), { ASSETS: { fetch: assets } })).status).toBe(405)
    expect(assets).toHaveBeenCalledOnce()
  })
})
