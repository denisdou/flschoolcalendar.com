import { toWebRequest } from 'h3'
import { handleCalendarCorrection } from '../utils/calendarCorrections'

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  return handleCalendarCorrection(toWebRequest(event), {
    ...config.corrections,
    siteUrl: config.public.siteUrl,
  })
})
