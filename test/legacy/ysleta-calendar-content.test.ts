import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import MonthlyCalendar from '../../app/components/calendar/MonthlyCalendar.vue'
import CalendarEventsTable from '../../app/components/calendar/CalendarEventsTable.vue'
import record from '../fixtures/districts/ysleta-isd.json'
import type { CalendarEvent, DistrictCalendar } from '../../shared/types/content'
import { buildDistrictCalendarSchema } from '../../shared/utils/calendarSchema'
// @ts-ignore Dependency-free content gate.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'
// @ts-ignore Compound event classifications.
import { getEventTypes } from '../../shared/utils/eventTypes.mjs'

const calendar = record.schoolYears['2026-2027']
const events = calendar.events as CalendarEvent[]
const sid = 'ysleta-2026-2027-calendar-pdf'
const event = (id: string) => events.find(item => item.id === id)!
const answer = (question: string) => calendar.faqs.find(item => item.question === question)!.answer
const expectedDates = [
  {
    "id": "ysleta-2026-first-day",
    "dateStart": "2026-08-03",
    "dateEnd": null
  },
  {
    "id": "ysleta-2026-hs-conferences",
    "dateStart": "2026-08-24",
    "dateEnd": null
  },
  {
    "id": "ysleta-2026-ms-conferences",
    "dateStart": "2026-08-25",
    "dateEnd": null
  },
  {
    "id": "ysleta-2026-labor-day",
    "dateStart": "2026-09-07",
    "dateEnd": null
  },
  {
    "id": "ysleta-2026-es-conferences",
    "dateStart": "2026-09-15",
    "dateEnd": null
  },
  {
    "id": "ysleta-2026-first-nine-weeks-end",
    "dateStart": "2026-09-25",
    "dateEnd": null
  },
  {
    "id": "ysleta-2026-fall-intersession",
    "dateStart": "2026-09-28",
    "dateEnd": "2026-10-02"
  },
  {
    "id": "ysleta-2026-fall-break",
    "dateStart": "2026-10-05",
    "dateEnd": "2026-10-09"
  },
  {
    "id": "ysleta-2026-october-no-students",
    "dateStart": "2026-10-12",
    "dateEnd": null
  },
  {
    "id": "ysleta-2026-veterans-day",
    "dateStart": "2026-11-11",
    "dateEnd": null
  },
  {
    "id": "ysleta-2026-thanksgiving-break",
    "dateStart": "2026-11-23",
    "dateEnd": "2026-11-27"
  },
  {
    "id": "ysleta-2026-december-testing",
    "dateStart": "2026-12-01",
    "dateEnd": "2026-12-03"
  },
  {
    "id": "ysleta-2026-december-half-day",
    "dateStart": "2026-12-18",
    "dateEnd": null
  },
  {
    "id": "ysleta-2026-winter-break",
    "dateStart": "2026-12-21",
    "dateEnd": "2027-01-01"
  },
  {
    "id": "ysleta-2027-january-no-students",
    "dateStart": "2027-01-04",
    "dateEnd": null
  },
  {
    "id": "ysleta-2027-second-semester-start",
    "dateStart": "2027-01-05",
    "dateEnd": null
  },
  {
    "id": "ysleta-2027-mlk-day",
    "dateStart": "2027-01-18",
    "dateEnd": null
  },
  {
    "id": "ysleta-2027-hs-conferences",
    "dateStart": "2027-02-22",
    "dateEnd": null
  },
  {
    "id": "ysleta-2027-ms-conferences",
    "dateStart": "2027-02-23",
    "dateEnd": null
  },
  {
    "id": "ysleta-2027-es-conferences",
    "dateStart": "2027-02-24",
    "dateEnd": null
  },
  {
    "id": "ysleta-2027-third-nine-weeks-end",
    "dateStart": "2027-03-05",
    "dateEnd": null
  },
  {
    "id": "ysleta-2027-spring-intersession",
    "dateStart": "2027-03-08",
    "dateEnd": "2027-03-12"
  },
  {
    "id": "ysleta-2027-spring-break",
    "dateStart": "2027-03-15",
    "dateEnd": "2027-03-19"
  },
  {
    "id": "ysleta-2027-march-22-makeup",
    "dateStart": "2027-03-22",
    "dateEnd": null
  },
  {
    "id": "ysleta-2027-good-friday",
    "dateStart": "2027-03-26",
    "dateEnd": null
  },
  {
    "id": "ysleta-2027-easter-monday-makeup",
    "dateStart": "2027-03-29",
    "dateEnd": null
  },
  {
    "id": "ysleta-2027-april-testing-1",
    "dateStart": "2027-04-06",
    "dateEnd": "2027-04-09"
  },
  {
    "id": "ysleta-2027-april-testing-2",
    "dateStart": "2027-04-13",
    "dateEnd": "2027-04-16"
  },
  {
    "id": "ysleta-2027-april-testing-3",
    "dateStart": "2027-04-20",
    "dateEnd": "2027-04-23"
  },
  {
    "id": "ysleta-2027-memorial-day",
    "dateStart": "2027-05-31",
    "dateEnd": null
  },
  {
    "id": "ysleta-2027-last-day",
    "dateStart": "2027-06-04",
    "dateEnd": null
  },
  {
    "id": "ysleta-2027-june-retests",
    "dateStart": "2027-06-15",
    "dateEnd": "2027-06-17"
  }
]

function weekdays(start: string, end: string) {
  const result: string[] = []
  for (const date = new Date(start + 'T00:00:00Z'); date.toISOString().slice(0, 10) <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) result.push(date.toISOString().slice(0, 10))
  }
  return result
}

describe('Ysleta ISD attendance semantics and parent search tasks', () => {
  it('passes the scoped content gate and preserves every retained event date and subscription ID', () => {
    expect(auditRecords([{ filename: 'ysleta-isd.json', record }])).toEqual([])
    expect(events.map(({id, dateStart, dateEnd}) => ({id, dateStart, dateEnd}))).toEqual(expectedDates)
    expect(new Set(events.map(item => item.id)).size).toBe(32)
    expect(calendar.firstDay).toBe('2026-08-03')
    expect(calendar.lastDay).toBe('2027-06-04')
    expect(record.district.timeZone).toBe('America/Denver')
    expect(calendar.lastOfficialRevisionAt).toBe('2026-05-20')
    expect(calendar.verifiedAt).toBe('2026-10-07')
    expect(calendar.sources.find(source => source.id === sid)?.retrievedAt).toBe('2026-10-07')
    expect(calendar.sources.find(source => source.id === 'ysleta-2026-2027-parent-calendar-announcement')).toMatchObject({publishedAt: '2026-07-30', retrievedAt: '2026-10-07'})
    expect(calendar.sources.find(source => source.id === 'ysleta-events-page')?.retrievedAt).toBe('2026-10-06')
  })

  it('uses the requested school-calendar title and district-specific overview without invented dismissal times', () => {
    expect(calendar.seo.title).toBe('Ysleta ISD School Calendar 2026-2027: Breaks & Key Dates')
    expect(calendar.seo.description).toBe('Ysleta ISD starts Aug. 3, 2026 and ends June 4, 2027. See holidays, breaks, intersessions, half days, weather make-up dates and the official calendar PDF.')
    expect(calendar.hero.desktopDescription).toContain('Parent conferences are held on full instructional days by school level')
    expect(calendar.hero.mobileDescription).toContain('two possible weather make-up days')
    expect(calendar.editorialSummary.paragraphs[0]).toContain('Students are out from December 21 through January 4')
    expect(calendar.editorialSummary.paragraphs[1]).toContain('does not say which students must attend intersession')
    expect(calendar.editorialSummary.paragraphs[1]).not.toContain('One of the most important planning details')
    expect(calendar.hero.mobileDescription).toContain('two student half days with four hours of instruction')
    expect(calendar.hero.desktopDescription).toContain('are student half days with four hours of instruction')
    expect(calendar.editorialSummary.paragraphs[0]).toContain('for a total of 176 instructional days')
    expect(JSON.stringify([calendar.hero, calendar.editorialSummary, calendar.faqs])).not.toContain('four-hour student half days')
    expect(calendar.editorialSummary.paragraphs[2]).toContain('four hours of instruction on December 18 and June 4 but does not give exact dismissal times')
    expect(calendar.editorialSummary.paragraphs[2]).toContain('watch district announcements for any weather make-up changes')
    expect(calendar.editorialSummary.paragraphs.join(' ')).not.toMatch(/\d{1,2}:\d{2}/)
  })

  it('does not infer campus-based attendance or a holiday during either intersession', () => {
    for (const id of ['ysleta-2026-fall-intersession', 'ysleta-2027-spring-intersession']) {
      expect(event(id)).toMatchObject({
        eventType: 'INTERSESSION', schoolStatus: 'unknown', schoolStatusReason: 'source-does-not-state',
        schoolStatusLabel: 'Participation not specified', schoolStatusBasis: 'derived',
      })
      expect(event(id)).not.toHaveProperty('countsAsStudentAttendanceDay')
      expect(calendar.noSchoolDayEventIds).not.toContain(id)
      expect(calendar.breaks.every(item => !item.componentEventIds.includes(id))).toBe(true)
    }
    expect(event('ysleta-2026-fall-intersession').dateBasis).toBe('derived')
    expect(event('ysleta-2027-spring-intersession').dateBasis).toBe('official')
  })

  it('separates testing assignments from school attendance and post-year retesting', () => {
    const tests = events.filter(item => item.eventType === 'STATE_TEST')
    expect(tests).toHaveLength(5)
    for (const item of tests) {
      expect(item.isWindow).toBe(true)
      expect(calendar.noSchoolDayEventIds).not.toContain(item.id)
      expect(item.schoolStatus).not.toBe('varied-by-school')
      expect(item.schoolStatus).not.toBe('exam-day')
      expect(item.schoolStatus).toBe(item.id === 'ysleta-2027-june-retests' ? 'not-applicable' : 'schools-open')
    }
    expect(event('ysleta-2027-june-retests').note).toContain('does not extend the regular school year')
  })

  it('keeps all six parent conferences as full instructional days with normalized school-level names', () => {
    const conferences = events.filter(item => item.eventType === 'PARENT_CONFERENCE')
    expect(conferences).toHaveLength(6)
    for (const item of conferences) {
      expect(item.schoolStatus).toBe('schools-open')
      expect(item.name).toMatch(/^(High|Middle|Elementary) School Parent Conferences \(Full School Day\)$/)
      expect(item.officialLabel).toMatch(/^Parent Conference\/Full Day Instruction \((HS|MS|ES)\)$/)
      expect(calendar.noSchoolDayEventIds).not.toContain(item.id)
    }
    expect(events.some(item => item.eventType === 'TEACHER_CONFERENCE')).toBe(false)
  })

  it('models both weather dates as conditional activation, not a permanent attendance false', () => {
    for (const id of ['ysleta-2027-march-22-makeup', 'ysleta-2027-easter-monday-makeup']) {
      expect(event(id)).toMatchObject({
        eventType: 'RESERVED_ATTENDANCE_DAY', schoolStatus: 'conditional-attendance',
        countsAsStudentAttendanceDayUnderPublishedSchedule: false,
        countsAsStudentAttendanceDayUnderPublishedScheduleBasis: 'derived',
        mayBecomeAttendanceDay: true, mayBecomeAttendanceDayBasis: 'derived',
        attendanceStatusBasisSourceId: sid,
      })
      expect(event(id)).not.toHaveProperty('countsAsStudentAttendanceDay')
      expect(calendar.noSchoolDayEventIds).not.toContain(id)
      expect(calendar.breaks.every(item => !item.componentEventIds.includes(id))).toBe(true)
    }
  })

  it('retains the half-day and semester/grading facts without dumping every tag into the name', () => {
    const december = event('ysleta-2026-december-half-day')
    const june = event('ysleta-2027-last-day')
    expect(december.name).toBe('Student Half Day — First Semester Ends')
    expect(getEventTypes(december)).toEqual(['EARLY_RELEASE', 'SEMESTER_END', 'GRADING_PERIOD_END'])
    expect(december.note).toContain('second nine weeks')
    expect(june.name).toBe('Last Day of School — Student Half Day')
    expect(getEventTypes(june)).toEqual(['LAST_DAY', 'EARLY_RELEASE', 'SEMESTER_END'])
    expect(getEventTypes(june)).not.toContain('GRADING_PERIOD_END')
    for (const item of [december, june]) {
      expect(item.countsAsStudentAttendanceDay).toBe(true)
      expect(item.schoolStatus).toBe('early-dismissal')
      expect(item.officialLabels).toHaveLength(2)
    }
  })

  it('marks the annual total as a semester-subtotal sum and preserves closure/statistic values', () => {
    const count = calendar.statistics[0]!
    expect(count).toMatchObject({value: '176 days', basis: 'derived'})
    expect(count.explanation).toContain('82 first-semester instructional days + 94 second-semester instructional days = 176')
    expect(calendar.highlights[0]).toMatchObject({label: 'Instructional days', basis: 'derived', calculationMethod: 'sum-published-semester-days'})
    expect(calculateCalendarStatistics(calendar).map((item: {value: string}) => item.value)).toEqual(calendar.statistics.map(item => item.value))
    expect(calendar.statistics.map(item => item.value)).toEqual(['176 days', '32 weekdays', '2 days', '2 dates', '17 consecutive days', '4', '4 breaks'])
    const closures = new Set(events.filter(item => calendar.noSchoolDayEventIds.includes(item.id))
      .flatMap(item => weekdays(item.dateStart!, item.dateEnd || item.dateStart!)))
    expect(closures.size).toBe(32)
    expect(closures.has('2027-03-22')).toBe(false)
    expect(closures.has('2027-03-29')).toBe(false)
  })

  it('records normalized provenance without claiming combined winter dates were printed as one range', () => {
    for (const item of events) {
      expect(item).not.toHaveProperty('basis')
      expect(item).toMatchObject({nameBasis: 'derived', eventTypeBasis: 'derived', schoolStatusBasis: 'derived'})
      expect(item.officialLabel || item.officialLabels?.length).toBeTruthy()
      if (item.note) {
        expect(item.noteBasis).toBe('derived')
        expect(item.noteSourceIds).toEqual([sid])
      }
    }
    expect(event('ysleta-2026-winter-break').dateBasis).toBe('derived')
    expect(calendar.keyDates.find(item => item.eventType === 'WINTER_BREAK')?.dateBasis).toBe('derived')
    for (const item of calendar.breaks) {
      expect(item.basis).toBe('derived')
      expect(item.componentEventIds.every(id => events.some(item => item.id === id))).toBe(true)
    }
  })

  it('answers 33 independent parent tasks and removes future-year/CMS language', () => {
    expect(calendar.faqs).toHaveLength(33)
    expect(new Set(calendar.faqs.map(item => item.question)).size).toBe(33)
    for (const question of [
      'When is fall intersession for Ysleta ISD in 2026?',
      'When is spring intersession for Ysleta ISD in 2027?',
      'Does my child have to attend Ysleta ISD intersession?',
      'Is there school in Ysleta ISD on Monday, October 12, 2026?',
      'Is there school in Ysleta ISD on Monday, January 4, 2027?',
      'When do Ysleta ISD students return after spring break?',
      'Is there school in Ysleta ISD on March 22, 2027?',
      'Is there school in Ysleta ISD on March 29, 2027?',
    ]) expect(calendar.faqs.filter(item => item.question === question)).toHaveLength(1)
    expect(answer('When is Ysleta ISD winter break in 2026-2027?')).toContain('winter no-school period runs December 21, 2026, through January 4, 2027')
    expect(answer('When do Ysleta ISD students return after winter break?')).toContain('Tuesday, January 5, 2027')
    expect(answer('When do Ysleta ISD students return after spring break?')).toContain('If March 22 is activated, students return that Monday')
    expect(answer('Is there school in Ysleta ISD on March 29, 2027?')).toContain('Students are off unless the district activates March 29')
    expect(answer('Where can I download the official Ysleta ISD calendar PDF?')).toContain('ICS download; that download is separate')
    expect(calendar.faqs.some(item => /2027-2028|verified here|supplied|this record/.test(item.question + item.answer))).toBe(false)
    expect(calendar.faqs.find(item => item.question.includes('grading-period end dates'))?.answer).not.toContain('fourth nine weeks')
  })

  it('separates conference levels, conference attendance, dismissal time and testing attendance', () => {
    for (const [level, dates] of [
      ['high', ['August 24, 2026', 'February 22, 2027']],
      ['middle', ['August 25, 2026', 'February 23, 2027']],
      ['elementary', ['September 15, 2026', 'February 24, 2027']],
    ] as const) {
      const reply = answer(`When are Ysleta ISD ${level} school parent conferences?`)
      for (const date of dates) expect(reply).toContain(date)
    }
    expect(calendar.faqs.some(item => item.question === 'When are parent conferences, and do students still have a full school day?')).toBe(false)
    expect(answer('Do students have a full school day on Ysleta ISD parent conference days?')).toMatch(/^Yes\./)
    expect(answer('Which Ysleta ISD days have early release?')).toBe('December 18, 2026, and June 4, 2027, are student half days with four hours of instruction.')
    expect(answer('What time is early release in Ysleta ISD?')).toContain('student half days with four hours of instruction, but')
    expect(answer('What time is early release in Ysleta ISD?')).toContain('does not give exact dismissal times')
    const testing = answer('Is school open during Ysleta ISD STAAR testing dates?')
    expect(testing).toContain('Yes, during the regular school year')
    expect(testing).toContain('December and April')
    expect(testing).toContain('June 15–17 retests take place after the June 4 last day')
    expect(event('ysleta-2027-june-retests').schoolStatus).toBe('not-applicable')
    expect(event('ysleta-2026-first-day').name).toBe('First Day of School — First Semester Begins')
    expect(event('ysleta-2026-october-no-students').name).toBe('Professional Development — No School for Students')
    expect(event('ysleta-2026-october-no-students').officialLabel).toBe('Professional Development/No Students')
    expect(event('ysleta-2026-december-testing').name).toBe('STAAR/EOC Testing')
  })

  it('answers school-on-holiday questions with No rather than reversing their meaning', () => {
    for (const [question, id] of [
      ['Is there school in Ysleta ISD on Memorial Day in 2027?', 'ysleta-2027-memorial-day'],
      ['Is there school in Ysleta ISD on Veterans Day in 2026?', 'ysleta-2026-veterans-day'],
      ['Is there school in Ysleta ISD on Martin Luther King Jr. Day in 2027?', 'ysleta-2027-mlk-day'],
      ['Is there school in Ysleta ISD on Good Friday in 2027?', 'ysleta-2027-good-friday'],
      ['Is there school in Ysleta ISD on Labor Day in 2026?', 'ysleta-2026-labor-day'],
    ]) {
      expect(answer(question!)).toMatch(/^No\./)
      expect(event(id!).schoolStatus).toBe('no-classes')
    }
    expect(answer('Is there school in Ysleta ISD on Memorial Day in 2027?')).toBe('No. Monday, May 31, 2027, is a district holiday, so students do not have classes. The school year resumes afterward and ends Friday, June 4.')
    expect(calendar.faqs.find(item => item.question.includes('instructional days'))?.answer).toContain('Adding those semester subtotals gives 176 days')
  })

  it('withholds uncertain registration dates without presenting the unverified flyer report as fact', () => {
    expect(events.some(item => item.id === 'ysleta-2026-registration')).toBe(false)
    expect(calendar.faqs.some(item => /registration/i.test(item.question))).toBe(false)
    const discrepancy = calendar.sourceDiscrepancies.find(item => item.field === 'events.ysleta-2026-registration.dateRange')!
    expect(discrepancy.resolution).toBe('unresolved')
    expect(discrepancy.sourceIds.every(id => calendar.sources.some(source => source.id === id))).toBe(true)
    expect(discrepancy.effect).toContain('The user audit reports')
    expect(discrepancy.effect).toContain('have not been independently confirmed')
    for (const resources of [record.page.relatedResources, calendar.relatedResources]) {
      expect(resources.find(item => item.href === 'https://www.yisd.net/events')?.description).toBe('District events and downloadable event calendar (ICS).')
    }
  })

  it('does not paint unknown intersession or conditional dates as normal school days', () => {
    const wrapper = mount(MonthlyCalendar, {props: {
      districtName: 'Ysleta ISD', events, firstDay: calendar.firstDay, lastDay: calendar.lastDay, timeZone: record.district.timeZone,
    }})
    try {
      const cell = (date: string) => wrapper.find('time[datetime="' + date + '"]').element.closest('td')!
      for (const date of ['2026-09-28', '2026-10-02', '2027-03-08', '2027-03-12', '2027-03-22', '2027-03-29']) {
        expect(cell(date).classList.contains('month-day--school-day')).toBe(false)
        expect(cell(date).classList.contains('month-day--holiday')).toBe(false)
        expect(cell(date).classList.contains('month-day--important')).toBe(true)
      }
      for (const date of ['2026-12-01', '2027-04-06', '2027-01-05', '2026-08-24']) {
        expect(cell(date).classList.contains('month-day--school-day')).toBe(true)
      }
    } finally { wrapper.unmount() }
    const table = mount(CalendarEventsTable, {props: {events: events.filter(item => item.eventType === 'INTERSESSION'), districtName: 'Ysleta ISD', schoolYear: '2026-2027'}})
    try {
      expect(table.text()).toContain('Participation not specified')
      expect(table.text()).not.toContain('Varies by school')
    } finally { table.unmount() }
  })

  it('exports the exact revised answers to FAQ JSON-LD', () => {
    const graph = buildDistrictCalendarSchema({
      siteUrl: 'https://flschoolcalendar.com', path: '/ysleta-isd/2026-2027/',
      district: record.district, calendar: calendar as DistrictCalendar, discovery: record.calendarDiscovery,
    })['@graph']
    const faq = graph.find(item => item['@type'] === 'FAQPage')!
    expect(faq.mainEntity).toEqual(calendar.faqs.map(item => ({'@type': 'Question', name: item.question, acceptedAnswer: {'@type': 'Answer', text: item.answer}})))
  })

  it('exports stable ICS UIDs with testing windows, uncertain participation and possible make-up notes', () => {
    const ics = readFileSync('test/fixtures' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r\n /g, '')
    const entries = ics.split('BEGIN:VEVENT').slice(1)
    expect(entries).toHaveLength(26)
    expect(ics).not.toContain('UID:ysleta-2026-registration@')
    for (const item of events.filter(item => item.eventType !== 'PARENT_CONFERENCE')) {
      const entry = entries.find(value => value.includes('UID:' + item.id + '@'))!
      expect(entry).toBeTruthy()
      expect(entry).toContain('DTSTART;VALUE=DATE:' + item.dateStart!.replaceAll('-', ''))
      if (item.eventType === 'INTERSESSION') expect(entry).toContain('Participation not specified')
      if (item.mayBecomeAttendanceDay) expect(entry).toMatch(/unless|activates/)
    }
    expect(ics).toContain('CATEGORIES:LAST_DAY,EARLY_RELEASE,SEMESTER_END')
    expect(ics).not.toContain('varied by school')
  })
})
