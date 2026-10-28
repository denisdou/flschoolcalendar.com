export interface CorrectionConfig {
  resendApiKey: string
  from: string
  to: string
  turnstileSecret: string
  turnstileHosts: string
  trustProxy: boolean | string
  siteUrl: string
}

export const correctionAction = 'calendar_correction'
const maxBodyBytes = 32_768
const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function reply(status: number, message: string) {
  return Response.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store' } })
}

async function readPayload(request: Request): Promise<unknown> {
  if (Number(request.headers.get('content-length')) > maxBodyBytes) throw new RangeError('Payload too large')
  const reader = request.body?.getReader()
  if (!reader) return null
  const decoder = new TextDecoder()
  let bytes = 0, text = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxBodyBytes) {
        await reader.cancel()
        throw new RangeError('Payload too large')
      }
      text += decoder.decode(value, { stream: true })
    }
    return JSON.parse(text + decoder.decode())
  }
  finally { reader.releaseLock() }
}

function field(body: Record<string, unknown>, key: string, max: number): string | null {
  const value = body[key]
  return typeof value === 'string' && value.length <= max ? value.trim() : null
}

// Shared by the Nuxt development endpoint and the production Cloudflare Worker.
// Only this server module calls Siteverify and Resend; secrets never enter page data.
export async function handleCalendarCorrection(request: Request, config: CorrectionConfig, send: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'POST') {
    const response = reply(405, 'Use POST to submit a correction.')
    response.headers.set('Allow', 'POST')
    return response
  }
  const url = new URL(request.url)
  if (request.headers.get('origin') !== url.origin) return reply(403, 'Please submit the form from this website.')
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    return reply(415, 'Submit the correction as JSON.')
  }
  const recipients = config.to.split(',').map(value => value.trim()).filter(Boolean)
  const hosts = config.turnstileHosts.split(',').map(value => value.trim().toLowerCase()).filter(Boolean)
  if (!config.resendApiKey || !config.turnstileSecret || !config.from || /[\r\n]/.test(config.from)
    || !recipients.length || recipients.some(value => !emailPattern.test(value)) || !hosts.includes(url.hostname.toLowerCase())) {
    return reply(503, 'Online submission is temporarily unavailable. Please email corrections@flschoolcalendar.com.')
  }
  let payload: unknown
  try { payload = await readPayload(request) }
  catch (error) {
    return error instanceof RangeError ? reply(413, 'Your correction is too long.') : reply(400, 'The form could not be read. Please try again.')
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return reply(400, 'Please check the form and try again.')
  const body = payload as Record<string, unknown>
  const message = field(body, 'message', 5000)
  const email = field(body, 'email', 254)
  const district = field(body, 'district', 200)
  const schoolYear = field(body, 'schoolYear', 9)
  const page = field(body, 'page', 500)
  const token = field(body, 'turnstileToken', 2048)
  const submissionId = field(body, 'submissionId', 36)
  if (!message || message.length < 10 || email === null || (email && !emailPattern.test(email)) || /[\r\n]/.test(email)
    || !district || /[\r\n\u0000-\u001f]/.test(district) || !schoolYear || !/^20\d{2}-20\d{2}$/.test(schoolYear)
    || Number(schoolYear.slice(5)) !== Number(schoolYear.slice(0, 4)) + 1
    || !page || !token || !submissionId || !uuidPattern.test(submissionId)) {
    return reply(400, 'Please check your message, email address and verification, then try again.')
  }
  try {
    const pageUrl = new URL(page)
    if (pageUrl.origin !== new URL(config.siteUrl).origin || pageUrl.username || pageUrl.password || pageUrl.search || pageUrl.hash
      || !new RegExp(`^/[a-z0-9]+(?:-[a-z0-9]+)*/${schoolYear}(?:-[a-z0-9]+)*/$`).test(pageUrl.pathname)) {
      return reply(400, 'Please report the correction from its calendar page.')
    }
  }
  catch { return reply(400, 'Please report the correction from its calendar page.') }

  const verificationBody: Record<string, string> = { secret: config.turnstileSecret, response: token }
  if (config.trustProxy === true || config.trustProxy === 'true') {
    const ip = request.headers.get('cf-connecting-ip')
    if (ip) verificationBody.remoteip = ip
  }
  try {
    const response = await send('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(verificationBody), signal: AbortSignal.timeout(10_000),
    })
    const result = await response.json() as { success?: boolean; hostname?: string; action?: string }
    if (!response.ok || result.success !== true || result.action !== correctionAction || result.hostname?.toLowerCase() !== url.hostname.toLowerCase()) {
      return reply(400, 'Verification failed or expired. Please verify again and retry.')
    }
  }
  catch { return reply(502, 'Verification is temporarily unavailable. Please try again.') }

  try {
    const response = await send('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `calendar-correction/${submissionId}`,
      },
      body: JSON.stringify({
        from: config.from, to: recipients,
        ...(email ? { reply_to: email } : {}),
        subject: `Calendar correction — ${district} ${schoolYear}`,
        text: [`Calendar page: ${page}`, `District: ${district}`, `School year: ${schoolYear}`, `Reply email: ${email || 'Not provided'}`, '', message].join('\n'),
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return reply(502, 'Your correction could not be sent. Please retry or email corrections@flschoolcalendar.com.')
    const result = await response.json() as { id?: string }
    if (!result.id) return reply(502, 'Your correction could not be confirmed. Please retry.')
  }
  catch { return reply(502, 'Your correction could not be confirmed. Please retry or email corrections@flschoolcalendar.com.') }
  return Response.json({ ok: true }, { status: 202, headers: { 'Cache-Control': 'no-store' } })
}
