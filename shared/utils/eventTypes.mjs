/** Normalize all classifications, primary first. Missing eventTypes means a legacy single-type event. */
export function getEventTypes(event) {
  return [...new Set([event.eventType, ...(Array.isArray(event.eventTypes) ? event.eventTypes : [])])]
}

/** Use for membership queries: comparing eventType alone misses secondary meanings of compound events. */
export function hasEventType(event, type) {
  return getEventTypes(event).includes(type)
}
