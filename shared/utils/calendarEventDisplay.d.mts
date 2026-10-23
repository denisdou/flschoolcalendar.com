import type { CalendarEvent, CalendarEventDisplayGroup } from '../types/content'

export type CalendarDisplayEvent = CalendarEvent & { isDisplayGroup?: boolean; displayGroupEventIds?: string[] }
export function eventDisplayGroupError(events: CalendarEvent[], group: CalendarEventDisplayGroup): string | null
export function groupCalendarEvents(events: CalendarEvent[], groups?: CalendarEventDisplayGroup[]): CalendarDisplayEvent[]
export function secondaryGraduationLabels(event: CalendarEvent): string[]
