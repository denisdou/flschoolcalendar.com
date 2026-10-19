import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import MonthlyCalendar from '../../app/components/calendar/MonthlyCalendar.vue'
import record from '../fixtures/districts/northwest-isd.json'
import type { CalendarEvent } from '../../shared/types/content'
// @ts-ignore Dependency-free offline content validator.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

describe('Northwest ISD calendar content and testing windows', () => {
  it('passes the content gate for both approved school years', () => {
    expect(auditRecords([{ filename: 'northwest-isd.json', record }])).toEqual([])
  })

  it.each([
    ['2026-2027', '2026-08-12', '2027-05-21', 23, 34, 2],
    ['2027-2028', '2027-08-18', '2028-05-25', 20, 33, 3],
  ] as const)('preserves %s attendance boundaries, counts and identifiers', (year, firstDay, lastDay, faqCount, closures, windows) => {
    const calendar = record.schoolYears[year]
    expect(calendar).toMatchObject({ firstDay, lastDay })
    expect(calendar.faqs).toHaveLength(faqCount)
    expect(new Set(calendar.events.map(event => event.id)).size).toBe(calendar.events.length)
    expect(calendar.events.map(event => event.dateStart)).toEqual(calendar.events.map(event => event.dateStart).toSorted())
    expect(calendar.events.filter(event => 'isWindow' in event && event.isWindow)).toHaveLength(windows)
    const calculated = calculateCalendarStatistics(calendar)
    expect(calculated.find((item: { id: string }) => item.id === 'student-attendance-days').value).toBe('169 days')
    expect(calculated.find((item: { id: string }) => item.id === 'total-no-school-weekdays').value).toBe(closures + ' weekdays')
    expect(calculated.find((item: { id: string }) => item.id === 'early-release-days').value).toBe('2 dates')
    expect(calculated.find((item: { id: string }) => item.id === 'student-no-school-days').value).toBe('5 days')
    expect(calculated.map((item: { value: string }) => item.value)).toEqual(calendar.statistics.map(item => item.value))
    expect(calendar.events.some(event => event.eventType === 'SEMESTER_START')).toBe(false)
    expect(calendar.events.find(event => event.id.endsWith('third-quarter-start'))).toMatchObject({
      eventType: 'GRADING_PERIOD_START', name: 'Third Quarter Begins', officialLabel: 'Beginning of 3rd Quarter',
      dateBasis: 'official', eventTypeBasis: 'official',
    })
    expect(calendar.events.find(event => event.eventType === 'FIRST_DAY')?.note).toBe('First student attendance day.')
    expect(calendar.events.find(event => event.id.endsWith('mlk-day'))).toMatchObject({
      name: 'Student-Staff Holiday', nameBasis: 'official', displayName: 'Martin Luther King Jr. Day', displayNameBasis: 'derived',
    })
  })

  it.each(['2026-2027', '2027-2028'] as const)('separates %s source labels from editorial planning language', (year) => {
    const calendar = record.schoolYears[year]
    expect(calendar.seo.title).toBe('Northwest ISD School Calendar ' + year + ': Breaks & Holidays')
    expect(calendar.seo.description).toContain('Thanksgiving, winter and spring breaks')
    expect(calendar.hero.desktopDescription).not.toMatch(/extended|STAAR|future calendar|semester/i)
    expect(calendar.editorialSummary.paragraphs[0]).toContain('two')
    expect(calendar.sources.find(source => source.id === 'northwest-two-year-calendar-announcement')).toMatchObject({
      type: 'official-webpage', publishedAt: '2026-01-14',
    })
    const questions = calendar.faqs.map(faq => faq.question)
    expect(questions.join(' ')).not.toMatch(/\bNISD\b|included as.*events|available here/)
    expect(questions.filter(question => /winter break/i.test(question))).toHaveLength(1)
    expect(questions.filter(question => /Spring Break/i.test(question))).toHaveLength(1)
    expect(calendar.faqs.find(faq => /fall break/i.test(faq.question))?.answer).toContain('does not label')
    expect(calendar.faqs.find(faq => /winter break/i.test(faq.question))?.answer).toContain('separate student holidays')
    expect(calendar.faqs.find(faq => /Spring Break/i.test(faq.question))?.answer).toContain('separate student holiday')
    expect(calendar.faqs.some(faq => faq.question.includes('2028-2029'))).toBe(false)
    expect(calendar.faqs.some(faq => /Where/.test(faq.question) && faq.answer.includes('English and Spanish'))).toBe(true)
    expect(calendar.editorialSummary.highlights.join(' ')).not.toContain('return from Winter Break')
    expect(calendar.comparativeInsights.join(' ')).not.toContain('Winter recess continues through')
    expect(calendar.faqs.find(faq => /Labor Day/.test(faq.question))?.answer).toContain('Labor Day Student-Staff Holiday')
  })

  it.each([
    ['2026-2027', '2027', '2027-01-01', '2027-01-04', '2027-01-05', '2027-03-19', '2027-03-22', '2027-03-22'],
    ['2027-2028', '2028', '2027-12-31', '2028-01-03', '2028-01-04', '2028-03-17', '2028-03-20', '2028-03-21'],
  ] as const)('keeps %s Winter/Spring categories separate from subsequent staff days', (year, springYear, winterEnd, januaryStart, januaryEnd, springEnd, marchStart, marchEnd) => {
    const calendar = record.schoolYears[year]
    const winter = calendar.events.find(event => event.eventType === 'WINTER_BREAK')! as CalendarEvent
    const spring = calendar.events.find(event => event.eventType === 'SPRING_BREAK')! as CalendarEvent
    const winterBasis = year === '2026-2027' ? 'derived' : 'official'
    expect(winter).toMatchObject({ dateEnd: winterEnd, name: 'Student-Staff Holiday', nameBasis: 'official', basis: winterBasis, dateBasis: winterBasis, eventTypeBasis: 'derived', schoolStatusBasis: 'official' })
    expect(spring).toMatchObject({ dateEnd: springEnd, name: 'Spring Break', dateBasis: 'official', eventTypeBasis: 'official' })
    expect(spring.id).toBe(`northwest-${springYear}-spring-break`)
    expect(JSON.stringify(calendar)).not.toMatch(/northwest-\d{4}-spring-break-and-holidays?/)
    const january = calendar.events.find(event => event.id === `northwest-${springYear}-january-student-holidays`)!
    const march = calendar.events.find(event => event.id === `northwest-${springYear}-march-student-holiday${springYear === '2027' ? '' : 's'}`)!
    expect(january).toMatchObject({ dateStart: januaryStart, dateEnd: januaryEnd, eventType: 'NON_STUDENT_DAY', basis: 'official', schoolStatus: 'no-students' })
    expect(march).toMatchObject({ dateStart: marchStart, eventType: 'NON_STUDENT_DAY', basis: 'official', schoolStatus: 'no-students' })
    expect(march.dateEnd || march.dateStart).toBe(marchEnd)
    for (const event of [winter, spring, january, march]) expect(calendar.noSchoolDayEventIds).toContain(event.id)
    expect(calendar.keyDates.find(item => item.eventType === 'WINTER_BREAK')).toMatchObject({ dateEnd: winterEnd, dateBasis: winterBasis })
    expect(calendar.keyDates.find(item => item.eventType === 'SPRING_BREAK')).toMatchObject({ dateEnd: springEnd, basis: 'official' })
    expect(calendar.breaks.find(item => item.name.startsWith('Winter'))?.dateEnd).toBe(januaryEnd)
    expect(calendar.breaks.find(item => item.name.startsWith('Spring'))?.dateEnd).toBe(marchEnd)
    const uil = calendar.events.find(event => event.id.endsWith('uil-grade-check'))! as CalendarEvent
    expect(uil).toMatchObject({ note: 'Six-week UIL grade check.', noteBasis: 'official', gradeScopeBasis: 'derived' })
    expect(uil.note).not.toMatch(/eligibility/)
  })

  it.each(['2026-2027', '2027-2028'] as const)('retains source labels for normalized %s holiday and quarter names', (year) => {
    const calendar = record.schoolYears[year]
    expect(calendar.seo.description).toContain('and the official PDF.')
    const labor = calendar.events.find(event => event.id.endsWith('labor-day'))! as CalendarEvent
    expect(labor).toMatchObject({ name: 'Labor Day Holiday', officialLabel: 'Labor Day Student-Staff Holiday', nameBasis: 'derived', dateBasis: 'official', eventTypeBasis: 'official' })
    for (const event of calendar.events.filter(item => /-(first|second|third|fourth)-quarter-(start|end)$/.test(item.id)) as CalendarEvent[]) {
      expect(event).toMatchObject({ nameBasis: 'derived', dateBasis: 'official', eventTypeBasis: 'official' })
      expect(event.officialLabel).toMatch(/^(Beginning of|End of) [1-4](st|nd|rd|th) Quarter/)
      if (event.id.endsWith('second-quarter-end') || event.id.endsWith('fourth-quarter-end')) expect(event.officialLabel).toContain('Early Release')
    }
  })

  it('answers the revised school-day and hours questions directly', () => {
    const current = record.schoolYears['2026-2027']
    for (const date of ['March 5', 'April 23']) {
      expect(current.faqs.find(faq => faq.question.includes(date) && faq.question.includes('have school'))?.answer).toMatch(/^No\./)
    }
    expect(current.faqs.find(faq => faq.question.includes('four-day weekend in February'))?.answer).toMatch(/^Yes\./)
    expect(record.schoolYears['2027-2028'].faqs.find(faq => faq.question === 'What are Northwest ISD school hours in 2027-2028?')?.answer).toMatch(/^Elementary schools run/)
  })

  it('uses explicit dates for 2026-27 and derived shading ranges for 2027-28 without daily exam status', () => {
    for (const [year, calendar] of Object.entries(record.schoolYears)) {
      for (const event of calendar.events.filter(event => event.eventType === 'STATE_TEST') as CalendarEvent[]) {
        expect(event).toMatchObject({ isWindow: true, schoolStatus: 'not-applicable', schoolStatusBasis: 'derived', noteBasis: 'derived', nameBasis: 'derived' })
        expect(event.dateBasis).toBe(year === '2026-2027' ? 'official' : 'derived')
        expect(event.gradeScope).toBeUndefined()
        expect(event.note).toContain('does not designate every day as an exam day')
        expect(calendar.noSchoolDayEventIds).not.toContain(event.id)
      }
    }
  })

  it.each([
    ['2026-2027', '2027-04-23'],
    ['2027-2028', '2027-09-06'],
    ['2027-2028', '2028-01-17'],
    ['2026-2027', '2027-01-04'],
    ['2026-2027', '2027-03-22'],
    ['2027-2028', '2028-01-03'],
    ['2027-2028', '2028-03-21'],
  ] as const)('does not let testing windows override the %s holiday on %s', (year, date) => {
    const calendar = record.schoolYears[year]
    const wrapper = mount(MonthlyCalendar, {
      props: { districtName: record.district.shortName, events: calendar.events as CalendarEvent[], firstDay: calendar.firstDay, lastDay: calendar.lastDay },
    })
    try {
      expect(wrapper.find('time[datetime="' + date + '"]').element.parentElement?.classList.contains('month-day--holiday')).toBe(true)
      expect(calendar.events.filter(event => event.dateStart <= date && (event.dateEnd || event.dateStart) >= date)
        .some(event => event.schoolStatus === 'exam-day')).toBe(false)
    }
    finally { wrapper.unmount() }
  })

  it('rejects regression from a testing window to an exam-day range', () => {
    const copy = structuredClone(record)
    const window = copy.schoolYears['2027-2028'].events.find(event => event.id === 'northwest-2027-fall-staar-window')!
    window.schoolStatus = 'exam-day'
    expect(auditRecords([{ filename: 'northwest-isd.json', record: copy }]).some((issue: { code: string }) => issue.code === 'WINDOW_AS_EXAM_DAY')).toBe(true)
  })

  it.each(['2026-2027', '2027-2028'] as const)('exports safe %s ICS descriptions with stable UIDs', (year) => {
    const calendar = record.schoolYears[year]
    const ics = readFileSync('test/fixtures' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r\n /g, '')
    expect(ics).not.toContain('School status: exam day')
    expect(ics).not.toContain('CATEGORIES:SEMESTER_START')
    for (const event of calendar.events.filter(event => event.eventType === 'STATE_TEST')) {
      expect(ics).toContain('UID:' + event.id + '@flschoolcalendar.com')
      expect(ics).toContain('SUMMARY:' + event.name)
    }
    expect(ics).toContain('Official calendar label: Student-Staff Holiday')
    expect(ics).not.toMatch(/UID:northwest-\d{4}-spring-break-and-holidays?@/)
    for (const event of calendar.events.filter(event => /january-student-holidays|march-student-holidays?$|winter-break|spring-break$/.test(event.id))) {
      const block = ics.split('BEGIN:VEVENT').find(item => item.includes('UID:' + event.id + '@flschoolcalendar.com'))!
      expect(block).toContain('DTSTART;VALUE=DATE:' + event.dateStart.replaceAll('-', ''))
      const exclusiveEnd = new Date((event.dateEnd || event.dateStart) + 'T00:00:00Z')
      exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1)
      expect(block).toContain('DTEND;VALUE=DATE:' + exclusiveEnd.toISOString().slice(0, 10).replaceAll('-', ''))
    }
    const spring = calendar.events.find(event => event.eventType === 'SPRING_BREAK')!
    expect(ics.match(new RegExp('UID:' + spring.id + '@flschoolcalendar\\.com', 'g'))).toHaveLength(1)
    expect(ics).toContain('Official calendar label: Labor Day Student-Staff Holiday')
  })
})
