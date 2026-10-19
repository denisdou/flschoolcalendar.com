import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import record from '../fixtures/districts/prosper-isd.json'
import type { CalendarEvent } from '../../shared/types/content'
import { getEventTypes, hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore The statistics generator is a dependency-free Node module.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const calendar = record.schoolYears['2026-2027']
const events = calendar.events as CalendarEvent[]
const event = (id: string) => events.find(item => item.id === id)!

describe('Prosper ISD publication-ready calendar', () => {
  it('prioritizes the official January 5 grading start without dropping derived semester meaning', () => {
    const january = event('prosper-2027-third-nine-weeks-start')
    expect(january).toMatchObject({
      dateStart: '2027-01-05',
      dateEnd: null,
      name: 'Third Nine Weeks Begins',
      nameBasis: 'derived',
      eventType: 'GRADING_PERIOD_START',
      eventTypeBasis: 'official',
      eventTypesBasis: { GRADING_PERIOD_START: 'official', SEMESTER_START: 'derived' },
      schoolStatus: 'schools-open',
      sourceId: 'prosper-2026-2027-calendar-pdf',
    })
    expect(getEventTypes(january)).toEqual(['GRADING_PERIOD_START', 'SEMESTER_START'])
    expect(hasEventType(january, 'SEMESTER_START')).toBe(true)
    expect(events.filter(item => item.dateStart === january.dateStart)).toHaveLength(1)
  })

  it('uses the same official staff-learning terminology for January 4 and March 12 in paragraph three', () => {
    expect(calendar.editorialSummary.paragraphs[2]).toContain('January 4 is a separate Professional Learning / Student Holiday, so students return January 5.')
    expect(calendar.editorialSummary.paragraphs[2]).toContain('March 12 is another Professional Learning / Student Holiday immediately before Spring Break March 15-19')
    expect(calendar.editorialSummary.paragraphs[2]).not.toContain('professional-learning/student holiday')
  })

  it('replaces the January 18 query with MLK search intent while preserving the official School Holiday name', () => {
    const faq = calendar.faqs.filter(item => /Martin Luther King/.test(item.question))
    expect(calendar.faqs).toHaveLength(28)
    expect(faq).toHaveLength(1)
    expect(faq[0]).toEqual({
      question: 'Does Prosper ISD have school on Martin Luther King Jr. Day in 2027?',
      answer: 'No. Monday, January 18, 2027, is listed as a School Holiday on the Prosper ISD academic calendar.',
    })
    expect(calendar.faqs.some(item => item.question === 'Is there school in Prosper ISD on January 18, 2027?')).toBe(false)
    expect(event('prosper-2027-january-18-holiday')).toMatchObject({ name: 'School Holiday', schoolStatus: 'no-classes', dateStart: '2027-01-18', basis: 'official' })
  })

  it('keeps the verified Good Friday answer and the original School Holiday event label', () => {
    expect(calendar.faqs.find(item => /Good Friday/.test(item.question))?.answer).toBe('No. Friday, March 26, is marked as a School Holiday on the academic calendar. The calendar does not label it Good Friday. Students return Monday, March 29.')
    expect(event('prosper-2027-march-26-holiday')).toMatchObject({ name: 'School Holiday', dateStart: '2027-03-26', eventType: 'HOLIDAY', basis: 'official' })
  })

  it('keeps the official winter and spring breaks separate from adjacent student holidays', () => {
    expect(event('prosper-2026-winter-break')).toMatchObject({ dateStart: '2026-12-21', dateEnd: '2027-01-01', eventType: 'WINTER_BREAK' })
    expect(event('prosper-2027-spring-break')).toMatchObject({ dateStart: '2027-03-15', dateEnd: '2027-03-19', eventType: 'SPRING_BREAK' })
    for (const id of ['prosper-2027-january-4-student-holiday', 'prosper-2027-march-12-student-holiday']) {
      expect(event(id)).toMatchObject({ name: 'Professional Learning / Student Holiday', eventType: 'NON_STUDENT_DAY', schoolStatus: 'no-students' })
    }
  })

  it('preserves attendance totals and conditional make-up-day semantics', () => {
    expect(events).toHaveLength(25)
    expect(calculateCalendarStatistics(calendar).map((item: { value: string }) => item.value)).toEqual(calendar.statistics.map(item => item.value))
    expect(calendar.statistics.find(item => item.id === 'student-attendance-days')?.value).toBe('170 days')
    for (const id of ['prosper-2027-february-15-weather-makeup', 'prosper-2027-april-26-weather-makeup']) {
      expect(event(id)).toMatchObject({ eventType: 'RESERVED_ATTENDANCE_DAY', schoolStatus: 'conditional-attendance', countsAsStudentAttendanceDayUnderPublishedSchedule: false, mayBecomeAttendanceDay: true })
      expect(calendar.noSchoolDayEventIds).not.toContain(id)
    }
  })

  it('exports the January milestone once, with primary and secondary classifications intact', () => {
    const ics = readFileSync('test/fixtures' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r\n /g, '')
    const entries = ics.split('BEGIN:VEVENT').slice(1)
    expect(entries).toHaveLength(events.length)
    const january = entries.filter(item => item.includes('UID:prosper-2027-third-nine-weeks-start@'))
    expect(january).toHaveLength(1)
    expect(january[0]).toContain('DTSTART;VALUE=DATE:20270105')
    expect(january[0]).toContain('SUMMARY:Third Nine Weeks Begins')
    expect(january[0]).toContain('CATEGORIES:GRADING_PERIOD_START,SEMESTER_START')
  })
})
