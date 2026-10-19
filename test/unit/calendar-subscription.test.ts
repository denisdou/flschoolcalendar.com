import { describe, expect, it } from 'vitest'
import {
  appleCalendarSubscriptionUrl,
  googleCalendarSubscriptionUrl,
} from '../../shared/utils/content'

describe('calendar subscription URLs', () => {
  const siteUrl = 'https://flschoolcalendar.com/'
  const icsPath = '/ics/austin-isd-2026-2027.ics'

  it('creates a webcal URL that opens Apple Calendar subscription', () => {
    expect(appleCalendarSubscriptionUrl(siteUrl, icsPath)).toBe(
      'webcal://flschoolcalendar.com/ics/austin-isd-2026-2027.ics',
    )
  })

  it('opens Google Calendar with the public calendar feed prefilled', () => {
    expect(googleCalendarSubscriptionUrl(siteUrl, icsPath)).toBe(
      'https://calendar.google.com/calendar/render?cid='
      + 'webcal%3A%2F%2Fflschoolcalendar.com%2Fics%2Faustin-isd-2026-2027.ics',
    )
  })
})
