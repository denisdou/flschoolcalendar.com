import type { CalendarEvent, CalendarEventDisplayGroup } from '../types/content'
import type { CalendarDisplayEvent } from './calendarEventDisplay.mjs'

export function monthlyCalendarEvents(events: CalendarEvent[], firstDay: string | null, lastDay: string | null): Array<CalendarEvent & { dateStart: string }>
export function isMonthListEvent(event: CalendarEvent): boolean
export function monthlyCalendarListEvents(events: CalendarEvent[], groups?: CalendarEventDisplayGroup[]): Array<CalendarDisplayEvent & { dateStart: string }>
export function monthlyEventTone(events: CalendarEvent[]): 'boundary' | 'break' | 'holiday' | 'conditional' | 'important' | null
