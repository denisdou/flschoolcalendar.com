import { getDistrictCatalog } from '../services/districtCatalog'

export default defineEventHandler(event => getDistrictCatalog(event))
