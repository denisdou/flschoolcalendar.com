import { mount, shallowMount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { splitCalendarDetailEvents } from '../../shared/utils/calendarDetailSections'
import DistrictCalendarPage from '../../app/components/calendar/DistrictCalendarPage.vue'
import CalendarEventsTable from '../../app/components/calendar/CalendarEventsTable.vue'
import type { CalendarEvent, DistrictRecord } from '../../shared/types/content'
import hernando from '../../server/data/districts/records/hernando-county-school-district.json'
import hamilton from '../../server/data/districts/records/hamilton-county-school-district.json'
import gadsden from '../../server/data/districts/records/gadsden-county-school-district.json'
import indianRiver from '../../server/data/districts/records/indian-river-county-school-district.json'
import bradford from '../../server/data/districts/records/bradford-county-school-district.json'
import bay from '../../server/data/districts/records/bay-county-school-district.json'
import franklin from '../../server/data/districts/records/franklin-county-school-district.json'
import hillsborough from '../../server/data/districts/records/hillsborough-county-public-schools.json'

const record = hernando as unknown as DistrictRecord
const calendar = record.schoolYears['2026-2027']!
const tablesFor = (events: CalendarEvent[]) => shallowMount(DistrictCalendarPage, {
  props: { district: record.district, calendar: { ...calendar, events }, calendars: [calendar], nearbyDistricts: [], otherDistricts: [], relatedResources: [] },
}).findAllComponents(CalendarEventsTable)

describe('calendar detail date sections', () => {
  it('moves all ten Hernando early releases out of Key Dates and keeps the final student date', () => {
    const before = JSON.stringify(calendar.events)
    const sections = splitCalendarDetailEvents(calendar.events)
    expect(sections.earlyRelease).toHaveLength(10)
    expect(sections.earlyRelease.map(event => event.dateStart)).toContain('2027-05-28')
    const last = sections.keyDates.find(event => event.dateStart === '2027-05-28')!
    expect(last.displayName).toBe('Last Day of School')
    const keyTable = mount(CalendarEventsTable, { props: { events: sections.keyDates, districtName: record.district.name, schoolYear: calendar.schoolYear } })
    expect(keyTable.text()).not.toMatch(/early (?:release|dismissal)|grading period ends/i)
    expect(keyTable.text()).toContain('Last Day of School')
    expect(sections.otherImportant.some(event => event.dateStart === '2026-10-09')).toBe(true)
    expect(sections.otherImportant.some(event => event.dateStart === '2027-03-12')).toBe(true)
    expect(JSON.stringify(calendar.events)).toBe(before)
    keyTable.unmount()
  })

  it('places report cards and ceremonies in Other Important Dates without a closure status column', () => {
    const events = hamilton.schoolYears['2026-2027'].events as CalendarEvent[]
    const sections = splitCalendarDetailEvents(events)
    const keyTable = mount(CalendarEventsTable, { props: { events: sections.keyDates, districtName: 'Hamilton', schoolYear: '2026-2027' } })
    expect(keyTable.text()).not.toMatch(/HCHS|Graduation|Baccalaureate|early dismissal/i)
    const other = mount(CalendarEventsTable, { props: { events: sections.otherImportant, districtName: 'Hamilton', schoolYear: '2026-2027', showStatus: false, showDetails: true } })
    expect(other.findAll('thead th').map(cell => cell.text())).toEqual(['Event', 'Date(s)'])
    expect(other.text()).toContain('HCHS Graduation')
    expect(other.text()).toContain('Grade Reports')
    expect(sections.earlyRelease).toHaveLength(7)
    keyTable.unmount(); other.unmount()
  })

  it('does not infer early dismissal from an unresolved dismissal conflict or modified instructional day', () => {
    const sections = splitCalendarDetailEvents(gadsden.schoolYears['2026-2027'].events as CalendarEvent[])
    expect(sections.earlyRelease).toHaveLength(2)
    expect(sections.otherImportant.find(event => event.dateStart === '2027-03-05')?.sourceInternalConflict).toBe(true)
    const modified = splitCalendarDetailEvents(indianRiver.schoolYears['2026-2027'].events as CalendarEvent[])
    expect(modified.earlyRelease).toHaveLength(0)
    expect(modified.otherImportant.some(event => event.eventTypes?.includes('MODIFIED_DAY'))).toBe(true)
  })

  it('preserves grade scopes, timing and make-up caveats on early releases', () => {
    const event: CalendarEvent = { ...calendar.events[0]!, id: 'scoped-release', dateStart: '2026-09-04', dateEnd: null, eventType: 'HALF_DAY', eventTypes: ['HALF_DAY', 'GRADING_PERIOD_END'], schoolStatus: 'early-dismissal', gradeScope: 'High school only', note: 'Dismissal is at noon; may become a full day if needed.' }
    const sections = splitCalendarDetailEvents([event])
    const wrapper = mount(CalendarEventsTable, { props: { events: sections.earlyRelease, districtName: 'Example', schoolYear: '2026-2027', showDetails: true } })
    expect(wrapper.text()).toContain('High school only')
    expect(wrapper.text()).toContain('Dismissal is at noon; may become a full day if needed.')
    expect(sections.keyDates).toHaveLength(0)
    expect(sections.otherImportant[0]?.displayName).toBe('Grading Period Ends')
    wrapper.unmount()
  })

  it('shows each optional module only when its own events exist', () => {
    const boundary: CalendarEvent = { ...calendar.events[0]!, eventType: 'FIRST_DAY', eventTypes: ['FIRST_DAY'], schoolStatus: 'schools-open' }
    expect(tablesFor([boundary]).map(table => table.props('heading'))).toEqual(['Key Dates'])
    const release: CalendarEvent = { ...boundary, id: 'early', eventType: 'EARLY_RELEASE', eventTypes: ['EARLY_RELEASE'], schoolStatus: 'early-dismissal' }
    expect(tablesFor([boundary, release]).map(table => table.props('heading'))).toEqual(['Key Dates', 'Early Release'])
    const report: CalendarEvent = { ...boundary, id: 'report', eventType: 'REPORT_CARD', eventTypes: ['REPORT_CARD'], schoolStatus: 'not-applicable' }
    expect(tablesFor([boundary, report]).map(table => table.props('heading'))).toEqual(['Key Dates', 'Other Important Dates'])
    expect(tablesFor([boundary, release, report]).map(table => table.props('heading'))).toEqual(['Key Dates', 'Early Release', 'Other Important Dates'])
  })

  it('shows Early Release dates and titles without explanatory notes', () => {
    const event: CalendarEvent = { ...calendar.events[0]!, id: 'concise-release', dateStart: '2026-09-04', dateEnd: null, eventType: 'HALF_DAY', eventTypes: ['HALF_DAY'], schoolStatus: 'early-dismissal', gradeScope: 'High school only', name: 'Half Day', note: 'Check bus and pickup arrangements.', dateBasis: 'derived' }
    const table = tablesFor([event]).find(table => table.props('heading') === 'Early Release')!
    expect(table.props('concise')).toBe(true)
    expect(table.props('showStatus')).toBe(false)
    const wrapper = mount(CalendarEventsTable, { props: table.props() })
    expect(wrapper.findAll('thead th').map(th => th.text())).toEqual(['Event', 'Date(s)'])
    expect(wrapper.text()).toContain('Half Day (High school only)')
    expect(wrapper.text()).toContain('Sep 4, 2026')
    expect(wrapper.text()).not.toContain(event.note)
    expect(wrapper.find('.calendar-event-evidence').exists()).toBe(false)
    wrapper.unmount()
  })

  it('preserves a school-specific final-day label and separates a student-free conference', () => {
    const senior: CalendarEvent = { ...calendar.events[0]!, id: 'senior-last', eventType: 'LAST_DAY', eventTypes: ['LAST_DAY'], name: 'Last Day for Columbia High Seniors', schoolStatus: 'schools-open', gradeScope: 'Columbia High seniors' }
    const conference: CalendarEvent = { ...senior, id: 'conference', eventType: 'PARENT_CONFERENCE', eventTypes: ['PARENT_CONFERENCE'], name: 'Parent Conference', schoolStatus: 'no-classes' }
    const sections = splitCalendarDetailEvents([senior, conference])
    expect(sections.keyDates[0]?.displayName).toBe('Last Day for Columbia High Seniors')
    expect(sections.keyDates[1]?.displayName).toBe('No School for Students')
    expect(sections.keyDates[1]?.eventType).toBe('NON_STUDENT_DAY')
    expect(sections.otherImportant[0]?.displayName).toBe('Parent Conference')
  })

  it('excludes employee-only business and hides Other Important Dates when nothing family-facing remains', () => {
    const employee = (id: string, name: string, eventType: CalendarEvent['eventType'], extra: Partial<CalendarEvent> = {}): CalendarEvent => ({ ...calendar.events[0]!, id, name, eventType, eventTypes: [eventType], schoolStatus: 'not-applicable', ...extra })
    const events = [
      employee('planning', 'Virtual Planning Day', 'SCHOOL_MILESTONE'),
      employee('development', 'Professional Development Day', 'STAFF_DEVELOPMENT', { schoolStatus: 'unknown' }),
      employee('first-staff-day', 'Teachers Return', 'SCHOOL_MILESTONE', { schoolStatus: 'schools-open' }),
      employee('payroll', 'Payroll Processing', 'NON_STUDENT_DAY'),
      employee('conference', 'Teacher Conference', 'TEACHER_CONFERENCE'),
      employee('staff-orientation', 'Orientation', 'SCHOOL_MILESTONE', { participantScope: 'Employees only' }),
      employee('staff-candidate', 'Planning Day', 'SCHOOL_MILESTONE', { dateStart: null, candidateDates: [{ date: '2027-01-04', sourceRole: 'official-pdf' }] }),
    ]
    const before = JSON.stringify(events)
    expect(splitCalendarDetailEvents(events).otherImportant).toEqual([])
    expect(tablesFor(events).map(table => table.props('heading'))).not.toContain('Other Important Dates')
    expect(JSON.stringify(events)).toBe(before)
  })

  it('keeps family events that mention teachers and student-facing facets of mixed staff dates', () => {
    const base = calendar.events[0]!
    const events: CalendarEvent[] = [
      { ...base, id: 'meet', name: 'Meet the Teacher', eventType: 'MEET_THE_TEACHER', schoolStatus: 'not-applicable' },
      { ...base, id: 'conference', name: 'Parent-Teacher Conference', eventType: 'TEACHER_CONFERENCE', schoolStatus: 'schools-open' },
      { ...base, id: 'return', name: 'Students and Teachers Return', eventType: 'SCHOOL_MILESTONE', schoolStatus: 'schools-open' },
    ]
    expect(splitCalendarDetailEvents(events).otherImportant.map(event => event.id)).toEqual(events.map(event => event.id))
    const baySections = splitCalendarDetailEvents(bay.schoolYears['2027-2028'].events as CalendarEvent[])
    expect(baySections.otherImportant.find(event => event.id === 'bds-2027-2028-plc-4')?.displayName).toBe('Report Cards')
    expect(baySections.keyDates.some(event => event.id === 'bds-2027-2028-plc-4')).toBe(true)
    expect(splitCalendarDetailEvents(franklin.schoolYears['2026-2027'].events as CalendarEvent[]).otherImportant
      .some(event => event.id === 'franklin-2026-2027-open-house')).toBe(true)
    expect(splitCalendarDetailEvents(hillsborough.schoolYears['2026-2027'].events as CalendarEvent[]).otherImportant
      .some(event => event.id === 'hillsborough-2026-2027-fall-return')).toBe(true)
  })

  it('removes Bradford staff planning from Other Important Dates while preserving student holidays and returns', () => {
    const events = bradford.schoolYears['2026-2027'].events as CalendarEvent[]
    const sections = splitCalendarDetailEvents(events)
    expect(sections.otherImportant.map(event => event.id)).not.toContain('bradford-2026-2027-february-pd')
    expect(sections.otherImportant.map(event => event.id)).not.toContain('bradford-2026-2027-virtual-planning')
    expect(sections.otherImportant.some(event => /Students Return/.test(event.name))).toBe(true)
    expect(sections.keyDates.some(event => event.eventType === 'NON_STUDENT_DAY')).toBe(true)
  })

  it('keeps conditional closures in Key Dates and candidate dates explicitly unconfirmed', () => {
    const reserve = calendar.events.find(event => event.mayBecomeAttendanceDay)!
    const candidate: CalendarEvent = { ...reserve, id: 'candidate', name: 'Graduation', dateStart: null, eventType: 'SCHOOL_MILESTONE', eventTypes: ['SCHOOL_MILESTONE'], schoolStatus: 'unknown', isDateConfirmed: false, candidateDates: [{ date: '2027-03-05', sourceRole: 'official-pdf' }, { date: '2027-03-12', sourceRole: 'official-webpage' }] }
    const sections = splitCalendarDetailEvents([reserve, candidate])
    expect(sections.keyDates[0]?.mayBecomeAttendanceDay).toBe(true)
    const table = mount(CalendarEventsTable, { props: { events: sections.otherImportant, districtName: 'Example', schoolYear: '2026-2027', showStatus: false } })
    expect(table.text()).toContain('(unconfirmed)')
    expect(sections.earlyRelease).toHaveLength(0)
    table.unmount()
  })
})
