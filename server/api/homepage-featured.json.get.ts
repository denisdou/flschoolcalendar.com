import { send } from 'h3'
import { getHomepageFeaturedCalendar } from '../services/districtCatalog'

export default defineEventHandler(async (event) => {
  const featured = await getHomepageFeaturedCalendar(event)
  if (featured === null) {
    return send(event, 'null', 'application/json')
  }

  return featured
})
