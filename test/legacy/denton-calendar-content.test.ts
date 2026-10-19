import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import record from '../fixtures/districts/denton-isd.json'
import type { CalendarEvent } from '../../shared/types/content'
import { getEventTypes, hasEventType } from '../../shared/utils/eventTypes.mjs'
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

describe('Denton ISD official calendar boundaries', () => {
  it('passes the content gate and preserves canonical event dates and source hashes', () => {
    expect(auditRecords([{ filename: 'denton-isd.json', record }])).toEqual([])
    expect(events).toHaveLength(39)
    expect(new Set(events.map(item => item.id)).size).toBe(39)
    expect(calendar.firstDay).toBe('2026-08-13')
    expect(calendar.lastDay).toBe('2027-05-27')
    expect(calendar.sources.find(source => source.id === 'denton-2026-2027-district-calendar')).toMatchObject({
      contentHash: '3404f0dab836482ec00d9ce892756b14bec830d6d12d849f1905730fdec21ea3',
      printedRevisionDate: '2026-04-17', retrievedAt: '2026-10-04',
    })
  })

  it('classifies all four half days without duplicating the last-day event', () => {
    expect(events.filter(item => hasEventType(item, 'EARLY_RELEASE')).map(item => item.dateStart)).toEqual([
      '2026-12-17', '2026-12-18', '2027-05-26', '2027-05-27',
    ])
    expect(getEventTypes(event('denton-2027-last-day'))).toEqual(['LAST_DAY', 'EARLY_RELEASE', 'GRADING_PERIOD_END'])
    expect(getEventTypes(event('denton-2026-december-18-half-day'))).toEqual(['EARLY_RELEASE', 'GRADING_PERIOD_END'])
    expect(getEventTypes(event('denton-2026-first-day'))).toEqual(['FIRST_DAY', 'GRADING_PERIOD_START'])
    expect(events.filter(item => hasEventType(item, 'GRADING_PERIOD_START'))).toHaveLength(4)
    expect(events.filter(item => hasEventType(item, 'GRADING_PERIOD_END'))).toHaveLength(4)
    expect(events.filter(item => item.dateStart === '2027-05-27')).toHaveLength(1)
  })

  it('keeps legacy single-type events compatible and deduplicates classifications', () => {
    expect(getEventTypes({ eventType: 'HOLIDAY' })).toEqual(['HOLIDAY'])
    expect(hasEventType({ eventType: 'HOLIDAY' }, 'EARLY_RELEASE')).toBe(false)
    expect(getEventTypes({ eventType: 'LAST_DAY', eventTypes: ['EARLY_RELEASE', 'LAST_DAY', 'EARLY_RELEASE'] })).toEqual(['LAST_DAY', 'EARLY_RELEASE'])
  })

  it.each([[], ['EARLY_RELEASE'], ['LAST_DAY', 'INVALID'], ['LAST_DAY', 'LAST_DAY'], 'LAST_DAY', null])('rejects malformed classifications without crashing: %j', (types) => {
    const copy = structuredClone(record)
    Object.assign(copy.schoolYears['2026-2027'].events.find(item => item.id === 'denton-2027-last-day')!, { eventTypes: types })
    expect(auditRecords([{ filename: 'denton-isd.json', record: copy }]).some((issue: { code: string }) => issue.code === 'INVALID_EVENT_TYPES')).toBe(true)
  })

  it('keeps weather attendance conditional and excludes only two weekdays under the published schedule', () => {
    const weather = events.filter(item => item.schoolStatus === 'conditional-attendance')
    expect(weather.map(item => item.dateStart)).toEqual(['2027-03-26', '2027-03-29'])
    for (const item of weather) {
      expect(item).not.toHaveProperty('countsAsStudentAttendanceDay')
      expect(item).toMatchObject({
        countsAsStudentAttendanceDayUnderPublishedSchedule: false,
        scheduledAsNoSchool: true, scheduledAsNoSchoolBasis: 'derived',
        mayBecomeAttendanceDay: true, mayBecomeAttendanceDayBasis: 'derived',
        schoolStatus: 'conditional-attendance', schoolStatusBasis: 'derived',
      })
      expect(calendar.noSchoolDayEventIds).not.toContain(item.id)
    }
  })

  it('independently reproduces the 175-day planning count, including half days but not the freshman-only date', () => {
    const closures = new Set(events.filter(item => calendar.noSchoolDayEventIds.includes(item.id))
      .flatMap(item => weekdays(item.dateStart, item.dateEnd || item.dateStart)))
    const weatherDates = events.filter(item => item.schoolStatus === 'conditional-attendance').map(item => item.dateStart)
    const range = weekdays(calendar.firstDay, calendar.lastDay)
    expect(range).toHaveLength(206)
    expect(closures.size).toBe(29)
    expect(range.filter(date => !closures.has(date) && !weatherDates.includes(date))).toHaveLength(175)
    expect(calculateCalendarStatistics(calendar).find((item: { id: string }) => item.id === 'student-attendance-days')).toMatchObject({ value: '175 days', basis: 'derived' })
    expect(calculateCalendarStatistics(calendar).find((item: { id: string }) => item.id === 'early-release-days')).toMatchObject({ value: '4 dates' })
    expect(faq('How many student attendance').answer).toContain('rather than an official district total')
    expect(event('denton-2026-freshman-first-day')).toMatchObject({ dateStart: '2026-08-12', schoolStatus: 'program-specific' })
  })

  it('does not imply a districtwide modified schedule throughout the STAAR window', () => {
    expect(event('denton-2027-staar-window')).toMatchObject({
      eventType: 'STATE_TEST', dateStart: '2027-04-06', dateEnd: '2027-04-30',
      schoolStatus: 'schools-open', schoolStatusBasis: 'derived', gradeScope: 'Students scheduled for STAAR assessments',
      gradeScopeBasis: 'derived', gradeScopeSourceId: 'denton-2026-2027-district-calendar',
    })
    expect(event('denton-2026-psat-tsia2')).toMatchObject({ eventType: 'SCHOOL_MILESTONE', dateStart: '2026-10-20' })
  })

  it('keeps reporting scope while removing redundant notes and preserving the post-year report-card warning', () => {
    const reports = events.filter(item => ['PROGRESS_REPORT', 'REPORT_CARD'].includes(item.eventType))
    expect(reports).toHaveLength(12)
    for (const item of reports.filter(item => item.dateStart !== '2027-06-11')) {
      expect(item.note).toBeNull()
      expect(item).not.toHaveProperty('noteBasis')
      expect(item.gradeScope).toContain('A/B calendar')
    }
    expect(event('denton-2027-q4-report-card').note).toContain('not an additional attendance day')
  })

  it('keeps useful FAQs, adds spring return and uses existing download actions instead of duplicate FAQ', () => {
    expect(calendar.faqs).toHaveLength(29)
    expect(faq('return after spring break').answer).toContain('Tuesday, March 16, 2027')
    expect(faq('return after spring break').answer).toContain('March 15')
    expect(faq('Presidents Day').answer).toContain('February 12')
    expect(faq('Presidents Day').answer).toContain('February 16')
    expect(calendar.faqs.some(item => /Was Denton|Where can I download/.test(item.question))).toBe(false)
    expect(faq('on February 12, 2027').answer).toContain('Staff Exchange Day / Student Holiday')
    expect(faq('on February 12, 2027').answer).toContain('return Tuesday, February 16')
    expect(calendar.actions.officialPdfUrl).toContain('dentonisd-calendar-english')
    expect(calendar.about.updates).toContain('April 17, 2026')
    expect(calendar.relatedResources.some(item => item.href.includes('AB-Calendar'))).toBe(true)
  })

  it('uses concise metadata and highlights the split start and separate A/B calendar', () => {
    expect(calendar.seo.title).toBe('Denton ISD Calendar 2026-2027: First Day, Breaks & Holidays')
    expect(calendar.seo.description).toBe('Denton ISD starts Aug. 13, 2026; freshmen start Aug. 12. The last day is May 27, 2027. See holidays, breaks, early-release dates and the A/B calendar.')
    expect(calendar.seo.title.length).toBeLessThanOrEqual(60)
    expect(calendar.seo.description.length).toBeLessThanOrEqual(160)
    expect(calendar.seo.description).toContain('freshmen start Aug. 12')
    expect(calendar.hero.mobileDescription).toContain('A/B calendar')
    expect(calendar.hero.desktopDescription).toContain('not guaranteed holidays')
    expect(calendar.editorialSummary.paragraphs.join(' ')).not.toMatch(/Both PDFs mark|companion A\/B|there is no second week off/)
  })

  it('describes the A/B rotation rather than classroom coursework and leads with the two start dates', () => {
    const prose = [calendar.hero.mobileDescription, calendar.hero.desktopDescription, ...calendar.editorialSummary.paragraphs].join(' ')
    expect(prose).not.toMatch(/daily class assignments|daily A\/B assignments|main date to watch|split opening/)
    expect(calendar.hero.mobileDescription).toContain('daily A/B rotation and reporting dates')
    expect(calendar.hero.mobileDescription.startsWith('The general first day is August 13; freshmen start August 12, and the last student day is May 27.')).toBe(true)
    expect(calendar.hero.desktopDescription).toContain('lists October 20 as PSAT/TSIA2 Testing Day')
    expect(calendar.editorialSummary.paragraphs[0].startsWith('Freshmen report on Wednesday, August 12, one day before')).toBe(true)
    expect(calendar.editorialSummary.paragraphs[2]).toContain('daily A/B rotation')
  })

  it('keeps the report-card FAQ on dates and does not present printed school hours as half-day dismissal times', () => {
    expect(faq('report cards scheduled').answer).not.toContain('Home Access Center')
    expect(faq('report cards scheduled').answer).toContain('October 27, January 15, March 23 and June 11')
    expect(faq('dismiss students on half days').answer).toContain('does not provide early-release times')
    expect(faq('dismiss students on half days').answer).not.toContain('regular-day hours')
    expect(faq("What are Denton ISD's school hours in 2026-2027?").answer).toContain('It does not provide dismissal times for the four half days')
  })

  it('adds a standalone Labor Day answer while preserving the official generic Holiday label', () => {
    expect(faq('closed for Labor Day').answer).toContain('Monday, September 7, 2026')
    expect(faq('closed for Labor Day').answer).toContain('general label Holiday rather than Labor Day')
    expect(event('denton-2026-september-7-holiday')).toMatchObject({ name: 'Holiday', schoolStatus: 'no-classes' })
  })

  it('identifies the inferred applicability of all A/B reporting and testing events', () => {
    const scoped = events.filter(item => item.sourceId === 'denton-2026-2027-ab-calendar')
    expect(scoped).toHaveLength(13)
    for (const item of scoped) {
      expect(item).toMatchObject({ basis: 'official', gradeScopeBasis: 'derived', gradeScopeSourceId: 'denton-2026-2027-ab-calendar' })
    }
    expect(event('denton-2026-freshman-first-day')).toMatchObject({
      schoolStatus: 'program-specific', schoolStatusBasis: 'derived', gradeScope: 'Grade 9 (freshmen)',
      gradeScopeBasis: 'official', gradeScopeSourceId: 'denton-2026-2027-district-calendar',
    })
    expect(calendar.about.processing).toContain('shared status enum has no grade-specific value')
  })

  it('uses date-specific weather notes without changing conditional attendance or dates', () => {
    expect(event('denton-2027-march-26-weather').note).toBe("March 26 is a possible weather day; attendance depends on the district's decision.")
    expect(event('denton-2027-march-29-weather').note).toBe("March 29 is a possible weather day; attendance depends on the district's decision.")
    const ics = readFileSync('test/fixtures/ics/denton-isd-2026-2027.ics', 'utf8').replace(/\r?\n /g, '')
    expect(ics).toContain("March 26 is a possible weather day\\; attendance depends on the district's decision.")
    expect(ics).toContain("March 29 is a possible weather day\\; attendance depends on the district's decision.")
  })

  it('marks closure-based return notes as derived and keeps parent-facing wording direct', () => {
    expect(event('denton-2027-spring-break')).toMatchObject({
      basis: 'official', noteBasis: 'derived',
      note: 'March 15 is a PLC student holiday; students return Tuesday, March 16.',
    })
    expect(event('denton-2026-winter-break').noteBasis).toBe('derived')
    expect(faq('off on October 12 and 13').answer).toContain('Students return Wednesday, October 14.')
    expect(faq('school on MLK Day').answer).toContain('Students return Tuesday, January 19.')
    expect(faq('progress reports listed').answer).toContain('two progress-report dates for each nine-week period')
    expect(faq('progress reports listed').answer).not.toContain('first two')
    expect(calendar.editorialSummary.paragraphs[0]).toContain('four half days for students')
    expect(calendar.editorialSummary.paragraphs[2]).toContain('daily A/B rotation, plus progress-report and report-card dates')
  })

  it('exports one May 27 event with all three ICS categories', () => {
    const ics = readFileSync('test/fixtures/ics/denton-isd-2026-2027.ics', 'utf8').replace(/\r?\n /g, '')
    const matching = ics.split('BEGIN:VEVENT').filter(part => part.includes('UID:denton-2027-last-day@'))
    expect(matching).toHaveLength(1)
    expect(matching[0]).toContain('CATEGORIES:LAST_DAY,EARLY_RELEASE,GRADING_PERIOD_END')
    expect(matching[0]).toContain('DTSTART;VALUE=DATE:20270527')
  })
})
