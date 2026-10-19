import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from '../../shared/types/content'
import record from '../fixtures/districts/san-antonio-isd.json'

const regular = record.schoolYears['2026-2027']
const ace = record.schoolYears['2026-2027-ace-adsy']
const aceEvents = ace.events as CalendarEvent[]

describe('San Antonio ISD campus attendance distinctions', () => {
  it('answers affirmative off-day questions consistently with regular holidays and ACE attendance', () => {
    const cases = [
      ['Are students off October 23 for parent-teacher conferences?', ['2026-10-23']],
      ['Are students off January 4 and 5, 2027?', ['2027-01-04', '2027-01-05']],
    ] as const
    for (const [question, dates] of cases) {
      const answer = regular.faqs.find(faq => faq.question === question)!.answer
      expect(answer).toMatch(/^Yes\./)
      expect(answer).toContain('On the regular district calendar')
      for (const date of dates) {
        expect(regular.events.find(event => event.dateStart === date)!.schoolStatus).toBe('no-students')
        expect(aceEvents.find(event => event.dateStart === date)!.countsAsStudentAttendanceDay).toBe(true)
      }
    }
  })

  it('retains all shared grading-end and semester-start milestones in the ACE calendar', () => {
    const milestones = regular.events.filter(event => ['GRADING_PERIOD_END', 'SEMESTER_START'].includes(event.eventType))
    expect(milestones).toHaveLength(4)
    for (const milestone of milestones) {
      const counterpart = ace.events.find(event => event.dateStart === milestone.dateStart && event.eventType === milestone.eventType)
      expect(counterpart).toMatchObject({ sourceId: 'saisd-2026-2027-ace-calendar-pdf', basis: 'official', schoolStatus: 'schools-open' })
    }
    expect(ace.events.filter(event => event.eventType === 'PROGRAM_ADSY_DAY')).toHaveLength(5)
    expect(ace.events.filter(event => event.scheduleType === 'ADSY half-day')).toHaveLength(6)
  })
})
