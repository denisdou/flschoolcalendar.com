import { createError, getRouterParam, sendRedirect } from 'h3'
import { getDistrictRecord } from '../../services/districtCatalog'

export default defineEventHandler(async (event) => {
  const routeParam = getRouterParam(event, 'slug') || ''
  const isJsonRequest = routeParam.endsWith('.json')
  const slug = isJsonRequest ? routeParam.slice(0, -5) : routeParam

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    throw createError({ statusCode: 404, statusMessage: 'District not found' })
  }

  if (isJsonRequest) {
    const record = await getDistrictRecord(event, slug)
    if (!record) {
      throw createError({ statusCode: 404, statusMessage: 'District not found' })
    }
    return record
  }

  return sendRedirect(event, '/api/districts/' + slug + '.json', 308)
})
