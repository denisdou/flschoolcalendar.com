import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import CalendarEventsTable from '../../app/components/calendar/CalendarEventsTable.vue'
import type { CalendarEvent } from '../../shared/types/content'
import record from '../fixtures/districts/united-isd.json'
// @ts-ignore Shared offline content gate.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Shared offline statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const calendar = record.schoolYears['2026-2027']
const events = calendar.events as CalendarEvent[]

describe('United ISD source-verified calendar and parent-facing content', () => {
  it('passes the content gate and preserves the first, last and break dates', () => {
    const findings = auditRecords([{ filename: 'united-isd.json', record }])
    expect(findings.filter((finding: { severity: string }) => finding.severity === 'error')).toEqual([])
    // United High and United South have independent campus graduation searches,
    // even though their literal school names make the questions lexically similar.
    const unitedHighQuestionIndex = calendar.faqs.findIndex(f => f.question === 'When is UISD United High School graduation in 2027?')
    expect(findings).toEqual([expect.objectContaining({ severity: 'warning', code: 'SIMILAR_FAQ_INTENT', path: `server/data/districts/records/united-isd.json.schoolYears.2026-2027.faqs[${unitedHighQuestionIndex}].question` })])
    expect(calendar.firstDay).toBe('2026-08-12')
    expect(calendar.lastDay).toBe('2027-05-26')
    expect(events).toHaveLength(40)
    expect(calendar.breaks.map(b => [b.dateStart, b.dateEnd])).toEqual([
      ['2026-11-23', '2026-11-27'], ['2026-12-17', '2027-01-05'],
      ['2027-02-19', '2027-02-22'], ['2027-03-08', '2027-03-12'],
    ])
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
    expect(calendar.statistics.find(s => s.id === 'student-attendance-days')).toMatchObject({ value: '174 days', basis: 'official' })
    expect(calendar.statistics.find(s => s.id === 'early-release-days')?.value).toBe('2 dates')
  })

  it('keeps Biology on December 2, as shown in both the official image and PDF', () => {
    const december = events.filter(e => e.eventType === 'STATE_TEST' && e.dateStart.startsWith('2026-12'))
    expect(december.map(e => [e.dateStart, e.name])).toEqual([
      ['2026-12-02', 'STAAR/EOC U.S. History and Biology'],
      ['2026-12-03', 'STAAR/EOC Algebra I'],
      ['2026-12-08', 'STAAR/EOC English I and English II'],
    ])
    expect(december[0]?.gradeScope).toContain('Biology EOC')
    expect(december[1]?.gradeScope).not.toContain('Biology')
    expect(calendar.faqs.find(f => f.question.includes('December 2026'))?.answer).toBe('U.S. History and Biology are scheduled for Dec. 2. Algebra I is scheduled for Dec. 3, and English I and English II are scheduled for Dec. 8.')
    expect(calendar.sources.some(s => s.url === 'https://files.smartsites.parentsquare.com/7653/gcj1mh14herq0bakiac.jpg')).toBe(true)
    expect(calendar.about.processing).toContain('U.S. History and Biology are December 2')
    const table = mount(CalendarEventsTable, { props: { events: december, districtName: 'United ISD', schoolYear: '2026-2027' } })
    expect(table.findAll('tbody tr')).toHaveLength(3)
    expect(table.findAll('tbody tr')[0]?.text()).toContain('U.S. History and Biology')
    table.unmount()
  })

  it('models the two conditional dates without an unconditional attendance boolean', () => {
    const conditional = events.filter(e => e.schoolStatus === 'conditional-attendance')
    expect(conditional.map(e => e.dateStart)).toEqual(['2026-10-09', '2027-03-29'])
    for (const e of conditional) {
      expect(e).not.toHaveProperty('countsAsStudentAttendanceDay')
      expect(e).toMatchObject({ countsAsStudentAttendanceDayUnderPublishedSchedule: false, scheduledAsNoSchool: true, mayBecomeAttendanceDay: true, schoolStatusBasis: 'derived', mayBecomeAttendanceDayBasis: 'derived', noteBasis: 'derived' })
      expect(calendar.noSchoolDayEventIds).not.toContain(e.id)
    }
    expect(calendar.faqs.find(f => f.question.includes('April 30'))?.answer).toMatch(/^No\. April 30/)
    expect(calendar.faqs.find(f => f.question.includes('Election Day'))?.answer).toMatch(/^Yes\./)
  })

  it('keeps high-school-only early release and removes tautological testing notes', () => {
    const early = events.filter(e => e.eventType === 'EARLY_RELEASE')
    expect(early.map(e => e.dateStart)).toEqual(['2026-12-16', '2027-05-26'])
    for (const e of early) {
      expect(e).toMatchObject({ gradeScope: 'High school students', scheduleScope: 'United ISD high schools', scheduleType: 'MODIFIED_DAY', countsAsStudentAttendanceDay: true })
      expect(e.note).toContain('does not publish a dismissal time')
    }
    const testing = events.filter(e => e.eventType === 'STATE_TEST')
    expect(testing).toHaveLength(12)
    for (const e of testing) {
      expect(e.note).toBeNull()
      expect(e).not.toHaveProperty('noteBasis')
      expect(e.gradeScope).toBeTruthy()
    }
  })

  it('uses district-specific SEO and independent FAQ questions without future-year filler', () => {
    expect(calendar.seo.title).toBe('UISD Calendar 2026-2027: Holidays, Breaks & Key Dates')
    expect(calendar.seo.description).toBe('United ISD’s 2026-2027 school year runs Aug. 12–May 26. See holidays, breaks, WBCA Friday, weather make-up days, STAAR/EOC, early release and graduations.')
    expect(calendar.seo.description).toContain('WBCA Friday')
    expect(calendar.seo.description).not.toContain('PDF')
    expect(calendar.faqs).toHaveLength(34)
    expect(calendar.faqs.every(f => f.question.includes('UISD'))).toBe(true)
    expect(JSON.stringify(calendar.faqs)).not.toMatch(/source was supplied|reviewed calendar page|2027-2028/)
    expect(calendar.editorialSummary.paragraphs).toHaveLength(3)
    expect(calendar.editorialSummary.paragraphs[2]).toContain('Those four high school ceremonies are at SAMES Arena')
    expect(calendar.hero.desktopDescription).not.toContain('four graduation ceremonies')
  })

  it('answers four high-school graduation searches and only the published Cherish venue', () => {
    const graduations = events.filter(e => e.id.endsWith('-graduation'))
    expect(graduations).toHaveLength(4)
    expect(graduations.map(e => [e.dateStart, e.name])).toEqual([
      ['2027-05-26', 'L. B. Johnson High Graduation - 9:00 a.m.'],
      ['2027-05-26', 'John B. Alexander High Graduation - 2:00 p.m.'],
      ['2027-05-27', 'United South High Graduation - 9:00 a.m.'],
      ['2027-05-27', 'United High Graduation - 2:00 p.m.'],
    ])
    for (const e of graduations) {
      expect(e.sourceId).toBe('uisd-2026-2027-calendar-page')
      expect(e.note).toContain('SAMES Arena')
    }
    const gradFaqs = calendar.faqs.filter(f => f.question.includes('High School graduation'))
    expect(gradFaqs).toHaveLength(4)
    expect(gradFaqs.every(f => f.answer.includes('SAMES Arena'))).toBe(true)
    expect(calendar.faqs.find(f => f.question.includes('Cherish Center'))?.answer).toContain('SAC Auditorium. The page does not list a date or time.')
    expect(events.some(e => /Cherish/i.test(e.name))).toBe(false)
  })

  it('keeps the final polish limited to clearer prose and standalone answers', () => {
    expect(calendar.hero.desktopDescription).toMatch(/^UISD’s 2026-2027 calendar has 174 instructional days\. Classes begin/)
    expect(calendar.hero.mobileDescription).toBe('UISD students start Aug. 12, 2026. Winter Break runs Dec. 17–Jan. 5, Spring Break is Mar. 8–12, and the last day is May 26, 2027.')
    expect(calendar.editorialSummary.paragraphs[1]).toContain('The Feb. 19 WBCA Friday student holiday and Feb. 22 Presidents’ Day create a four-day weekend.')
    expect(calendar.editorialSummary.paragraphs[2]).toMatch(/^UISD lists EOC testing on Dec\. 2, 3 and 8,/)
    expect(calendar.editorialSummary.paragraphs[2]).toContain('the Cherish Center ceremony will be held at SAC Auditorium')
    expect(calendar.faqs.find(f => f.question.includes('Memorial Day'))?.answer).toBe('No. UISD’s 2026-2027 school year ends May 26, five days before Memorial Day on May 31.')
    expect(calendar.faqs.find(f => f.question.includes('find the official UISD'))?.answer).toBe('United ISD publishes its current 2026-2027 calendar on the district’s Academic Calendar page, with both English and Spanish versions available.')
    expect(JSON.stringify(calendar.editorialSummary.paragraphs)).not.toMatch(/gives students a four-day weekend|larger STAAR schedule/)
  })

  it('identifies April EOC subjects separately from grade-level STAAR without changing dates', () => {
    expect(events.find(e => e.id === 'uisd-2027-april-13-staar')).toMatchObject({ dateStart: '2027-04-13', name: 'STAAR/EOC English I & II and STAAR Grades 6-8 ELAR', eventType: 'STATE_TEST', sourceId: 'uisd-2026-2027-calendar-pdf' })
    expect(events.find(e => e.id === 'uisd-2027-april-21-staar')).toMatchObject({ dateStart: '2027-04-21', name: 'STAAR/EOC Biology and U.S. History; STAAR Grade 5 Math and Grade 8 Social Studies', eventType: 'STATE_TEST' })
    expect(events.find(e => e.id === 'uisd-2027-april-28-staar')).toMatchObject({ dateStart: '2027-04-28', name: 'STAAR Grade 8 Math and STAAR/EOC Algebra I', eventType: 'STATE_TEST' })
    expect(calendar.editorialSummary.paragraphs[2]).toContain('with additional STAAR and EOC testing dates in April')
    expect(calendar.faqs.find(f => f.question === 'Do UISD students have school on Labor Day 2026?')?.answer).toBe('No. UISD students are off Monday, September 7, 2026, for Labor Day.')
    expect(calendar.faqs.find(f => f.question === 'Do UISD students have school on Presidents’ Day 2027?')?.answer).toBe('No. UISD students are off Monday, February 22, 2027, for Presidents’ Day.')
    expect(calendar.faqs.find(f => f.question === 'Which dates are UISD bad-weather make-up days in 2026-2027?')?.answer).toBe('Oct. 9, 2026, and Mar. 29, 2027, are reserved as bad-weather make-up days. Both are scheduled as student days off unless UISD activates them to replace lost instructional time.')
    expect(calendar.faqs.some(f => f.question === 'What happens if UISD uses a bad-weather make-up day?')).toBe(false)
  })

  it('keeps official February holidays atomic and the four-day family view derived', () => {
    const holidays = events.filter(e => ['uisd-2027-wbca-friday', 'uisd-2027-presidents-day'].includes(e.id))
    expect(holidays.map(e => [e.dateStart, e.dateEnd, e.name])).toEqual([
      ['2027-02-19', null, 'WBCA Friday Student Holiday'], ['2027-02-22', null, "Presidents' Day"],
    ])
    for (const e of holidays) {
      expect(e).toMatchObject({ eventType: 'HOLIDAY', schoolStatus: 'no-classes', basis: 'official', sourceId: 'uisd-2026-2027-calendar-page', note: null })
      expect(calendar.noSchoolDayEventIds).toContain(e.id)
    }
    expect(JSON.stringify(calendar)).not.toContain('uisd-2027-february-break')
    expect(calendar.breaks.find(b => b.dateStart === '2027-02-19')).toMatchObject({ dateEnd: '2027-02-22', basis: 'derived', schoolWeekdaysOff: 2, componentEventIds: ['uisd-2027-wbca-friday', 'uisd-2027-presidents-day'] })
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
    expect(calendar.statistics.find(s => s.id === 'total-no-school-weekdays')?.value).toBe('30 weekdays')
    expect(calendar.statistics.find(s => s.id === 'long-weekends')?.value).toBe('5')
    const table = mount(CalendarEventsTable, { props: { events: holidays, districtName: 'United ISD', schoolYear: '2026-2027' } })
    expect(table.findAll('tbody tr')).toHaveLength(2)
    expect(table.text()).toContain('WBCA Friday Student Holiday')
    expect(table.text()).toContain("Presidents' Day")
    table.unmount()
  })

  it('references Spanish availability in English while retaining the actual official PDF download', () => {
    const languageFaqs = calendar.faqs.filter(f => /Spanish|bilingual/i.test(JSON.stringify(f)))
    expect(languageFaqs).toEqual([{
      question: 'Where can I find the official UISD 2026-2027 calendar?',
      answer: 'United ISD publishes its current 2026-2027 calendar on the district’s Academic Calendar page, with both English and Spanish versions available.',
    }, {
      question: 'Is the UISD 2026-2027 calendar available in Spanish?',
      answer: 'Yes. United ISD’s Academic Calendar page links English and Spanish versions of the 2026-2027 calendar.',
    }])
    expect(calendar.actions.officialPdfUrl).toBe('https://files.smartsites.parentsquare.com/7653/2026-2027_united_isd_calendar_v2.pdf')
  })

  it('exports unchanged official EOC dates, both early releases and all four high-school ceremonies', () => {
    execFileSync(process.execPath, ['scripts/generate-ics.mjs'], { cwd: process.cwd() })
    const ics = readFileSync(`test/fixtures${calendar.actions.staticIcsUrl}`, 'utf8').replace(/\r\n /g, '')
    expect((ics.match(/BEGIN:VEVENT/g) || []).length).toBe(40)
    expect((ics.match(/CATEGORIES:STATE_TEST/g) || []).length).toBe(12)
    expect((ics.match(/CATEGORIES:EARLY_RELEASE/g) || []).length).toBe(2)
    const december2 = ics.split('BEGIN:VEVENT').find(e => e.includes('UID:uisd-2026-december-2-staar@'))!
    expect(december2).toContain('DTSTART;VALUE=DATE:20261202')
    expect(december2).toContain('SUMMARY:STAAR/EOC U.S. History and Biology')
    const december3 = ics.split('BEGIN:VEVENT').find(e => e.includes('UID:uisd-2026-december-3-staar@'))!
    expect(december3).toContain('SUMMARY:STAAR/EOC Algebra I')
    expect(december3).not.toContain('Biology')
    expect(ics).not.toContain('UID:uisd-2027-february-break@')
    const wbca = ics.split('BEGIN:VEVENT').find(e => e.includes('UID:uisd-2027-wbca-friday@'))!
    expect(wbca).toContain('DTSTART;VALUE=DATE:20270219')
    expect(wbca).toContain('DTEND;VALUE=DATE:20270220')
    expect(wbca).toContain('SUMMARY:WBCA Friday Student Holiday')
    const presidents = ics.split('BEGIN:VEVENT').find(e => e.includes('UID:uisd-2027-presidents-day@'))!
    expect(presidents).toContain('DTSTART;VALUE=DATE:20270222')
    expect(presidents).toContain('DTEND;VALUE=DATE:20270223')
    expect(presidents).toContain("SUMMARY:Presidents' Day")
    const april21 = ics.split('BEGIN:VEVENT').find(e => e.includes('UID:uisd-2027-april-21-staar@'))!
    expect(april21).toContain('STAAR/EOC Biology and U.S. History\\; STAAR Grade 5 Math')
    const lbj = ics.split('BEGIN:VEVENT').find(e => e.includes('UID:uisd-2027-lbj-graduation@'))!
    expect(lbj).toContain('SAMES Arena')
    expect(lbj).toContain('Source: https://www.uisd.net/157684_2')
  })
})
