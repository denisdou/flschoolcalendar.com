import type { CalendarSchoolHours, DistrictCalendar } from '../types/content'

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function hasHours(row: CalendarSchoolHours): boolean {
  return hasText(row.scope) && [
    row.regularHours, row.earlyReleaseHours, row.earlyReleaseTime,
    row.lateArrivalHours, row.examDismissalHours,
  ].some(hasText)
}

function formatClock(value: string): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return `${hours % 12 || 12}:${match[2]} ${hours < 12 ? 'a.m.' : 'p.m.'}`
}

/** Presentation-only adapter for existing JSON formats; never infers times from events or FAQs. */
export function getSchoolHoursRows(hours: DistrictCalendar['schoolHours']): CalendarSchoolHours[] {
  if (Array.isArray(hours)) {
    return hours.filter(row => row && typeof row === 'object' && hasHours(row))
  }
  if (!hours || typeof hours !== 'object') return []

  return (['fullDay', 'halfDay'] as const).flatMap((key) => {
    const session = hours[key]
    if (!session || !hasText(session.start) || !hasText(session.end)) return []
    const start = formatClock(session.start)
    const end = formatClock(session.end)
    if (!start || !end) return []
    return [{
      scope: session.scope || (key === 'fullDay' ? 'Full-day schedule' : 'Half-day schedule'),
      regularHours: `${start}-${end}`,
      sourceId: hours.sourceId,
      basis: hours.basis,
    }]
  })
}
