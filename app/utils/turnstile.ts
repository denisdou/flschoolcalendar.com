export interface TurnstileApi {
  render: (element: HTMLElement, options: {
    sitekey: string
    action: string
    theme: 'auto'
    size: 'flexible'
    callback: (token: string) => void
    'expired-callback': () => void
    'error-callback': () => void
  }) => string
  reset: (id: string) => void
  remove: (id: string) => void
}

declare global {
  interface Window { turnstile?: TurnstileApi }
}

let pending: Promise<TurnstileApi> | undefined

// Load only when a visitor opens the correction form, and share the script
// across client-side navigation between calendar pages.
export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (pending) return pending
  pending = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    const fail = () => {
      clearTimeout(timeout)
      script.remove()
      pending = undefined
      reject(new Error('Verification could not load.'))
    }
    const timeout = setTimeout(fail, 15_000)
    script.onload = () => {
      clearTimeout(timeout)
      if (window.turnstile) resolve(window.turnstile)
      else fail()
    }
    script.onerror = fail
    document.head.appendChild(script)
  })
  return pending
}
