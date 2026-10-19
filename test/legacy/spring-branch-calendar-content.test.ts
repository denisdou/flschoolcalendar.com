import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import CalendarEventsTable from '../../app/components/calendar/CalendarEventsTable.vue'
import MonthlyCalendar from '../../app/components/calendar/MonthlyCalendar.vue'
import record from '../fixtures/districts/spring-branch-isd.json'
import type { CalendarEvent, DistrictRecord } from '../../shared/types/content'
import { buildDistrictCalendarSchema } from '../../shared/utils/calendarSchema'
// @ts-ignore Dependency-free content validator.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const calendar = record.schoolYears['2026-2027']
const events = calendar.events as CalendarEvent[]
const event = (id: string) => events.find(item => item.id === id)!
const sourceId = 'spring-branch-2026-2027-academic-pdf'

function weekdays(start: string, end: string) {
  const dates: string[] = []
  for (const date = new Date(start + 'T00:00:00Z'); date.toISOString().slice(0, 10) <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) dates.push(date.toISOString().slice(0, 10))
  }
  return dates
}

const previousClosureRanges = [
  ['2026-09-07', '2026-09-07'], ['2026-10-09', '2026-10-09'],
  ['2026-10-12', '2026-10-12'], ['2026-11-03', '2026-11-03'],
  ['2026-11-23', '2026-11-27'], ['2026-12-21', '2027-01-01'],
  ['2027-01-04', '2027-01-04'], ['2027-01-18', '2027-01-18'],
  ['2027-02-15', '2027-02-15'], ['2027-03-08', '2027-03-12'],
  ['2027-03-26', '2027-03-26'],
]
const expectedClosures = [...new Set(previousClosureRanges.flatMap(([start, end]) => weekdays(start!, end!)))].toSorted()

describe('Spring Branch ISD official events and grade-specific pickup dates', () => {
  it('passes the publish gate and records the actual source review date', () => {
    expect(auditRecords([{ filename: 'spring-branch-isd.json', record }])).toEqual([])
    expect(calendar.verifiedAt).toBe('2026-10-06')
    expect(calendar.sources.every(item => item.retrievedAt === '2026-10-06')).toBe(true)
    expect(calendar.lastOfficialRevisionAt).toBeNull()
  })

  it('updates the school-year snippet without changing first or last instruction dates', () => {
    expect(calendar.seo).toEqual({
      title: 'Spring Branch ISD Calendar 2026-27: Breaks & Early Dismissal',
      description: 'Spring Branch ISD runs Aug. 13, 2026-May 26, 2027. See school breaks, early dismissal by school level, parent conferences and weather make-up days.',
    })
    expect(calendar.firstDay).toBe('2026-08-13')
    expect(calendar.lastDay).toBe('2027-05-26')
    expect(calendar.hero.mobileDescription).toBe('Classes run Aug. 13 through May 26. The calendar includes early-dismissal dates by school level, parent conferences and two possible weather make-up days.')
    expect(calendar.editorialSummary.paragraphs).toHaveLength(3)
    expect(calendar.hero.desktopDescription).toContain('Winter holidays run December 21–January 1, followed by a January 4 student holiday; classes resume January 5.')
    expect(calendar.editorialSummary.paragraphs[1]).toContain('Pre-K, elementary and middle school students dismiss early September 23 for staff development.')
    expect(calendar.editorialSummary.paragraphs[1]).toContain("At each semester's end, middle and high school students have three consecutive shortened days, while Pre-K and elementary students have one.")
  })

  it('splits the separately printed winter holidays while retaining the old subscription UID', () => {
    expect(events).toHaveLength(32)
    expect(new Set(events.map(item => item.id)).size).toBe(events.length)
    expect(events.map(item => item.dateStart)).toEqual(events.map(item => item.dateStart).toSorted())
    expect(event('spring-branch-2026-winter-break')).toMatchObject({
      dateStart: '2026-12-21', dateEnd: '2026-12-31', eventType: 'HOLIDAY', name: 'Winter Holidays',
      officialLabel: 'Holiday – Staff / Students', dateBasis: 'official', nameBasis: 'derived', schoolStatus: 'no-classes',
    })
    expect(event('spring-branch-2027-january-1-holiday')).toMatchObject({
      dateStart: '2027-01-01', dateEnd: null, eventType: 'HOLIDAY', officialLabel: 'Holiday – Staff / Students',
      dateBasis: 'official', schoolStatus: 'no-classes',
    })
    expect(event('spring-branch-2027-january-student-holiday')).toMatchObject({
      dateStart: '2027-01-04', dateEnd: null, schoolStatus: 'no-students',
      officialLabel: 'Staff Development – Student Holiday',
    })
    expect(events.some(item => item.eventType === 'WINTER_BREAK')).toBe(false)
    expect(calendar.keyDates.find(item => item.eventType === 'WINTER_BREAK')).toMatchObject({
      dateStart: '2026-12-21', dateEnd: '2027-01-01', dateBasis: 'derived', labelBasis: 'derived', eventTypeBasis: 'derived',
    })
    expect(calendar.breaks.find(item => item.dateStart === '2026-12-21')).toMatchObject({
      dateEnd: '2027-01-04', nextStudentAttendanceDate: '2027-01-05', schoolWeekdaysOff: 11, basis: 'derived',
      componentEventIds: ['spring-branch-2026-winter-break', 'spring-branch-2027-january-1-holiday', 'spring-branch-2027-january-student-holiday'],
    })
  })

  it('preserves all 28 closed weekdays, 176 published student days and the existing statistic values', () => {
    const closures = [...new Set(events.filter(item => calendar.noSchoolDayEventIds.includes(item.id))
      .flatMap(item => weekdays(item.dateStart!, item.dateEnd || item.dateStart!)))].toSorted()
    expect(closures).toEqual(expectedClosures)
    expect(closures).toHaveLength(28)
    expect(calendar.noSchoolDayEventIds.every(id => events.some(item => item.id === id))).toBe(true)
    expect(calendar.noSchoolDayEventIds).toContain('spring-branch-2027-january-1-holiday')
    expect(calculateCalendarStatistics(calendar).map((item: { value: string }) => item.value)).toEqual(calendar.statistics.map(item => item.value))
    expect(calendar.statistics.map(item => item.value)).toEqual(['176 days', '28 weekdays', '3 days', '13 dates', '17 consecutive days', '5', '3 breaks'])
  })

  it('keeps official holiday labels separate from Thanksgiving and Spring Break classifications', () => {
    for (const id of ['spring-branch-2026-thanksgiving-break', 'spring-branch-2027-spring-break']) {
      expect(event(id)).toMatchObject({ officialLabel: 'Holiday – Staff / Students', dateBasis: 'official', nameBasis: 'derived', eventTypeBasis: 'derived' })
    }
    expect(event('spring-branch-2026-thanksgiving-break').name).toBe('Thanksgiving Break')
    expect(event('spring-branch-2027-spring-break').name).toBe('Spring Break')
    for (const item of calendar.keyDates) {
      expect(item).not.toHaveProperty('basis')
      expect(item.labelBasis).toBe('derived')
      expect(item.eventTypeBasis).toBe('derived')
    }
    for (const item of calendar.breaks) {
      expect(item.basis).toBe('derived')
      expect(item.componentEventIds.every(id => events.some(event => event.id === id))).toBe(true)
    }
  })

  it('uses field-level provenance for normalized values and editorial notes without inventing milestone labels', () => {
    for (const item of events) {
      expect(item).not.toHaveProperty('basis')
      expect(item).toMatchObject({ dateBasis: 'official', nameBasis: 'derived', eventTypeBasis: 'derived', schoolStatusBasis: 'derived', sourceId })
      if (item.note) {
        expect(item.noteBasis).toBe('derived')
        expect(item.noteSourceIds).toEqual([sourceId])
      }
      else {
        expect(item).not.toHaveProperty('noteBasis')
        expect(item).not.toHaveProperty('noteSourceIds')
      }
      if (item.gradeScope) {
        expect(item.gradeScopeBasis).toBe('derived')
        expect(item.gradeScopeSourceId).toBe(sourceId)
      }
    }
    for (const id of ['spring-branch-2026-q1-end', 'spring-branch-2026-q2-start', 'spring-branch-2027-q3-end', 'spring-branch-2027-q4-start']) {
      expect(event(id)).not.toHaveProperty('officialLabel')
    }
    expect(calendar.about.processing).toContain('not official source labels')
  })

  it('preserves 7 Pre-K/elementary, 8 middle and 8 high-school shortened attendance dates', () => {
    const datesFor = (scope: string) => [...new Set(events.filter(item => new RegExp(scope, 'i').test(item.gradeScope || ''))
      .flatMap(item => weekdays(item.dateStart!, item.dateEnd || item.dateStart!)))].toSorted()
    expect(datesFor('Pre-K')).toEqual(['2026-09-23', '2026-10-22', '2026-10-23', '2026-12-18', '2027-02-04', '2027-02-05', '2027-05-26'])
    expect(datesFor('Middle')).toEqual(['2026-09-23', '2026-12-16', '2026-12-17', '2026-12-18', '2027-02-04', '2027-05-24', '2027-05-25', '2027-05-26'])
    expect(datesFor('High')).toEqual(['2026-10-07', '2026-12-16', '2026-12-17', '2026-12-18', '2027-03-03', '2027-05-24', '2027-05-25', '2027-05-26'])
    for (const item of events.filter(item => item.gradeScope)) {
      expect(item.schoolStatus).toBe('early-dismissal')
      expect(item.countsAsStudentAttendanceDay).toBe(true)
    }
    expect(event('spring-branch-2026-fall-conferences')).toMatchObject({ dateStart: '2026-10-22', dateEnd: '2026-10-23', eventType: 'TEACHER_CONFERENCE' })
    expect(event('spring-branch-2027-spring-conferences')).toMatchObject({ dateStart: '2027-02-04', dateEnd: '2027-02-05', eventType: 'TEACHER_CONFERENCE' })
  })

  it('does not turn either conditional weather date into a confirmed closure', () => {
    for (const id of ['spring-branch-2027-april-weather-day', 'spring-branch-2027-may-weather-day']) {
      expect(event(id)).toMatchObject({
        eventType: 'RESERVED_ATTENDANCE_DAY', schoolStatus: 'conditional-attendance', dateBasis: 'official',
        countsAsStudentAttendanceDayUnderPublishedSchedule: false,
        countsAsStudentAttendanceDayUnderPublishedScheduleBasis: 'derived',
        mayBecomeAttendanceDay: true, mayBecomeAttendanceDayBasis: 'derived',
        attendanceStatusBasisSourceId: sourceId,
      })
      expect(event(id)).not.toHaveProperty('countsAsStudentAttendanceDay')
      expect(calendar.noSchoolDayEventIds).not.toContain(id)
      expect(event(id).officialLabel).toContain('if needed')
    }
    expect(calendar.breaks.every(item => !item.componentEventIds.some(id => id.includes('weather-day')))).toBe(true)
  })

  it('answers conference dates and dismissal times as separate parent tasks without guessed clock times', () => {
    expect(calendar.faqs).toHaveLength(22)
    const conferences = calendar.faqs.filter(item => item.question === 'When are Spring Branch ISD parent-teacher conferences in 2026-27?')
    expect(conferences).toHaveLength(1)
    expect(conferences[0]!.answer).toContain('October 22–23, 2026, and February 4–5, 2027')
    expect(conferences[0]!.answer).toContain('Pre-K and elementary')
    const times = calendar.faqs.filter(item => item.question === 'What time is early dismissal in Spring Branch ISD?')
    expect(times).toHaveLength(1)
    expect(times[0]!.answer).toContain('does not publish dismissal times')
    expect(times[0]!.answer).not.toMatch(/\d{1,2}:\d{2}/)
    expect(calendar.faqs.find(item => /fall break/.test(item.question))?.answer).toContain('does not list a separate full-week Fall Break')
    expect(calendar.faqs.some(item => /Memorial Day|2027-2028 and later|available here/.test(item.question))).toBe(false)
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027'])
  })

  it('answers the Presidents’ Day query without inventing an official holiday label', () => {
    const matches = calendar.faqs.filter(item => item.question === 'Does Spring Branch ISD have school on Presidents’ Day in 2027?')
    expect(matches).toHaveLength(1)
    expect(matches[0]!.answer).toBe('No. Monday, February 15, 2027, is a student holiday while staff have professional development. The academic calendar labels the date “Staff Development – Student Holiday” rather than naming Presidents’ Day.')
    expect(calendar.faqs.some(item => item.question === 'Do students attend school on February 15, 2027?')).toBe(false)
    expect(event('spring-branch-2027-february-student-holiday')).toMatchObject({
      dateStart: '2027-02-15', schoolStatus: 'no-students', name: 'Student Holiday / Staff Development',
      officialLabel: 'Staff Development – Student Holiday',
    })
  })

  it('keeps the download answer focused while retaining approval metadata in sources', () => {
    const matches = calendar.faqs.filter(item => item.answer.startsWith('The official English PDF is linked'))
    expect(matches).toHaveLength(1)
    expect(matches[0]!.answer).toBe('The official English PDF is linked on this page and under Academic Calendar 2026-27 on the district Events page.')
    expect(calendar.sources.find(item => item.id === sourceId)?.publishedAt).toBe('2024-11-18')
    expect(calendar.about.updates).toContain('board approval on November 18, 2024')
  })

  it('uses the last-day search phrase while retaining the possible May 27 extension', () => {
    const matches = calendar.faqs.filter(item => item.question === 'When is the last day of school for Spring Branch ISD in 2026-27?')
    expect(matches).toHaveLength(1)
    expect(matches[0]!.answer).toBe('The scheduled last day of instruction is Wednesday, May 26, 2027, with early dismissal for all school levels. May 27 is reserved for possible weather make-up classes, so follow district announcements before making end-of-year plans.')
    expect(calendar.faqs.some(item => item.question === 'When does the 2026-2027 school year end in SBISD?')).toBe(false)
  })

  it('renders the split January holiday as no school while keeping January 5 as a school day', () => {
    const wrapper = mount(MonthlyCalendar, { props: { districtName: 'Spring Branch ISD', events, firstDay: calendar.firstDay, lastDay: calendar.lastDay } })
    try {
      for (const date of expectedClosures) {
        const cell = wrapper.find(`time[datetime="${date}"]`).element.closest('td')!
        expect(cell.classList.contains('month-day--school-day')).toBe(false)
      }
      expect(wrapper.find('time[datetime="2027-01-05"]').element.closest('td')!.classList.contains('month-day--school-day')).toBe(true)
    }
    finally { wrapper.unmount() }
    const table = mount(CalendarEventsTable, { props: { events: events.filter(item => item.id.includes('conferences')), districtName: 'Spring Branch ISD', schoolYear: '2026-2027' } })
    try {
      expect(table.text()).toContain('Pre-K and Elementary Parent Conferences / Early Dismissal')
    }
    finally { table.unmount() }
  })

  it('publishes the exact revised FAQ answers in the FAQ JSON-LD', () => {
    const graph = buildDistrictCalendarSchema({
      siteUrl: 'https://flschoolcalendar.com', path: '/spring-branch-isd/2026-2027/',
      district: record.district, calendar: calendar as DistrictRecord['schoolYears'][string], discovery: record.calendarDiscovery,
    })['@graph']
    const faq = graph.find(item => item['@type'] === 'FAQPage')!
    expect(faq.mainEntity).toEqual(calendar.faqs.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })))
  })

  it('exports the retained December UID and new January UID as separate all-day ICS occurrences', () => {
    const ics = readFileSync('test/fixtures' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r\n /g, '')
    const entries = ics.split('BEGIN:VEVENT').slice(1)
    expect(entries).toHaveLength(events.length)
    const december = entries.find(item => item.includes('UID:spring-branch-2026-winter-break@'))!
    const january = entries.find(item => item.includes('UID:spring-branch-2027-january-1-holiday@'))!
    expect(december).toContain('DTSTART;VALUE=DATE:20261221')
    expect(december).toContain('DTEND;VALUE=DATE:20270101')
    expect(december).toContain('CATEGORIES:HOLIDAY')
    expect(january).toContain('DTSTART;VALUE=DATE:20270101')
    expect(january).toContain('DTEND;VALUE=DATE:20270102')
    expect(january).toContain('CATEGORIES:HOLIDAY')
    for (const item of events) expect(ics).toContain('UID:' + item.id + '@')
  })
})
