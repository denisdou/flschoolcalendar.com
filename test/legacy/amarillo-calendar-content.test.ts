import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import CalendarEventsTable from '../../app/components/calendar/CalendarEventsTable.vue'
import CalendarYearStatistics from '../../app/components/calendar/CalendarYearStatistics.vue'
import type { CalendarEvent, DistrictRecord } from '../../shared/types/content'
import { buildDistrictCatalog } from '../../shared/utils/districts'
import record from '../fixtures/districts/amarillo-isd.json'
// @ts-ignore Shared offline content gate.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Shared offline statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'
// @ts-ignore Shared event taxonomy helper.
import { hasEventType } from '../../shared/utils/eventTypes.mjs'

const calendar = record.schoolYears['2026-2027']
const events = calendar.events as CalendarEvent[]
const range = (start: string, end = start) => {
  const dates: string[] = []
  const cursor = new Date(`${start}T00:00:00Z`)
  const finish = new Date(`${end}T00:00:00Z`)
  while (cursor <= finish) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}
const isWeekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() % 6 !== 0

describe('Amarillo ISD version 2 source interpretation', () => {
  it('publishes only the sourced year and passes the content gate', () => {
    expect(auditRecords([{ filename: 'amarillo-isd.json', record }])).toEqual([])
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027'])
    expect(calendar.firstDay).toBe('2026-08-18')
    expect(calendar.lastDay).toBe('2027-05-28')
    expect(calendar.approvedAt).toBe('2025-12-15')
    expect(calendar.lastOfficialRevisionAt).toBe('2026-08-13')
    expect(calendar.publishedAt).toBeNull()
    const catalog = buildDistrictCatalog([record as DistrictRecord])
    expect(catalog.districts[0]?.calendarPages[0]?.href).toBe('/amarillo-isd/2026-2027/')
    expect(catalog.districts[0]?.regionSlug).toBe('region-16')
  })

  it('keeps all meanings of the two early releases without duplicate occurrences', () => {
    expect(events.filter(e => hasEventType(e, 'EARLY_RELEASE')).map(e => e.dateStart)).toEqual(['2026-12-18', '2027-05-28'])
    expect(events.filter(e => hasEventType(e, 'GRADING_PERIOD_START'))).toHaveLength(6)
    expect(events.filter(e => hasEventType(e, 'GRADING_PERIOD_END'))).toHaveLength(6)
    for (const date of ['2026-12-18', '2027-05-28']) {
      const sameDay = events.filter(e => e.dateStart === date)
      expect(sameDay).toHaveLength(1)
      expect(hasEventType(sameDay[0], 'SEMESTER_END')).toBe(true)
      const table = mount(CalendarEventsTable, { props: { events: sameDay, districtName: 'Amarillo ISD', schoolYear: '2026-2027' } })
      expect(table.findAll('tbody tr')).toHaveLength(1)
      expect(table.text()).toContain('Early Release')
      table.unmount()
    }
  })

  it('preserves official winter segments and proves every derived break weekday is off', () => {
    expect(events.filter(e => e.schoolStatus === 'no-classes' && e.dateStart! >= '2026-12-01' && e.dateStart! <= '2027-01-04').map(e => [e.dateStart, e.dateEnd])).toEqual([
      ['2026-12-21', '2026-12-25'], ['2026-12-28', '2026-12-31'], ['2027-01-01', null], ['2027-01-04', null],
    ])
    const closedDates = new Set(events.filter(e => calendar.confirmedNoSchoolDayEventIds.includes(e.id)).flatMap(e => range(e.dateStart!, e.dateEnd || e.dateStart!)))
    for (const br of calendar.breaks) {
      const weekdays = range(br.dateStart, br.dateEnd).filter(isWeekday)
      expect(weekdays.every(date => closedDates.has(date))).toBe(true)
      expect(weekdays).toHaveLength(br.schoolWeekdaysOff)
      expect(closedDates.has(br.lastStudentAttendanceDate)).toBe(false)
      expect(closedDates.has(br.nextStudentAttendanceDate)).toBe(false)
      expect(br.componentEventIds.every(id => calendar.confirmedNoSchoolDayEventIds.includes(id))).toBe(true)
    }
    expect(calendar.breaks.find(b => b.name === 'Winter student break')).toMatchObject({ dateStart: '2026-12-19', dateEnd: '2027-01-04', nextStudentAttendanceDate: '2027-01-05', schoolWeekdaysOff: 11 })
    expect(closedDates.has('2026-12-18')).toBe(false)
    expect(closedDates.has('2027-01-05')).toBe(false)
  })

  it('splits Summer Learning at weekends and does not turn staff snow days into student events', () => {
    const summer = events.filter(e => e.eventType === 'SUMMER_PROGRAM')
    expect(summer.map(e => [e.dateStart, e.dateEnd])).toEqual([
      ['2027-06-03', '2027-06-04'], ['2027-06-07', '2027-06-11'], ['2027-06-14', '2027-06-18'], ['2027-06-21', '2027-06-25'], ['2027-06-28', '2027-06-30'],
    ])
    expect(summer.every(e => range(e.dateStart!, e.dateEnd!).every(isWeekday))).toBe(true)
    expect(summer.flatMap(e => range(e.dateStart!, e.dateEnd!))).toHaveLength(20)
    expect(summer.every(e => e.schoolStatus === 'program-specific')).toBe(true)
    expect(events.some(e => /Staff Make Up|New Teacher Orientation|Staff Holiday/.test(e.name) && !/Student/.test(e.name))).toBe(false)
    expect(events.some(e => ['2027-06-01', '2027-06-02', '2027-05-31'].includes(e.dateStart!))).toBe(false)
    expect(calendar.conditionalNoSchoolDayEventIds).toEqual([])
  })

  it('keeps coincident Summer Learning and Testing as independent occurrences', () => {
    const june = events.filter(e => e.dateStart === '2027-06-14')
    expect(june).toHaveLength(2)
    expect(june.map(e => [e.id, e.eventType, e.name, e.dateEnd])).toEqual([
      ['amarillo-2027-06-14-summer-learning', 'SUMMER_PROGRAM', 'Summer Learning', '2027-06-18'],
      ['amarillo-2027-06-14-testing', 'EXAM', 'Testing', '2027-06-18'],
    ])
    expect(june[0]?.eventTypes).toBeUndefined()
    expect(june[0]?.isWindow).toBeUndefined()
    expect(june[1]?.isWindow).toBe(true)
    expect(june.every(e => e.name === e.officialLabel && e.nameBasis === 'official')).toBe(true)
    expect(events.filter(e => e.eventType === 'EXAM')).toHaveLength(7)
  })

  it('marks ordinal grading names and composite display names as derived', () => {
    const ordinalNames = events.filter(e => /^(?:End of (?:First|Second|Fourth|Fifth) Six Weeks|Beginning of (?:Second|Third|Fourth|Fifth|Sixth) Grading Period)$/.test(e.name))
    expect(ordinalNames).toHaveLength(9)
    expect(ordinalNames.every(e => e.nameBasis === 'derived' && e.officialLabel && e.basis === 'official' && e.dateBasis === 'official')).toBe(true)
    for (const id of ['amarillo-2026-december-early-release', 'amarillo-2027-last-day']) {
      expect(events.find(e => e.id === id)).toMatchObject({ nameBasis: 'derived', basis: 'official' })
      expect(events.find(e => e.id === id)?.officialLabels?.length).toBeGreaterThan(1)
    }
  })

  it('leads with official instructional and Summer Learning totals and keeps FAQ intents distinct', () => {
    expect(calendar.sources.find(s => s.id === 'amarillo-board-briefs')).toMatchObject({ url: 'https://amaisd.org/board-briefs', type: 'official-webpage', publishedAt: null })
    const days = calendar.faqs.find(f => f.question.startsWith('How many instructional'))!
    expect(days.answer).toMatch(/^Amarillo ISD says the 2026-2027 calendar provides 175 instructional days\./)
    expect(days.answer).toContain('176 student attendance dates')
    expect(calendar.faqs.find(f => f.question.startsWith('When is Amarillo ISD Summer'))?.answer).toContain('Board approved adding 20 Summer Learning days')
    expect(calendar.faqs.find(f => f.question.includes('Columbus Day'))?.answer).toContain('October 12, 2026')
    expect(calendar.faqs.find(f => f.question.includes('testing dates no-school'))?.answer).toContain('does not mark its testing windows as no-school days')
    expect(calendar.faqs.find(f => f.question.includes('part of the regular school year'))?.answer).toContain('after the regular student year')
    expect(calendar.faqs).toHaveLength(29)
    expect(new Set(calendar.faqs.map(f => f.question)).size).toBe(calendar.faqs.length)
    expect(calendar.seo.title).toBe('Amarillo ISD Calendar 2026-2027: Holidays & Breaks')
    expect(calendar.seo.description).toContain('Summer Learning')
  })

  it('does not imply that the 2027 graduation schedule has already been published', () => {
    const graduation = calendar.faqs.find(f => f.question.includes('graduation dates'))!
    expect(graduation.answer).toContain('does not list 2027 graduation ceremonies')
    expect(graduation.answer).toContain('when the 2027 schedule is posted')
    expect(calendar.editorialSummary.highlights).toContain('Summer Learning: 20 weekdays in June')
    expect(calendar.editorialSummary.highlights).not.toContain('20 Summer Learning days: June 3–30')
  })

  it('keeps final metadata specific and explains January 4 from the student perspective', () => {
    expect(calendar.seo.description).toContain('Amarillo ISD 2026-2027 calendar')
    expect(calendar.seo.description).toContain('Thanksgiving week')
    expect(calendar.seo.description).toContain('two early-release days')
    expect(calendar.seo.description).toContain('Summer Learning')
    expect(calendar.seo.description).toContain('official PDF')
    expect(calendar.seo.description.length).toBeLessThanOrEqual(160)
    expect(calendar.hero.mobileDescription).toContain('January 4 student holiday for teacher preparation')
    expect(calendar.hero.mobileDescription).toContain('classes resume January 5')
    expect(calendar.faqs.find(f => f.question.includes('Columbus Day'))?.answer).toContain('AISD’s Board Brief lists October 12 as Columbus Day.')
  })

  it('labels the three staff learning/preparation holidays without implying a yearwide total', () => {
    const label = 'Student holidays for staff learning/preparation'
    expect(calendar.standaloneNoSchoolStatisticLabel).toBe(label)
    expect(calendar.statistics.find(s => s.id === 'student-no-school-days')).toMatchObject({ label, value: '3 days', basis: 'derived' })
    expect(calculateCalendarStatistics(calendar)).toEqual(calendar.statistics)
    const table = mount(CalendarYearStatistics, { props: { calendar: calendar as DistrictRecord['schoolYears'][string] } })
    expect(table.findAll('dt').map(node => node.text())).toContain(label)
    expect(table.findAll('dt').map(node => node.text())).not.toContain('Student no-school days')
    expect(table.text()).toContain('28 weekdays')
    table.unmount()
    for (const invalid of ['', '   ', 3]) {
      const copy = structuredClone(record)
      Object.assign(copy.schoolYears['2026-2027'], { standaloneNoSchoolStatisticLabel: invalid })
      expect(auditRecords([{ filename: 'amarillo-isd.json', record: copy }]).some(issue => issue.code === 'INVALID_STANDALONE_NO_SCHOOL_STATISTIC_LABEL')).toBe(true)
    }
  })

  it('does not invent exam assignments, campus hours or mandatory summer attendance', () => {
    const tests = events.filter(e => hasEventType(e, 'EXAM'))
    expect(tests.map(e => [e.dateStart, e.dateEnd])).toEqual([
      ['2026-12-07', '2026-12-11'], ['2027-04-06', '2027-04-08'], ['2027-04-13', '2027-04-15'], ['2027-04-20', '2027-04-22'], ['2027-05-03', '2027-05-07'], ['2027-05-10', '2027-05-14'], ['2027-06-14', '2027-06-18'],
    ])
    expect(tests.every(e => e.isWindow && !e.gradeScope && (e.officialLabel === 'Testing' || e.officialLabels?.includes('Testing')))).toBe(true)
    expect(tests.slice(0, 6).every(e => e.schoolStatus === 'schools-open')).toBe(true)
    expect(tests[6]?.schoolStatus).toBe('program-specific')
    expect(calendar.schoolHours).toEqual([])
    expect(events.filter(e => !e.note).every(e => e.noteBasis === undefined)).toBe(true)
    expect(JSON.stringify(calendar)).not.toMatch(/STAAR|TELPAS|mandatory-attendance|exam-day/)
  })

  it('distinguishes official instructional days from the number of attendance dates', () => {
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
    expect(calendar.statistics.find(s => s.id === 'student-attendance-days')).toMatchObject({ value: '176 days', basis: 'derived' })
    expect(calendar.statistics.find(s => s.id === 'total-no-school-weekdays')?.value).toBe('28 weekdays')
    expect(calendar.statistics.find(s => s.id === 'early-release-days')?.value).toBe('2 dates')
    expect(calendar.statistics.find(s => s.id === 'longest-no-school-stretch')?.value).toBe('17 consecutive days')
    expect(calendar.highlights[0]).toMatchObject({ label: 'Official instructional days', value: '175 days', basis: 'official' })
    expect(calendar.highlights.find(h => h.label === 'Summer Learning days')).toMatchObject({ value: '20 days', basis: 'official' })
    const closed = new Set(events.filter(e => calendar.confirmedNoSchoolDayEventIds.includes(e.id)).flatMap(e => range(e.dateStart!, e.dateEnd || e.dateStart!)))
    const semesterDates = (start: string, end: string) => range(start, end).filter(d => isWeekday(d) && !closed.has(d)).length
    expect(semesterDates('2026-08-18', '2026-12-18') - 0.5).toBe(80.5)
    expect(semesterDates('2027-01-05', '2027-05-28') - 0.5).toBe(94.5)
  })

  it('exports all canonical occurrences and uses exclusive ICS range endpoints', () => {
    execFileSync(process.execPath, ['scripts/generate-ics.mjs'])
    const ics = readFileSync(`test/fixtures${calendar.actions.staticIcsUrl}`, 'utf8').replace(/\r\n /g, '')
    expect((ics.match(/BEGIN:VEVENT/g) || []).length).toBe(37)
    const final = ics.split('BEGIN:VEVENT').find(e => e.includes('UID:amarillo-2027-last-day@'))!
    expect(final).toContain('CATEGORIES:LAST_DAY,EARLY_RELEASE,GRADING_PERIOD_END,SEMESTER_END')
    expect(final).toContain('DTSTART;VALUE=DATE:20270528')
    expect(final).toContain('DTEND;VALUE=DATE:20270529')
    const june = ics.split('BEGIN:VEVENT').find(e => e.includes('UID:amarillo-2027-06-03-summer-learning@'))!
    expect(june).toContain('DTSTART;VALUE=DATE:20270603')
    expect(june).toContain('DTEND;VALUE=DATE:20270605')
    const summerOverlap = ics.split('BEGIN:VEVENT').find(e => e.includes('UID:amarillo-2027-06-14-summer-learning@'))!
    const testingOverlap = ics.split('BEGIN:VEVENT').find(e => e.includes('UID:amarillo-2027-06-14-testing@'))!
    expect(summerOverlap).toContain('CATEGORIES:SUMMER_PROGRAM')
    expect(summerOverlap).not.toContain('CATEGORIES:SUMMER_PROGRAM,EXAM')
    expect(testingOverlap).toContain('CATEGORIES:EXAM')
    expect(testingOverlap).toContain('DTSTART;VALUE=DATE:20270614')
    expect(testingOverlap).toContain('DTEND;VALUE=DATE:20270619')
    expect(ics).not.toContain('Staff Make Up')
  })
})
