export const correctionEmail = 'corrections@flschoolcalendar.com'

export function calendarCorrectionHref(context: { page: string; district: string; schoolYear: string; message?: string; email?: string }): string {
  const body = [
    'Page: ' + context.page,
    'District: ' + context.district,
    'School year: ' + context.schoolYear,
    ...(context.email?.trim() ? ['Reply email: ' + context.email.trim()] : []),
    '',
    context.message?.trim() || 'Please attach your file and describe the correction below:',
  ].join('\n')
  return `mailto:${correctionEmail}?subject=${encodeURIComponent('Calendar correction — ' + context.district + ' ' + context.schoolYear)}&body=${encodeURIComponent(body)}`
}
