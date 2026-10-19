import type { CalendarStatus, DistrictCatalogEntry, EventType, KeyDate } from '../types/content'
import { formatDateRange } from './content'

type CalendarPage = DistrictCatalogEntry['calendarPages'][number]

export type ComparisonState = 'same' | 'different' | 'missing'

export interface CalendarComparisonRow {
  id: string
  label: string
  leftValue: string
  leftMeta: string | null
  rightValue: string
  rightMeta: string | null
  state: ComparisonState
  result: string
}

const millisecondsPerDay = 86_400_000

const statusLabels: Record<CalendarStatus, string> = {
  official: 'Official',
  revised: 'Revised official',
  historical: 'Historical official',
  draft: 'Draft',
}

function calendarDaysBetween(left: string, right: string): number {
  const leftTime = Date.parse(left + 'T00:00:00Z')
  const rightTime = Date.parse(right + 'T00:00:00Z')
  return Math.round((leftTime - rightTime) / millisecondsPerDay)
}

function dayCountLabel(value: number): string {
  return `${value} calendar ${value === 1 ? 'day' : 'days'}`
}

function differenceLabel(value: number): string {
  return `${Math.abs(value)} calendar ${Math.abs(value) === 1 ? 'day' : 'days'}`
}

function keyDate(calendar: CalendarPage, eventType: EventType): KeyDate | null {
  return calendar.keyDates.find(item => item.eventType === eventType) || null
}

function dateRow(
  id: string,
  label: string,
  leftDate: string | null,
  rightDate: string | null,
  leftName: string,
  rightName: string,
): CalendarComparisonRow {
  const leftValue = formatDateRange(leftDate, null)
  const rightValue = formatDateRange(rightDate, null)

  if (!leftDate || !rightDate) {
    const missingName = !leftDate && !rightDate
      ? 'both districts'
      : !leftDate ? leftName : rightName
    return {
      id,
      label,
      leftValue,
      leftMeta: null,
      rightValue,
      rightMeta: null,
      state: 'missing',
      result: `Not reported for ${missingName}.`,
    }
  }

  const difference = calendarDaysBetween(leftDate, rightDate)
  return {
    id,
    label,
    leftValue,
    leftMeta: null,
    rightValue,
    rightMeta: null,
    state: difference === 0 ? 'same' : 'different',
    result: difference === 0
      ? 'Same'
      : `${leftName} is ${differenceLabel(difference)} ${difference < 0 ? 'earlier' : 'later'}.`,
  }
}

function rangeDuration(item: KeyDate): number {
  return Math.abs(calendarDaysBetween(item.dateEnd || item.dateStart, item.dateStart)) + 1
}

function boundaryResult(label: 'Starts' | 'Ends', difference: number, leftName: string): string {
  if (difference === 0) return `${label} the same day`
  return `${label} ${differenceLabel(difference)} ${difference < 0 ? 'earlier' : 'later'} for ${leftName}`
}

function rangeRow(
  id: string,
  label: string,
  left: KeyDate | null,
  right: KeyDate | null,
  leftName: string,
  rightName: string,
): CalendarComparisonRow {
  if (!left || !right) {
    const missingName = !left && !right
      ? 'both districts'
      : !left ? leftName : rightName
    return {
      id,
      label,
      leftValue: left ? formatDateRange(left.dateStart, left.dateEnd) : 'Not published',
      leftMeta: left ? dayCountLabel(rangeDuration(left)) : null,
      rightValue: right ? formatDateRange(right.dateStart, right.dateEnd) : 'Not published',
      rightMeta: right ? dayCountLabel(rangeDuration(right)) : null,
      state: 'missing',
      result: `Not reported for ${missingName}.`,
    }
  }

  const leftEnd = left.dateEnd || left.dateStart
  const rightEnd = right.dateEnd || right.dateStart
  const startDifference = calendarDaysBetween(left.dateStart, right.dateStart)
  const endDifference = calendarDaysBetween(leftEnd, rightEnd)
  const durationDifference = rangeDuration(left) - rangeDuration(right)
  const same = startDifference === 0 && endDifference === 0
  const resultParts = [
    boundaryResult('Starts', startDifference, leftName),
    boundaryResult('Ends', endDifference, leftName),
  ]
  if (durationDifference !== 0) {
    resultParts.push(`${differenceLabel(durationDifference)} ${durationDifference < 0 ? 'shorter' : 'longer'}`)
  }

  return {
    id,
    label,
    leftValue: formatDateRange(left.dateStart, left.dateEnd),
    leftMeta: dayCountLabel(rangeDuration(left)),
    rightValue: formatDateRange(right.dateStart, right.dateEnd),
    rightMeta: dayCountLabel(rangeDuration(right)),
    state: same ? 'same' : 'different',
    result: same ? 'Same' : resultParts.join('; ') + '.',
  }
}

function statusRow(left: CalendarPage, right: CalendarPage): CalendarComparisonRow {
  const same = left.status === right.status
  return {
    id: 'calendar-status',
    label: 'Calendar status',
    leftValue: statusLabels[left.status],
    leftMeta: left.verifiedAt ? `Checked ${formatDateRange(left.verifiedAt, null)}` : null,
    rightValue: statusLabels[right.status],
    rightMeta: right.verifiedAt ? `Checked ${formatDateRange(right.verifiedAt, null)}` : null,
    state: same ? 'same' : 'different',
    result: same ? 'Same' : 'Different publication status.',
  }
}

function spanRow(
  left: CalendarPage,
  right: CalendarPage,
  leftName: string,
  rightName: string,
): CalendarComparisonRow {
  if (!left.firstDay || !left.lastDay || !right.firstDay || !right.lastDay) {
    const leftMissing = !left.firstDay || !left.lastDay
    const rightMissing = !right.firstDay || !right.lastDay
    const missingName = leftMissing && rightMissing
      ? 'both districts'
      : leftMissing ? leftName : rightName
    return {
      id: 'calendar-span',
      label: 'First-to-last-day span',
      leftValue: left.firstDay && left.lastDay
        ? dayCountLabel(calendarDaysBetween(left.lastDay, left.firstDay) + 1)
        : 'Not published',
      leftMeta: 'Calendar span, not instructional days',
      rightValue: right.firstDay && right.lastDay
        ? dayCountLabel(calendarDaysBetween(right.lastDay, right.firstDay) + 1)
        : 'Not published',
      rightMeta: 'Calendar span, not instructional days',
      state: 'missing',
      result: `Cannot calculate for ${missingName}.`,
    }
  }

  const leftDays = calendarDaysBetween(left.lastDay, left.firstDay) + 1
  const rightDays = calendarDaysBetween(right.lastDay, right.firstDay) + 1
  const difference = leftDays - rightDays
  return {
    id: 'calendar-span',
    label: 'First-to-last-day span',
    leftValue: dayCountLabel(leftDays),
    leftMeta: 'Calendar span, not instructional days',
    rightValue: dayCountLabel(rightDays),
    rightMeta: 'Calendar span, not instructional days',
    state: difference === 0 ? 'same' : 'different',
    result: difference === 0
      ? 'Same'
      : `${leftName} is ${differenceLabel(difference)} ${difference < 0 ? 'shorter' : 'longer'}.`,
  }
}

export function buildCalendarComparison(
  leftName: string,
  left: CalendarPage,
  rightName: string,
  right: CalendarPage,
): CalendarComparisonRow[] {
  return [
    statusRow(left, right),
    dateRow('first-day', 'First day of school', left.firstDay, right.firstDay, leftName, rightName),
    dateRow('last-day', 'Last scheduled day', left.lastDay, right.lastDay, leftName, rightName),
    spanRow(left, right, leftName, rightName),
    rangeRow('thanksgiving-break', 'Thanksgiving or fall break', keyDate(left, 'THANKSGIVING_BREAK') || keyDate(left, 'FALL_BREAK'), keyDate(right, 'THANKSGIVING_BREAK') || keyDate(right, 'FALL_BREAK'), leftName, rightName),
    rangeRow('winter-break', 'Winter break / recess', keyDate(left, 'WINTER_BREAK'), keyDate(right, 'WINTER_BREAK'), leftName, rightName),
    rangeRow('midwinter-break', 'Midwinter break / recess', keyDate(left, 'MIDWINTER_BREAK'), keyDate(right, 'MIDWINTER_BREAK'), leftName, rightName),
    rangeRow('spring-break', 'Spring break / recess', keyDate(left, 'SPRING_BREAK'), keyDate(right, 'SPRING_BREAK'), leftName, rightName),
  ]
}

export function hasUsefulCalendarDifferences(rows: CalendarComparisonRow[]): boolean {
  return rows.some(row => row.state === 'different' && row.id !== 'calendar-status')
}
