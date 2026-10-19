import { describe, expect, it } from 'vitest'
import record from '../fixtures/districts/kipp-texas-public-schools.json'
import type { CalendarEvent } from '../../shared/types/content'
// @ts-ignore The offline checker is a dependency-free Node module.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore The statistics calculator is a dependency-free Node module.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const calendar = record.schoolYears['2026-2027-austin-dallas']
const events = calendar.events as CalendarEvent[]
const event = (suffix: string) => events.find(item => item.id === `kipp-austin-dallas-${suffix}`)!

describe('KIPP Texas Austin & Dallas provenance', () => {
  it('passes the publication gate without changing core dates or event count', () => {
    expect(auditRecords([{ filename: 'kipp-texas-public-schools.json', record }])).toEqual([])
    expect(calendar.firstDay).toBe('2026-08-10')
    expect(calendar.lastDay).toBe('2027-05-27')
    expect(events).toHaveLength(26)
    expect(calendar.seo.title).toBe('KIPP Texas Austin & Dallas School Calendar 2026-2027')
  })

  it('separates the official April make-up designation from inferred baseline attendance', () => {
    expect(event('2027-april-makeup')).toMatchObject({
      eventType: 'MAKEUP_DAY', eventTypeBasis: 'official', basis: 'official',
      schoolStatus: 'schools-open', schoolStatusBasis: 'derived',
      countsAsStudentAttendanceDayUnderPublishedSchedule: true,
      countsAsStudentAttendanceDayUnderPublishedScheduleBasis: 'derived',
      noteBasis: 'derived',
    })
    expect(event('2027-april-makeup')).not.toHaveProperty('countsAsStudentAttendanceDay')
    expect(calendar.faqs.find(item => item.question.startsWith('Is April 23'))?.answer)
      .toContain('This record therefore treats April 23 as a regular school day under the published schedule')
  })

  it('retains March 29 as conditional rather than a permanent closure', () => {
    expect(event('2027-march-makeup')).toMatchObject({
      eventTypeBasis: 'derived', schoolStatus: 'conditional-attendance',
      countsAsStudentAttendanceDayUnderPublishedSchedule: false,
      scheduledAsNoSchool: true, mayBecomeAttendanceDay: true,
    })
    expect(calendar.confirmedNoSchoolDayEventIds).not.toContain(event('2027-march-makeup').id)
    expect(calendar.conditionalNoSchoolDayEventIds).toContain(event('2027-march-makeup').id)
  })

  it('keeps February conference notes within the printed categories', () => {
    const conference = event('2027-winter-conference')
    expect(conference.noteBasis).toBe('official')
    expect(conference.note).toContain('both categories are marked No School for Students')
    expect(conference.note).not.toContain('for staff')
    const answer = calendar.faqs.find(item => item.question.startsWith('When are family conferences'))!.answer
    expect(answer).toContain('both calendar categories are marked no school for students')
    expect(answer).not.toContain('staff schedule')
  })

  it('uses consistent conference punctuation in key dates and events', () => {
    for (const date of ['2026-10-09', '2027-02-12']) {
      const keyDate = calendar.keyDates.find(item => item.dateStart === date)!
      const conference = events.find(item => item.dateStart === date && item.eventType === 'TEACHER_CONFERENCE')!
      expect(keyDate.label).toBe(conference.name)
      expect(conference.name).toContain(' — No School for Students')
    }
  })

  it('preserves stored statistics and the official 175 versus printed-cycle 176 discrepancy', () => {
    // Shared generator wording can evolve independently of this record's counts.
    const figures = (items: Array<{ id: string; value: string; basis: string }>) => items.map(({ id, value, basis }) => ({ id, value, basis }))
    expect(figures(calculateCalendarStatistics(calendar))).toEqual(figures(calendar.statistics))
    expect(calendar.statistics.find(item => item.id === 'student-attendance-days')?.value).toBe('175 days')
    expect(calendar.sourceDiscrepancies[0]?.effect).toContain('add up to 176')
  })

  it.each(['official', 'derived'])('accepts %s baseline-attendance provenance', (basis) => {
    const copy = structuredClone(record)
    Object.assign(copy.schoolYears['2026-2027-austin-dallas'].events.find(item => item.id.endsWith('april-makeup'))!, {
      countsAsStudentAttendanceDayUnderPublishedScheduleBasis: basis,
    })
    expect(auditRecords([{ filename: 'kipp-texas-public-schools.json', record: copy }])).toEqual([])
  })

  it('rejects an invalid or orphan baseline-attendance basis', () => {
    const copy = structuredClone(record)
    const april = copy.schoolYears['2026-2027-austin-dallas'].events.find(item => item.id.endsWith('april-makeup'))! as CalendarEvent
    Object.assign(april, { countsAsStudentAttendanceDayUnderPublishedScheduleBasis: 'guessed' })
    expect(auditRecords([{ filename: 'kipp-texas-public-schools.json', record: copy }])
      .some((issue: { code: string }) => issue.code === 'INVALID_CONDITIONAL_STATUS_BASIS')).toBe(true)
    april.countsAsStudentAttendanceDayUnderPublishedScheduleBasis = 'derived'
    delete april.countsAsStudentAttendanceDayUnderPublishedSchedule
    expect(auditRecords([{ filename: 'kipp-texas-public-schools.json', record: copy }])
      .some((issue: { code: string }) => issue.code === 'MISSING_CONDITIONAL_STATUS_FLAG')).toBe(true)
  })

  it('recognizes explicit published-schedule attendance on a weekend', () => {
    const statistics = calculateCalendarStatistics({
      firstDay: '2026-08-03', lastDay: '2026-08-08', highlights: [],
      events: [{
        id: 'weekend-makeup', dateStart: '2026-08-08', dateEnd: null,
        eventType: 'MAKEUP_DAY', schoolStatus: 'schools-open',
        countsAsStudentAttendanceDayUnderPublishedSchedule: true,
        countsAsStudentAttendanceDayUnderPublishedScheduleBasis: 'official',
      }],
      noSchoolDayEventIds: [],
    })
    expect(statistics.find((item: { id: string }) => item.id === 'student-attendance-days'))
      .toMatchObject({ value: '6 days', basis: 'derived' })
  })
})
