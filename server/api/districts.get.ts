import { sendRedirect } from 'h3'

export default defineEventHandler(event =>
  sendRedirect(event, '/api/districts.json', 308),
)
