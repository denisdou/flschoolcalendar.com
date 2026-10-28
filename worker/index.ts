import { handleCalendarCorrection } from '../server/utils/calendarCorrections'

interface Env {
  ASSETS: { fetch: typeof fetch }
  NUXT_CORRECTIONS_RESEND_API_KEY?: string
  NUXT_CORRECTIONS_FROM?: string
  NUXT_CORRECTIONS_TO?: string
  NUXT_CORRECTIONS_TURNSTILE_SECRET?: string
  NUXT_CORRECTIONS_TURNSTILE_HOSTS?: string
  NUXT_CORRECTIONS_TRUST_PROXY?: string
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname
    if (path === '/api/corrections' || path === '/api/corrections/') {
      return handleCalendarCorrection(request, {
        resendApiKey: env.NUXT_CORRECTIONS_RESEND_API_KEY || '',
        from: env.NUXT_CORRECTIONS_FROM || '',
        to: env.NUXT_CORRECTIONS_TO || '',
        turnstileSecret: env.NUXT_CORRECTIONS_TURNSTILE_SECRET || '',
        turnstileHosts: env.NUXT_CORRECTIONS_TURNSTILE_HOSTS || 'flschoolcalendar.com,www.flschoolcalendar.com',
        trustProxy: env.NUXT_CORRECTIONS_TRUST_PROXY || 'false',
        siteUrl: 'https://flschoolcalendar.com',
      })
    }
    return env.ASSETS.fetch(request)
  },
}
