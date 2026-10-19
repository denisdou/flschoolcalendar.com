export const defaultCalendarTimeZone = 'America/New_York'

export function dateInCalendarTimeZone(
  value = new Date(),
  timeZone = defaultCalendarTimeZone,
): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).formatToParts(value)
  const valueByPart = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${valueByPart.year}-${valueByPart.month}-${valueByPart.day}`
}

export function calendarTimeZoneLabel(timeZone: string): string {
  if (timeZone === 'America/New_York') return 'Eastern Time'
  if (timeZone === 'America/Denver') return 'Mountain Time'
  if (timeZone === 'America/Chicago') return 'Central Time'
  return timeZone
}

export function calendarDayDifference(start: string, end: string): number {
  const toUtcDay = (value: string) => {
    const [year = 0, month = 0, day = 0] = value.split('-').map(Number)
    return Date.UTC(year, month - 1, day)
  }

  return Math.round((toUtcDay(end) - toUtcDay(start)) / 86_400_000)
}
