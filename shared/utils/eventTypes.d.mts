import type { CalendarEvent, EventType } from '../types/content'

type ClassifiedEvent = Pick<CalendarEvent, 'eventType' | 'eventTypes'>
export function getEventTypes(event: ClassifiedEvent): EventType[]
export function hasEventType(event: ClassifiedEvent, type: EventType): boolean
