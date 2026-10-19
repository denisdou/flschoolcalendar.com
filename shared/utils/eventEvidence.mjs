/** Grouped or inferred schedule entries must not look like directly published events. */
export function isCalculatedScheduleEntry(event) {
  return event.basis === 'derived' || event.dateBasis === 'derived'
}
