import { readFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import record from '../fixtures/districts/arlington-isd.json'
import type { CalendarEvent } from '../../shared/types/content'
import CalendarEventsTable from '../../app/components/calendar/CalendarEventsTable.vue'
// @ts-ignore Build-time dependency-free calculator, not part of the application bundle.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const elementary = record.schoolYears['2026-2027']
const secondary = record.schoolYears['2026-2027-secondary']
const echs = record.schoolYears['2026-2027-echs']
const ab = record.schoolYears['2026-2027-ab']
const calendars = [elementary, secondary, echs, ab]

describe('Arlington ISD calendar-specific content', () => {
  it('leads with each calendar’s own purpose and evidence-backed school hours', () => {
    expect(elementary.hero.mobileDescription).toContain('12:10 p.m.')
    expect(elementary.editorialSummary.paragraphs[0]).toContain('Half-day Pre-K 3')
    expect(elementary.faqs.find(item => item.question.includes('Pre-K 3 students attend'))?.answer).toContain("Kooken's afternoon session is 11:55 a.m.-3:05 p.m.")
    expect(elementary.sources.some(source => source.id === 'aisd-pre-k-3-faq')).toBe(true)
    expect(secondary.hero.desktopDescription).toContain('12:45 p.m.')
    expect(secondary.hero.desktopDescription).toContain('11:35 a.m.')
    expect(secondary.faqs.some(item => item.question.includes('December 17, 2026, a full school day'))).toBe(true)
    expect(secondary.faqs.some(item => item.question.includes('May 25, 2027, a full school day'))).toBe(true)
    expect(echs.seo.title).toContain('Early College High School')
    expect(echs.hero.mobileDescription).toContain('January 13')
    expect(echs.hero.mobileDescription).toContain('January 19')
    expect(ab.seo.title).toContain('High School A/B')
    expect(ab.editorialSummary.paragraphs[0]).toContain('dual-credit')
    expect(ab.sources.some(source => source.id === 'aisd-may-2026-family-newsletter')).toBe(true)
  })

  it('does not import regular Secondary holidays or its April 23 make-up date into ECHS', () => {
    const dates = echs.events.map(event => event.dateStart)
    for (const date of ['2026-09-08', '2026-10-12', '2026-11-02', '2026-11-03', '2027-02-12', '2027-02-15', '2027-02-16', '2027-04-23']) {
      expect(dates).not.toContain(date)
    }
    expect(dates).toContain('2027-04-30')
    expect(echs.faqs.find(item => item.question.startsWith('Is April 23'))?.answer).toContain('April 30')
  })

  it('retains conditional make-up semantics without asserting an absolute attendance exclusion', () => {
    for (const calendar of calendars) {
      const conditional = calendar.events.filter(event => event.schoolStatus === 'conditional-attendance')
      expect(conditional).toHaveLength(2)
      for (const event of conditional) {
        expect(event).not.toHaveProperty('countsAsStudentAttendanceDay')
        expect(event).toHaveProperty('countsAsStudentAttendanceDayUnderPublishedSchedule', false)
        expect(calendar.noSchoolDayEventIds).not.toContain(event.id)
        expect(event.note).toContain('unless needed')
      }
    }
  })

  it('scopes attendance FAQs to the calendar variant instead of the entire district', () => {
    const november = elementary.faqs.find(item => item.question === 'Are Arlington ISD elementary students off November 2 and 3, 2026?')
    expect(november?.answer).toMatch(/^Yes\./)
    expect(elementary.faqs.some(item => item.question === 'Are Arlington ISD elementary students off February 12-16, 2027?')).toBe(true)
    expect(elementary.faqs.some(item => item.question === 'Will Arlington ISD elementary students have school on March 26 or April 23, 2027?')).toBe(true)
    expect(secondary.faqs.some(item => item.question === 'Could Arlington ISD secondary students attend school on March 26 or April 23, 2027?')).toBe(true)
    const echsScope = echs.faqs.find(item => item.question === 'Do the regular Arlington ISD Secondary student holidays also apply to Early College students?')
    expect(echsScope?.answer).toMatch(/^Not always\./)
    for (const date of ['September 8', 'October 12', 'November 2-3', 'February 12-16']) {
      expect(echsScope?.answer).toContain(date)
    }
    expect(echs.seo.description).toContain('Jan. 19 TCC spring class start')
  })

  it('uses natural calendar-specific wording and separates dismissal dates from times', () => {
    const dates = elementary.faqs.find(item => item.question === 'Which dates have early dismissal for Arlington ISD elementary students?')
    expect(dates?.answer).toContain('December 18')
    expect(dates?.answer).toContain('May 26')
    expect(elementary.faqs.some(item => item.question === 'What time is Arlington ISD elementary early dismissal?')).toBe(true)
    expect(echs.hero.desktopDescription).toContain('TCC classes resume January 19')
    expect(echs.hero.desktopDescription).not.toContain('TCC classes start January 19')
    expect(ab.hero.desktopDescription).toContain('High school early dismissal is scheduled for December 17-18 and May 25-26.')
    expect(ab.hero.desktopDescription).not.toContain('secondary early dismissal')
    expect(secondary.editorialSummary.paragraphs[2]).toContain('The December 21-January 1 holiday')
    expect(secondary.editorialSummary.paragraphs[2]).not.toContain('The December holiday')
  })

  it('does not apply the regular elementary dismissal time to every half-day Pre-K 3 session', () => {
    for (const description of [elementary.hero.mobileDescription, elementary.hero.desktopDescription]) {
      expect(description).toContain('regular elementary day')
      expect(description).toContain('Half-day Pre-K 3 follows separate')
    }
    const early = elementary.events.filter(event => event.schoolStatus === 'early-dismissal')
    expect(early).toHaveLength(2)
    for (const event of early) {
      expect(event.note).toContain('Regular elementary early dismissal is at 12:10 p.m.')
      expect(event.note).toContain('morning sessions end at 10:10 a.m.')
      expect(event.note).toContain('afternoon sessions end at 12:10 p.m.')
      expect(event).toHaveProperty('timeSourceId', 'aisd-school-hours')
      expect(event.gradeScope).toBe('Pre-K-6')
    }
    expect(elementary.highlights.find(item => item.label === 'Regular elementary early dismissal')?.note).toContain('Half-day Pre-K 3')
    expect(elementary.faqs.find(item => item.question === 'What time is Arlington ISD elementary early dismissal?')?.answer).toContain('10:10 a.m.')
  })

  it('preserves the full student and staff make-up label without changing ECHS scope', () => {
    for (const calendar of [elementary, secondary, ab]) {
      for (const event of calendar.events.filter(item => item.schoolStatus === 'conditional-attendance')) {
        expect(event.name).toBe('Student & Staff Holiday / Bad Weather Make-Up Day')
      }
    }
    expect(echs.events.find(item => item.dateStart === '2027-03-26')?.name).toBe('Student Holiday / Bad Weather Make-Up Day')
    expect(echs.events.find(item => item.dateStart === '2027-04-30')?.name).toBe('Student and Staff Holiday / Bad Weather Make-Up Day')
  })

  it('attributes the A/B rationale without adding a comparative claim or repeating Friday advice', () => {
    expect(ab.editorialSummary.paragraphs[0]).not.toContain('more closely')
    expect(ab.editorialSummary.paragraphs[0]).toContain("aligns with Tarrant County College's schedule")
    expect(ab.editorialSummary.paragraphs[0]).toContain('is intended to help')
    expect(ab.editorialSummary.paragraphs[1]).not.toContain('a holiday is still')
    expect(ab.editorialSummary.paragraphs[2]).not.toContain('Friday assignments')
    expect(ab.faqs.find(item => item.question.startsWith('Why did Arlington ISD change'))?.answer).toContain('is intended to help')
  })

  it('shows a reproducible sum of printed A/B subtotals with derived provenance', () => {
    expect(ab.highlights.find(item => item.label === 'Published instructional-day total')).toMatchObject({ value: '171 days', basis: 'derived' })
    expect(ab.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value: '171 days', basis: 'derived' })
    expect(ab.statistics[0].explanation).toContain('82 days in semester one plus 89')
    expect(ab.about.processing).toContain('90 in semester two (172 overall)')
    expect(ab.about.processing).toContain('unresolved one-day difference')
    const publicCopy = JSON.stringify([ab.seo, ab.hero, ab.editorialSummary, ab.highlights, ab.statistics, ab.faqs, ab.comparativeInsights])
    expect(publicCopy).not.toMatch(/172|date-by-date calculation|published 171|official printed total/)
    for (const calendar of calendars) expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
  })

  it('keeps meaningful times and conditions but removes filler event notes', () => {
    for (const calendar of calendars) {
      const notes = calendar.events.map(event => event.note).filter(Boolean).join(' ')
      expect(notes).not.toMatch(/The date falls on|full Monday-through-Friday|full school week|First student day|First AISD student day/)
      const early = calendar.events.filter(event => event.schoolStatus === 'early-dismissal')
      expect(early.every(event => event.note && /a\.m\.|p\.m\./.test(event.note))).toBe(true)
      for (const event of calendar.events) {
        if (event.note === null) expect(event).not.toHaveProperty('noteBasis')
        if (event.dateEnd) expect(event.dateEnd >= event.dateStart).toBe(true)
      }
      expect(new Set(calendar.faqs.map(item => item.question.toLowerCase())).size).toBe(calendar.faqs.length)
      expect(calendar.faqs.some(item => /spanish/i.test(item.question))).toBe(false)
    }
  })

  it('keeps comparison and calculation explanations out of editorial copy', () => {
    expect(elementary.editorialSummary.paragraphs[2]).not.toContain('junior high')
    expect(echs.seo.description).not.toContain('January returns')
    expect(echs.seo.description).toContain('Jan. 13 AISD return')
    expect(echs.editorialSummary.highlights[2]).toBe('Conditional make-up dates: March 26 and April 30')
    expect(echs.editorialSummary.paragraphs[2]).not.toContain('April 23')
    expect(echs.faqs.some(item => item.question.startsWith('Is April 23'))).toBe(true)
    expect(ab.editorialSummary.paragraphs[2]).not.toMatch(/171|instructional days|Adding/)
    expect(ab.editorialSummary.paragraphs[2]).toContain('41 A days and 41 B days')
    for (const calendar of [elementary, secondary, echs]) {
      expect(calendar.faqs.some(item => /report-card dates/i.test(item.question))).toBe(false)
    }
    for (const calendar of calendars) expect(calendar.seo.description.length).toBeLessThanOrEqual(160)
  })

  it('shows TCC milestones without asserting AISD campus operating status', () => {
    const milestones = echs.events.filter(event => event.name.includes('TCC'))
    expect(milestones).toHaveLength(4)
    expect(milestones.map(event => event.dateStart)).toEqual(['2026-08-17', '2026-12-09', '2027-01-19', '2027-05-12'])
    for (const event of milestones) {
      expect(event.schoolStatus).toBe('not-applicable')
      expect(event).toHaveProperty('schoolStatusLabel', 'TCC milestone')
      expect(event.note).toBeNull()
      expect(event).not.toHaveProperty('noteBasis')
      expect(event).not.toHaveProperty('countsAsStudentAttendanceDay')
      expect(echs.noSchoolDayEventIds).not.toContain(event.id)
    }
    const wrapper = mount(CalendarEventsTable, {
      props: { events: milestones as CalendarEvent[], districtName: 'Arlington ISD', schoolYear: '2026-2027' },
    })
    expect(wrapper.findAll('.badge').map(badge => badge.text())).toEqual(Array(4).fill('TCC milestone'))
    expect(wrapper.text()).not.toContain('Schools open')
    wrapper.unmount()
  })

  it('exports the revised descriptions and useful notes to all four subscriptions', () => {
    for (const calendar of calendars) {
      const unfolded = readFileSync(`test/fixtures${calendar.actions.staticIcsUrl}`, 'utf8').replace(/\r?\n[ \t]/g, '')
      expect(unfolded).not.toMatch(/The date falls on|full Monday-through-Friday|full school week/)
      expect(unfolded).toContain('School status: If needed\\; attendance may change')
      expect(unfolded).toContain('unless needed to make up bad-weather instructional time')
      expect(unfolded).toContain('DTSTAMP:20261003T000000Z')
    }
    const echsIcs = readFileSync(`test/fixtures${echs.actions.staticIcsUrl}`, 'utf8').replace(/\r?\n[ \t]/g, '')
    const tccEvents = echsIcs.split('BEGIN:VEVENT').slice(1).filter(event => /SUMMARY:.*TCC/.test(event))
    expect(tccEvents).toHaveLength(4)
    for (const event of tccEvents) {
      expect(event).toContain('School status: TCC milestone')
      expect(event).not.toMatch(/School status: schools open|TCC (?:classes begin|semester ends) on this date/)
    }
    const elementaryIcs = readFileSync(`test/fixtures${elementary.actions.staticIcsUrl}`, 'utf8').replace(/\r?\n[ \t]/g, '')
    expect(elementaryIcs).toContain('morning sessions end at 10:10 a.m.')
    expect(elementaryIcs).toContain('Time source: https://www.aisd.net/district/about/school-hours/')
    expect(elementaryIcs).toContain('SUMMARY:Student & Staff Holiday / Bad Weather Make-Up Day')
  })
})
