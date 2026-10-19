import { sendRedirect } from 'h3'

export default defineEventHandler(event =>
  sendRedirect(event, '/api/homepage-featured.json', 308),
)
