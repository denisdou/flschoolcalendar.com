import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import record from '../fixtures/districts/corpus-christi-isd.json'
// @ts-ignore The offline checker is intentionally dependency-free JavaScript.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore The stored-statistics generator is intentionally dependency-free JavaScript.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const calendar = record.schoolYears['2026-2027']
const pdfId = 'corpus-christi-2026-2027-calendar-pdf'
const bellId = 'corpus-christi-2026-2027-bell-schedule'
const bellUpdateId = 'corpus-christi-2026-2027-middle-school-bell-update'
const revisionId = 'corpus-christi-2026-2027-february-12-update'

function weekdays(start: string, end: string) {
  const dates: string[] = []
  for (let day = new Date(`${start}T00:00:00Z`); day <= new Date(`${end}T00:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) {
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) dates.push(day.toISOString().slice(0, 10))
  }
  return dates
}

const holidays = new Set(calendar.events
  .filter(event => calendar.noSchoolDayEventIds.includes(event.id))
  .flatMap(event => weekdays(event.dateStart, event.dateEnd || event.dateStart)))
const intersession = weekdays('2026-10-12', '2026-10-16')
const regularOff = new Set([...holidays, ...intersession])
const regularDays = (start: string, end: string) => weekdays(start, end).filter(date => !regularOff.has(date)).length

describe('Corpus Christi ISD official-event and source boundaries', () => {
  it('passes the scoped content gate and keeps complete official source references', () => {
    expect(auditRecords([{ filename: 'corpus-christi-isd.json', record }])).toEqual([])
    expect(calendar.sources.find(source => source.id === pdfId)).toMatchObject({
      url: 'https://aptg.co/S80JZX',
      contentHash: 'fd4fb23d189570746380572ee7853aa667171483e068a71f8c873d6e80f1f2df',
    })
    expect(calendar.sources.every(source => source.retrievedAt === '2026-10-04')).toBe(true)
  })

  it('uses the September update for current middle-school hours without displaying the expired hours', () => {
    expect(calendar.schoolHours.find(item => item.scope.startsWith('Middle schools'))).toMatchObject({
      scope: 'Middle schools except Metro Prep', regularHours: '8:50 a.m.-4:10 p.m.', sourceId: bellUpdateId, basis: 'official',
      effectiveFrom: '2026-09-21', effectiveThrough: null,
    })
    expect(calendar.schoolHours).toHaveLength(4)
    const visible = JSON.stringify([calendar.hero, calendar.editorialSummary, calendar.highlights, calendar.schoolHours, calendar.faqs, calendar.about, calendar.events, calendar.statistics])
    expect(visible).not.toMatch(/8:30|3:50|Opening schedule only/)
    expect(calendar.schoolHours.find(item => item.scope.startsWith('High schools'))).toMatchObject({
      scope: 'High schools and Metro Prep', regularHours: '8:50 a.m.-4:10 p.m.', sourceId: bellId,
    })
    const middle = calendar.faqs.find(item => item.question.includes('middle school hours'))!
    expect(middle.answer).toContain('Beginning September 21, 2026, CCISD middle schools run 8:50 a.m.-4:10 p.m.')
    expect(calendar.faqs.find(item => item.question.includes('Metro Prep'))!.answer).toContain('from the start')
    expect(calendar.faqs.find(item => item.question.startsWith('Did Corpus Christi'))!.answer).toContain('September 3')
    expect(calendar.about.processing).toContain('Both pages of the current PDF print middle-school hours of 8:50')
    expect(calendar.about.processing).toContain('the PDF now matches the restored schedule')
    expect(calendar.about.updates).not.toContain('middle-school hours remain inconsistent')
    expect(calendar.sources.find(source => source.id === bellUpdateId)).toMatchObject({
      url: 'https://www.ccisd.us/article/3112104', publishedAt: '2026-09-03', retrievedAt: '2026-10-04',
    })
    expect(calendar.events.find(event => event.id === 'corpus-christi-2026-middle-school-bell-schedule-change')).toMatchObject({
      dateStart: '2026-09-21', dateEnd: null, eventType: 'SCHOOL_MILESTONE', schoolStatus: 'schools-open',
      scheduleScope: 'Middle schools except Metro Prep', sourceId: bellUpdateId, basis: 'official', noteBasis: 'official',
    })
    expect(calendar.hero.desktopDescription).toContain('Most middle schools now run 8:50 a.m.-4:10 p.m. after a September 21 schedule change')
    expect(calendar.about.processing).toContain('specifies a start date but no expiration')
    expect(record.calendarDiscovery.crawlerNotes).toContain('https://www.ccisd.us/News')
    expect(record.calendarDiscovery.crawlerNotes).toContain('not an implemented or scheduled monitoring job')
  })

  it('labels the annual sum as derived while preserving directly printed semester subtotals', () => {
    expect(calendar.statistics.find(item => item.id === 'instructional-days')).toMatchObject({ value: '175 days', basis: 'derived' })
    expect(calendar.statistics.find(item => item.id === 'semester-days')).toMatchObject({ value: '82 / 93 days', basis: 'official' })
    expect(regularDays(calendar.firstDay, calendar.lastDay)).toBe(175)
    expect(regularDays('2026-08-11', '2026-12-18')).toBe(82)
    expect(regularDays('2027-01-06', '2027-05-28')).toBe(93)
    const fourth = calendar.events.find(event => event.id === 'corpus-christi-2027-fourth-grading-period-end')!
    expect(regularDays('2027-01-06', '2027-02-19')).toBe(31)
    expect(fourth).toMatchObject({ basis: 'official', note: null })
    expect(fourth).not.toHaveProperty('noteBasis')
    expect(calendar.about.processing).toContain('first page prints 31 while page two prints 30')
    expect(calendar.seo.description).toContain('175 instructional days')
    expect(calendar.seo.title).toBe('Corpus Christi ISD Calendar 2026-27 | Holidays & Breaks')
    expect(calendar.seo.description).toContain('holidays')
    expect(calendar.seo.description).toContain('current bell times')
    expect(calendar.hero.mobileDescription).toContain('175 instructional days')
    const totalAnswer = calendar.faqs.find(item => item.question.startsWith('How many instructional days'))!.answer
    expect(totalAnswer).toContain('lists 82 days in the first semester and 93 in the second, which total 175')
    expect(totalAnswer).not.toContain('as listed')
    expect(calendar.seo.title.length).toBeLessThanOrEqual(60)
    expect(calendar.seo.description.length).toBeLessThanOrEqual(160)
  })

  it('preserves official event ranges instead of turning combined windows into events', () => {
    const expected = [
      ['Student Holiday', '2026-10-09', null], ['Intersession', '2026-10-12', '2026-10-16'],
      ['Winter Break', '2026-12-21', '2027-01-01'], ['Student Holidays', '2027-01-04', '2027-01-05'],
      ['Student Holiday', '2027-03-05', null], ['Spring Break', '2027-03-08', '2027-03-12'],
      ['Good Friday', '2027-03-26', null], ['Easter Monday', '2027-03-29', null],
    ]
    for (const [name, start, end] of expected) {
      expect(calendar.events.some(event => event.name === name && event.dateStart === start && event.dateEnd === end && event.basis === 'official')).toBe(true)
    }
    expect(calendar.events.some(event => /and Intersession|and January Student Holidays|and Spring Break|and Easter Monday Break/.test(event.name))).toBe(false)
    expect(calendar.events.some(event => event.eventType === ('FALL_BREAK' as string))).toBe(false)
    expect(calendar.events).toHaveLength(27)
    expect(calendar.events.some(event => event.dateStart > calendar.lastDay)).toBe(false)
    expect(calendar.breaks.map(item => [item.dateStart, item.dateEnd])).toContainEqual(['2026-12-21', '2027-01-05'])
    expect(calendar.breaks.map(item => [item.dateStart, item.dateEnd])).toContainEqual(['2027-03-05', '2027-03-12'])
  })

  it('keeps intersession separate from confirmed closures and answers the February revision', () => {
    expect(holidays.size).toBe(29)
    expect(regularOff.size).toBe(34)
    const noRegularClasses = calendar.statistics.find(item => item.id === 'confirmed-no-regular-class-weekdays')!
    expect(noRegularClasses.value).toBe('34 weekdays')
    expect(noRegularClasses.explanation).toContain('29 confirmed districtwide weekdays without regular classes')
    expect(calendar.about.processing).toContain('29 confirmed districtwide weekdays without regular classes')
    expect(JSON.stringify([calendar.about, calendar.statistics])).not.toMatch(/29 (confirmed|fixed) student-holiday weekdays/)
    expect(calendar.noSchoolDayEventIds).not.toContain('corpus-christi-2026-intersession')
    expect(calendar.breaks[0]).toMatchObject({
      dateStart: '2026-10-09', dateEnd: '2026-10-16', schoolWeekdaysOff: null,
    })
    expect(calendar.breaks[0].note).toContain('not a confirmed no-attendance break for every student')
    expect(calendar.breaks[0]).not.toHaveProperty('schoolWeekdaysOffBasis')
    expect(calendar.breaks[0]).not.toHaveProperty('schoolWeekdaysOffNote')
    expect(calendar.events.find(event => event.id === 'corpus-christi-2026-intersession')).toMatchObject({
      schoolStatus: 'special-schedule', schoolStatusLabel: 'Intersession', schoolStatusBasis: 'derived', basis: 'official', occursOnRegularInstructionalDay: false, occursOnRegularInstructionalDayBasis: 'derived',
    })
    expect(calculateCalendarStatistics(calendar).some((item: { id: string }) => item.id === 'student-attendance-days')).toBe(false)
    expect(calendar.events.find(event => event.dateStart === '2027-02-12')).toMatchObject({
      schoolStatus: 'schools-open', countsAsStudentAttendanceDay: true, sourceId: revisionId,
    })
    expect(regularOff.has('2027-02-12')).toBe(false)
    expect(calendar.faqs.find(item => item.question.startsWith('Is February 12'))?.answer).toContain('Yes.')
  })

  it('keeps distinct parent intents without document-debugging or repeated filler', () => {
    expect(calendar.faqs).toHaveLength(26)
    expect(new Set(calendar.faqs.map(item => item.question.toLowerCase())).size).toBe(26)
    expect(calendar.faqs.find(item => item.question === 'What are the Corpus Christi ISD student holidays in 2026-27?')?.answer).toContain('October 9, January 4-5 and March 5')
    expect(calendar.faqs.find(item => item.question.includes('high school hours'))?.answer).toContain('marked those hours as unchanged')
    expect(calendar.faqs.find(item => item.question.includes('high school hours'))?.answer).not.toContain('unchanged for 2026-2027')
    const visible = JSON.stringify([calendar.editorialSummary, calendar.events, calendar.faqs])
    expect(visible).not.toMatch(/connects across|first-quarter|specialty elementary|Why does the second PDF|Can Corpus Christi ISD revise|Is Memorial Day included|available here|intersession assignment|assigned sessions|report-card distribution|affect the regular class schedule/)
    expect(JSON.stringify([calendar.breaks, calendar.statistics])).not.toMatch(/Assigned intersession|assigned sessions/)
    expect(calendar.faqs.find(item => item.question.includes('Fall Break'))?.answer).toContain('It calls those dates Intersession')
    expect(calendar.faqs.find(item => item.question.includes('regular classes during intersession'))?.answer).toContain('does not provide campus-level participation details')
    expect(calendar.faqs.find(item => item.question.includes('regular classes during intersession'))?.answer).not.toContain('rather than regular classes')
    expect(calendar.editorialSummary.paragraphs[1]).not.toContain('for any intersession programming')
    expect(calendar.events.find(item => item.id === 'corpus-christi-2027-presidents-day')?.name).toBe("Presidents' Day")
    expect(calendar.faqs.some(item => item.question.includes('return after Winter Break'))).toBe(true)
    expect(calendar.faqs.some(item => item.question.includes('Winter Break in'))).toBe(true)
    for (const event of calendar.events) {
      if (event.note === null) expect(event).not.toHaveProperty('noteBasis')
    }
  })

  it('validates school-hour effective dates without requiring dates on legacy rows', () => {
    const copy = JSON.parse(JSON.stringify(record))
    const row = copy.schoolYears['2026-2027'].schoolHours[2]
    row.effectiveThrough = '2026-09-20'
    expect(auditRecords([{ filename: 'corpus-christi-isd.json', record: copy }]).some((issue: { code: string }) => issue.code === 'REVERSED_SCHOOL_HOURS_RANGE')).toBe(true)
    row.effectiveThrough = '2027-02-30'
    expect(auditRecords([{ filename: 'corpus-christi-isd.json', record: copy }]).some((issue: { code: string }) => issue.code === 'INVALID_DATE')).toBe(true)
    delete row.effectiveFrom
    delete row.effectiveThrough
    expect(auditRecords([{ filename: 'corpus-christi-isd.json', record: copy }])).toEqual([])
  })

  it('validates instructional-day overlap provenance without requiring it on legacy events', () => {
    const copy = JSON.parse(JSON.stringify(record))
    const event = copy.schoolYears['2026-2027'].events.find((item: { name: string }) => item.name === 'Intersession')
    event.occursOnRegularInstructionalDayBasis = 'guessed'
    expect(auditRecords([{ filename: 'corpus-christi-isd.json', record: copy }]).some((issue: { code: string }) => issue.code === 'INVALID_REGULAR_INSTRUCTIONAL_DAY_BASIS')).toBe(true)
    event.occursOnRegularInstructionalDayBasis = 'derived'
    delete event.occursOnRegularInstructionalDay
    expect(auditRecords([{ filename: 'corpus-christi-isd.json', record: copy }]).some((issue: { code: string }) => issue.code === 'MISSING_REGULAR_INSTRUCTIONAL_DAY_FLAG')).toBe(true)
    delete event.occursOnRegularInstructionalDayBasis
    expect(auditRecords([{ filename: 'corpus-christi-isd.json', record: copy }])).toEqual([])
  })

  it('exports separate holidays and current descriptions with exclusive end dates', () => {
    const ics = readFileSync(`test/fixtures${calendar.actions.staticIcsUrl}`, 'utf8').replace(/\r?\n[ \t]/g, '')
    const events = ics.split('BEGIN:VEVENT').slice(1)
    expect(events).toHaveLength(27)
    expect(ics).not.toMatch(/October Student Holiday and Intersession|Winter Break and January Student Holidays|March Student Holiday and Spring Break|Good Friday and Easter Monday Break/)
    const winter = events.find(item => item.includes('UID:corpus-christi-2026-winter-break@'))!
    expect(winter).toContain('DTSTART;VALUE=DATE:20261221')
    expect(winter).toContain('DTEND;VALUE=DATE:20270102')
    const january = events.find(item => item.includes('UID:corpus-christi-2027-january-student-holidays@'))!
    expect(january).toContain('DTEND;VALUE=DATE:20270106')
    expect(ics).toContain('Source: https://www.ccisd.us/live_feeds/11992417')
    const schedule = events.find(item => item.includes('UID:corpus-christi-2026-middle-school-bell-schedule-change@'))!
    expect(schedule).toContain('DTSTART;VALUE=DATE:20260921')
    expect(schedule).toContain('DTEND;VALUE=DATE:20260922')
    expect(schedule).toContain('Source: https://www.ccisd.us/article/3112104')
    expect(ics).toContain('DTSTAMP:20261004T000000Z')
  })
})
