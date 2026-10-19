import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MonthlyCalendar from '../../app/components/calendar/MonthlyCalendar.vue'
import record from '../fixtures/districts/leander-isd.json'
import type { CalendarEvent } from '../../shared/types/content'
// @ts-ignore The offline checker is a dependency-free Node module.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore The statistics calculator is a dependency-free Node module.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const calendar = record.schoolYears['2026-2027']
const events = calendar.events as CalendarEvent[]
const event = (id: string) => events.find(item => item.id === id)!
const faq = (text: string) => calendar.faqs.find(item => item.question.includes(text))!

function weekdays(start: string, end: string) {
  const dates: string[] = []
  for (let cursor = new Date(start + 'T00:00:00Z'); cursor <= new Date(end + 'T00:00:00Z'); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (![0, 6].includes(cursor.getUTCDay())) dates.push(cursor.toISOString().slice(0, 10))
  }
  return dates
}

describe('Leander ISD official events and derived planning ranges', () => {
  it('passes the scoped content gate and preserves the approved school-year boundaries', () => {
    expect(auditRecords([{ filename: 'leander-isd.json', record }])).toEqual([])
    expect(calendar.firstDay).toBe('2026-08-12')
    expect(calendar.lastDay).toBe('2027-05-27')
    expect(events).toHaveLength(25)
    expect(new Set(events.map(item => item.id)).size).toBe(25)
    expect(events.map(item => item.dateStart)).toEqual(events.map(item => item.dateStart).toSorted())
    expect(events.every(item => item.basis === 'official')).toBe(true)
  })

  it.each([
    ['leander-2026-october-9-no-school', '2026-10-09', null, 'NON_STUDENT_DAY'],
    ['leander-2026-october-break', '2026-10-12', '2026-10-13', 'STUDENT_BREAK'],
    ['leander-2026-winter-break', '2026-12-21', '2027-01-01', 'WINTER_BREAK'],
    ['leander-2027-january-4-no-school', '2027-01-04', null, 'NON_STUDENT_DAY'],
    ['leander-2027-february-12-no-school', '2027-02-12', null, 'NON_STUDENT_DAY'],
    ['leander-2027-february-break', '2027-02-15', '2027-02-16', 'STUDENT_BREAK'],
    ['leander-2027-march-break', '2027-03-26', null, 'STUDENT_BREAK'],
    ['leander-2027-march-29-no-school', '2027-03-29', null, 'NON_STUDENT_DAY'],
  ])('keeps %s atomic and referenced by the attendance model', (id, dateStart, dateEnd, eventType) => {
    expect(event(id!)).toMatchObject({ dateStart, dateEnd, eventType, basis: 'official' })
    expect(calendar.noSchoolDayEventIds).toContain(id)
  })

  it('retains the derived October, winter, February and March planning ranges only in breaks', () => {
    expect(calendar.breaks.map(item => [item.dateStart, item.dateEnd, item.schoolWeekdaysOff])).toEqual([
      ['2026-10-09', '2026-10-13', 3],
      ['2026-11-23', '2026-11-27', 5],
      ['2026-12-21', '2027-01-04', 11],
      ['2027-02-12', '2027-02-16', 3],
      ['2027-03-15', '2027-03-19', 5],
      ['2027-03-26', '2027-03-29', 2],
    ])
    expect(calendar.keyDates.find(item => item.eventType === 'WINTER_BREAK')).toMatchObject({
      dateEnd: '2027-01-01', basis: 'official',
    })
  })

  it('reproduces the same 35 closure weekdays and 172 calculated attendance days', () => {
    const closures = new Set(events.filter(item => calendar.noSchoolDayEventIds.includes(item.id))
      .flatMap(item => weekdays(item.dateStart!, item.dateEnd || item.dateStart!)))
    expect(closures.size).toBe(35)
    expect(weekdays(calendar.firstDay, calendar.lastDay).filter(date => !closures.has(date))).toHaveLength(172)
    expect(calculateCalendarStatistics(calendar)).toEqual(calendar.statistics)
  })

  it('represents proposed testing as a window rather than daily exams or overridden closures', () => {
    const window = event('leander-2027-proposed-staar-window')
    expect(window).toMatchObject({
      dateStart: '2027-04-05', dateEnd: '2027-04-30', eventType: 'STATE_TEST',
      schoolStatus: 'not-applicable', status: 'proposed', isWindow: true, noteBasis: 'derived',
    })
    expect(window.gradeScope).toBeNull()
    expect(window.sourceId).toBe('leander-2026-2027-high-school-calendar-pdf')
    expect(window.note).toContain('April 26 remains a districtwide no-school day')
    const wrapper = mount(MonthlyCalendar, {
      props: { districtName: record.district.shortName, events, firstDay: calendar.firstDay, lastDay: calendar.lastDay },
    })
    try {
      expect(wrapper.find('time[datetime="2027-04-26"]').element.parentElement?.classList.contains('month-day--holiday')).toBe(true)
    }
    finally {
      wrapper.unmount()
    }
  })

  it.each([
    { status: 'adopted', code: 'INVALID_EVENT_STATUS' },
    { isWindow: 'yes', code: 'INVALID_EVENT_BOOLEAN' },
    { dateEnd: null, code: 'MISSING_WINDOW_END_DATE' },
    { schoolStatus: 'exam-day', code: 'WINDOW_AS_EXAM_DAY' },
  ])('rejects invalid window metadata: $code', ({ code, ...changes }) => {
    const copy = structuredClone(record)
    Object.assign(copy.schoolYears['2026-2027'].events.find(item => item.id === 'leander-2027-proposed-staar-window')!, changes)
    expect(auditRecords([{ filename: 'leander-isd.json', record: copy }])
      .some((issue: { code: string }) => issue.code === code)).toBe(true)
  })

  it('keeps early-release dates and clock times linked to the calendar page', () => {
    for (const id of ['leander-2026-december-18-early-release', 'leander-2027-last-day']) {
      expect(event(id).timeSourceId).toBe('leander-isd-calendar-page')
      expect(event(id).note).toContain('11:30 a.m.')
      expect(event(id).note).toContain('1:05 p.m.')
      expect(event(id).note).toContain('12:15 p.m.')
    }
    expect(faq('afternoon Pre-K').answer).toContain('No half-day PreK 3 PM classes')
    expect(calendar.highSchoolSchedule.gradingPeriods).toHaveLength(6)
    expect(calendar.highSchoolSchedule.specialDays[0]?.date).toBe('2026-10-20')
  })

  it('separates unrelated FAQ dates and official Winter Break from its return date', () => {
    expect(faq('September 21, 2026').answer).not.toContain('November')
    expect(faq('November 2–3, 2026').answer).not.toContain('September')
    expect(faq('winter break in 2026-2027').answer).toContain('through January 1, 2027')
    expect(faq('return after winter break').answer).toContain('January 5, 2027')
    expect(faq('January 4, 2027').answer).toContain('professional-learning day')
    expect(new Set(calendar.faqs.map(item => item.question)).size).toBe(calendar.faqs.length)
    expect(calendar.seo.title.length).toBeLessThanOrEqual(60)
    expect(calendar.seo.description.length).toBeLessThanOrEqual(160)
    expect(JSON.stringify([calendar.hero, calendar.editorialSummary])).not.toContain('continuous')
  })

  it('gives the two March closures separate questions and avoids repeating the hero in the introduction', () => {
    expect(calendar.faqs).toHaveLength(24)
    expect(faq('March 26, 2027').answer).toContain('student/staff break')
    expect(faq('March 29, 2027').answer).toContain('professional-learning day')
    expect(calendar.faqs.some(item => item.question.includes('March 26 or March 29'))).toBe(false)
    expect(calendar.editorialSummary.paragraphs[0]).toContain('no-school stretches are longer than the named breaks alone')
    expect(calendar.editorialSummary.paragraphs[0]).not.toContain('school year begins')
    const visibleProse = JSON.stringify([calendar.editorialSummary, calendar.faqs, events.map(item => item.note)])
    expect(visibleProse).not.toMatch(/(?:October|November|March|April|Oct\.|Nov\.) \d{1,2}-\d{1,2}/)
  })

  it('keeps final prose source-bounded and renders time ranges consistently', () => {
    expect(calendar.hero.desktopDescription).toContain('The approved calendar includes')
    expect(faq('February break').answer).toContain('Monday and Tuesday, February 15–16')
    expect(faq('high school C Day').answer).toBe('The high school calendar marks Tuesday, October 20, 2026, as a C Day.')
    const testingAnswer = faq('proposed Leander ISD high school STAAR window').answer
    expect(testingAnswer).toContain(calendar.highSchoolSchedule.proposedStaarWindow.note.split('. ').slice(1).join('. ').replace(/\.$/, ''))
    expect(testingAnswer).not.toMatch(/campus|course/)
    expect(JSON.stringify([calendar.schoolHours, calendar.faqs])).not.toMatch(/\d{1,2}:\d{2}(?: [ap]\.m\.)?-\d{1,2}:\d{2}/)
    expect(faq('regular Leander ISD school hours').answer).toContain('7:30 a.m.–2:50 p.m.')
  })
})
