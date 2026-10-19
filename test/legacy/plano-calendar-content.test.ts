import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import CalendarBellTimes from '../../app/components/calendar/CalendarBellTimes.vue'
import MonthlyCalendar from '../../app/components/calendar/MonthlyCalendar.vue'
import record from '../fixtures/districts/plano-isd.json'
import type { CalendarEvent, CalendarSchoolHours } from '../../shared/types/content'
// @ts-ignore Dependency-free offline content validator.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const calendar = record.schoolYears['2026-2027']
const graphic = 'plano-2026-2027-approved-calendar-pdf'
const text = 'plano-2026-2027-text-calendar-pdf'
const events = calendar.events as CalendarEvent[]
const event = (id: string) => events.find(item => item.id === id)!
const retiredIds = [
  'plano-2026-october-break',
  'plano-2026-winter-break-and-january-holiday',
  'plano-2027-february-student-holidays',
  'plano-2027-march-student-holiday-weekend',
]

function weekdays(start: string, end: string) {
  const result: string[] = []
  const date = new Date(start + 'T00:00:00Z')
  for (; date.toISOString().slice(0, 10) <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) result.push(date.toISOString().slice(0, 10))
  }
  return result
}

describe('Plano ISD atomic events, source labels and dismissal schedules', () => {
  it('passes the content gate without introducing another school year', () => {
    expect(auditRecords([{ filename: 'plano-isd.json', record }])).toEqual([])
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027'])
  })

  it('preserves official attendance boundaries and recalculates the atomic-event statistics', () => {
    expect(calendar).toMatchObject({ firstDay: '2026-08-11', lastDay: '2027-05-21' })
    expect(events).toHaveLength(25)
    expect(new Set(events.map(item => item.id)).size).toBe(events.length)
    expect(events.map(item => item.dateStart)).toEqual(events.map(item => item.dateStart).toSorted())
    const calculated = calculateCalendarStatistics(calendar)
    expect(calculated.map((item: { value: string }) => item.value)).toEqual(calendar.statistics.map(item => item.value))
    expect(calendar.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value: '171 days', basis: 'official' })
    expect(calendar.statistics.find(item => item.id === 'total-no-school-weekdays')?.value).toBe('33 weekdays')
    expect(calendar.statistics.find(item => item.id === 'student-no-school-days')?.value).toBe('7 days')
    expect(calendar.statistics.find(item => item.id === 'early-release-days')?.value).toBe('2 dates')
  })

  it('retains exactly the same closed weekdays after replacing composite events', () => {
    const previousRanges = [
      ['2026-09-07', '2026-09-07'], ['2026-10-12', '2026-10-16'],
      ['2026-11-03', '2026-11-03'], ['2026-11-23', '2026-11-27'],
      ['2026-12-21', '2027-01-04'], ['2027-01-18', '2027-01-18'],
      ['2027-02-15', '2027-02-16'], ['2027-03-15', '2027-03-19'],
      ['2027-03-26', '2027-03-29'],
    ]
    const expected = new Set(previousRanges.flatMap(([start, end]) => weekdays(start!, end!)))
    const actual = new Set(events.filter(item => calendar.noSchoolDayEventIds.includes(item.id))
      .flatMap(item => weekdays(item.dateStart, item.dateEnd || item.dateStart)))
    expect([...actual].toSorted()).toEqual([...expected].toSorted())
    expect(retiredIds.every(id => !events.some(item => item.id === id) && !calendar.noSchoolDayEventIds.includes(id))).toBe(true)
  })

  it('keeps October source categories distinct and the family-planning range derived', () => {
    const october = events.filter(item => item.dateStart >= '2026-10-12' && item.dateStart <= '2026-10-16')
    expect(october.map(item => [item.dateStart, item.dateEnd, item.name, item.eventType])).toEqual([
      ['2026-10-12', '2026-10-14', 'Student/Teacher Holiday', 'HOLIDAY'],
      ['2026-10-15', null, 'Staff Day/Student Holiday', 'NON_STUDENT_DAY'],
      ['2026-10-16', null, 'Campus PLC Day/Student Holiday', 'NON_STUDENT_DAY'],
    ])
    for (const item of october) {
      expect(item).toMatchObject({ sourceId: graphic, dateBasis: 'official', eventTypeBasis: 'derived', schoolStatusBasis: 'derived' })
      expect(item.nameBasis).toBe(item.name === item.officialLabel ? 'official' : 'derived')
    }
    expect(events.some(item => item.eventType === 'FALL_BREAK')).toBe(false)
    expect(calendar.keyDates.find(item => item.dateStart === '2026-10-12')).toMatchObject({ eventType: 'STUDENT_BREAK', dateBasis: 'derived', labelBasis: 'derived', eventTypeBasis: 'derived' })
    expect(calendar.breaks.find(item => item.dateStart === '2026-10-12')).toMatchObject({ dateEnd: '2026-10-16', nextStudentAttendanceDate: '2026-10-19' })
  })

  it('ends official Winter Break on January 1 while retaining January 4 as a separate student holiday', () => {
    expect(event('plano-2026-winter-break')).toMatchObject({ dateStart: '2026-12-21', dateEnd: '2027-01-01', eventType: 'WINTER_BREAK', dateBasis: 'official', nameBasis: 'official', schoolStatus: 'no-classes', schoolStatusBasis: 'derived' })
    expect(event('plano-2027-january-4-student-holiday')).toMatchObject({ dateStart: '2027-01-04', eventType: 'NON_STUDENT_DAY', name: 'Staff Day/Student Holiday' })
    expect(calendar.breaks.find(item => item.name.startsWith('Winter'))).toMatchObject({ dateEnd: '2027-01-04', nextStudentAttendanceDate: '2027-01-05' })
  })

  it('separates February and March official categories from their planning ranges', () => {
    expect(event('plano-2027-february-15-student-holiday')).toMatchObject({ dateStart: '2027-02-15', name: 'Staff Day/Student Holiday' })
    expect(event('plano-2027-february-16-student-holiday')).toMatchObject({ dateStart: '2027-02-16', name: 'Campus PLC Day/Student Holiday' })
    expect(event('plano-2027-march-26-holiday')).toMatchObject({ dateStart: '2027-03-26', eventType: 'HOLIDAY', schoolStatus: 'no-classes' })
    expect(event('plano-2027-march-29-student-holiday')).toMatchObject({ dateStart: '2027-03-29', eventType: 'NON_STUDENT_DAY', schoolStatus: 'no-students' })
    expect(calendar.breaks.find(item => item.dateStart === '2027-03-26')).toMatchObject({ dateEnd: '2027-03-29', nextStudentAttendanceDate: '2027-03-30' })
  })

  it('attributes the whole Thanksgiving week to the Text Calendar and explains the Graphic Calendar difference', () => {
    const thanksgiving = event('plano-2026-thanksgiving-break')
    expect(thanksgiving).toMatchObject({ dateStart: '2026-11-23', dateEnd: '2026-11-27', sourceId: text, dateBasis: 'official', nameBasis: 'derived', noteBasis: 'derived' })
    expect(thanksgiving.noteSourceIds).toEqual([text, graphic])
    expect(thanksgiving.note).toContain('November 23–24 as Professional Learning Trade Days')
    expect(thanksgiving.note).toContain('November 25–27 as Thanksgiving Break')
  })

  it('preserves official date/label evidence without presenting taxonomy mappings as source values', () => {
    for (const item of events) {
      expect(item).not.toHaveProperty('basis')
      expect(item).toMatchObject({ dateBasis: 'official', eventTypeBasis: 'derived', schoolStatusBasis: 'derived' })
      if (['plano-2026-second-grading-period-start', 'plano-2027-fourth-grading-period-start'].includes(item.id)) {
        expect(item).not.toHaveProperty('officialLabel')
      }
      else expect(item.officialLabel).toBeTruthy()
      expect(item.nameBasis).toBe(item.name === item.officialLabel ? 'official' : 'derived')
    }
    for (const item of calendar.keyDates) {
      expect(item).not.toHaveProperty('basis')
      expect(item.eventTypeBasis).toBe('derived')
    }
    expect(calendar.about.processing).toContain('official means a directly printed date, label or range')
    expect(calendar.about.processing).toContain('attendance-status mappings')
  })

  it('aligns November 3 staff-development wording and the official download link with the Text Calendar', () => {
    expect(event('plano-2026-november-3-student-holiday')).toMatchObject({
      sourceId: text, name: 'Student Holiday / Staff Development / Work Day',
      officialLabel: 'Student Holiday | Staff Development | Work Day', nameBasis: 'derived',
      noteBasis: 'derived', noteSourceIds: [text], schoolStatus: 'no-students',
    })
    expect(calendar.sources.find(item => item.id === text)!.url).toBe('https://www.pisd.edu/fs/resource-manager/view/9f41d754-431f-444a-9145-f5f7583fefd5')
  })

  it('marks editorial notes as derived and cites the official evidence separately', () => {
    const sourceIds = new Set(calendar.sources.map(item => item.id))
    const noted = events.filter(item => item.note)
    expect(noted.length).toBeGreaterThan(10)
    for (const item of noted) {
      expect(item.noteBasis).toBe('derived')
      expect(item.noteSourceIds?.length).toBeGreaterThan(0)
      expect(new Set(item.noteSourceIds).size).toBe(item.noteSourceIds!.length)
      for (const sourceId of item.noteSourceIds!) expect(sourceIds.has(sourceId)).toBe(true)
    }
    for (const item of events.filter(item => item.eventType === 'EARLY_RELEASE' || item.eventType === 'GRADING_PERIOD_END')) {
      expect(item.noteSourceIds).toEqual([text])
    }
  })

  it.each([
    ['plano-2026-october-16-student-holiday', 'October 15–16', [graphic, text, 'plano-isd-calendar-page']],
    ['plano-2027-february-16-student-holiday', 'February 15–16', [graphic, text]],
  ])('preserves the staff-label difference for %s without introducing date or attendance uncertainty', (id, textRange, sourceIds) => {
    const item = event(id as string)
    expect(item).toMatchObject({
      name: 'Campus PLC Day/Student Holiday', officialLabel: 'Campus PLC Day/Student Holiday',
      sourceId: graphic, nameBasis: 'official', dateBasis: 'official', schoolStatus: 'no-students',
      noteBasis: 'derived', noteSourceIds: sourceIds,
    })
    expect(item.note).toContain('text calendar groups ' + textRange)
    expect(item.note).toContain('Staff Development / Work Day')
    expect(item).not.toHaveProperty('sourceConflict')
    const discrepancy = calendar.sourceDiscrepancies.find(value => value.field === 'events.' + id + '.officialLabel')!
    expect(discrepancy).toMatchObject({ resolution: 'source-conflict', sourceIds })
    expect(discrepancy.effect).toContain('date and student no-school status agree')
    if (id.includes('october')) {
      expect(item.note).toContain('live calendar')
      expect(item.note).toContain('October 6, 2026')
    }
  })

  it('does not present a graphic legend as an event-specific source label', () => {
    for (const id of ['plano-2026-second-grading-period-start', 'plano-2027-fourth-grading-period-start']) {
      const item = event(id)
      expect(item).not.toHaveProperty('officialLabel')
      expect(item).toMatchObject({ nameBasis: 'derived', sourceId: graphic })
    }
    expect(events.some(item => item.officialLabel === 'Start | End of Grading Period')).toBe(false)
    const fallAnswer = calendar.faqs.find(item => /fall break in October/.test(item.question))!.answer
    expect(fallAnswer).toContain('graphic calendar marks October 12–14')
    expect(fallAnswer).toContain('text calendar groups October 15–16')
    expect(fallAnswer).toContain('Students return October 19')
  })

  it('simplifies semester event names while retaining grading-period facts and their specific evidence', () => {
    expect(event('plano-2026-second-grading-period-end')).toMatchObject({
      name: 'Second Grading Period Ends', sourceId: text, officialLabel: 'End of 2nd Grading Period', nameBasis: 'derived',
    })
    expect(event('plano-2026-second-grading-period-end').note).toContain('first semester also ends on this date after 82 instructional days')
    expect(event('plano-2027-second-semester-start')).toMatchObject({
      name: 'Second Semester Begins', officialLabel: '2nd Semester Begins', nameBasis: 'derived',
      note: 'Classes resume January 5, which also begins the third grading period.', noteBasis: 'derived',
    })
    for (const item of events.filter(item => item.eventType === 'GRADING_PERIOD_END')) {
      expect(item.sourceId).toBe(text)
      expect(item.officialLabel).toMatch(/^End of [1-4](st|nd|rd|th) Grading Period$/)
    }
    expect(calendar.editorialSummary.paragraphs[3]).toContain('elementary schools dismiss at 12:00 p.m., while Beaty, Isaacs, Pearson, and Head Start dismiss at 11:55 a.m.')
  })

  it('keeps primary early release separate from secondary exam-dismissal times', () => {
    for (const item of events.filter(item => item.eventType === 'EARLY_RELEASE')) {
      expect(item.sourceId).toBe(text)
      expect(item.note).toContain('elementary schools dismiss at 12:00 p.m.')
      expect(item.note).toContain('Beaty, Isaacs, Pearson, and Head Start dismiss at 11:55 a.m.')
      expect(item.note).toContain('separately lists exam dismissal times')
      expect(item.note).toContain('middle schools on the last day of exams')
      expect(item).not.toHaveProperty('scheduleType')
      expect(item).not.toHaveProperty('gradeScope')
    }
    const wrapper = mount(CalendarBellTimes, { props: {
      hours: calendar.schoolHours as CalendarSchoolHours[], sources: calendar.sources, heading: 'Plano ISD school hours',
    } })
    try {
      const rows = wrapper.findAll('.calendar-bell-times-row')
      const middle = rows.find(row => row.find('h3').text() === 'Middle school')!
      expect(middle.text()).toContain('Exam dismissal')
      expect(middle.text()).toContain('12:40 p.m. on the last day of exams only')
      expect(middle.text()).not.toContain('Early release')
      const elementary = rows.find(row => row.find('h3').text() === 'Elementary school')!
      expect(elementary.text()).toContain('Early release')
      expect(elementary.text()).toContain('12:00 p.m.')
      expect(elementary.text()).not.toContain('Exam dismissal')
      expect(wrapper.find('.calendar-bell-times-sources a').attributes('href')).toBe(calendar.sources.find(item => item.id === text)!.url)
      expect(wrapper.find('.calendar-bell-times-sources time').attributes('datetime')).toBe('2026-04-20')
    }
    finally { wrapper.unmount() }
  })

  it('uses parent-facing questions without internal publishing or staff-date omission explanations', () => {
    expect(calendar.faqs).toHaveLength(23)
    const questions = calendar.faqs.map(item => item.question).join(' ')
    expect(questions).not.toMatch(/omitted|included here|2027-2028/)
    expect(calendar.faqs.filter(item => /grading periods/i.test(item.question))).toHaveLength(1)
    expect(calendar.faqs.find(item => /grading periods/i.test(item.question))?.answer).toContain('43 instructional days')
    expect(calendar.faqs.find(item => /fall break/i.test(item.question))?.answer).toContain('does not label the full week as one official Fall Break')
    expect(calendar.faqs.find(item => /Winter Break/.test(item.question))?.answer).toContain('January 4 is a separate student holiday')
    expect(calendar.faqs.find(item => /graduation dates/.test(item.question))?.answer).toContain('text calendar lists')
    expect(calendar.editorialSummary.paragraphs).toHaveLength(4)
    expect(calendar.seo.title).toBe('Plano ISD Calendar 2026-27: Holidays, Breaks & Hours')
  })

  it.each(['2026-10-15', '2026-10-16', '2027-01-04', '2027-02-16', '2027-03-29'])('renders %s as a student holiday after splitting the events', (date) => {
    const wrapper = mount(MonthlyCalendar, { props: {
      districtName: record.district.shortName, events, firstDay: calendar.firstDay, lastDay: calendar.lastDay,
    } })
    try {
      expect(wrapper.find('time[datetime="' + date + '"]').element.parentElement?.classList.contains('month-day--holiday')).toBe(true)
    }
    finally { wrapper.unmount() }
  })

  it('exports atomic ICS entries, correct exclusive end dates and the exam-day limitation', () => {
    const ics = readFileSync('test/fixtures' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r\n /g, '')
    for (const id of retiredIds) expect(ics).not.toContain('UID:' + id + '@')
    for (const item of events) {
      const block = ics.split('BEGIN:VEVENT').find(value => value.includes('UID:' + item.id + '@flschoolcalendar.com'))!
      expect(block).toBeDefined()
      expect(block).toContain('DTSTART;VALUE=DATE:' + item.dateStart.replaceAll('-', ''))
      const end = new Date((item.dateEnd || item.dateStart) + 'T00:00:00Z')
      end.setUTCDate(end.getUTCDate() + 1)
      expect(block).toContain('DTEND;VALUE=DATE:' + end.toISOString().slice(0, 10).replaceAll('-', ''))
    }
    expect(ics).toContain('middle schools on the last day of exams')
    expect(ics).toContain('Professional Learning Trade Days')
    expect(ics).toContain('live calendar uses that label for both dates as checked October 6')
    expect(ics).toContain('The text calendar groups February 15–16')
    expect(ics).not.toContain('Official calendar label: Start | End of Grading Period')
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(25)
  })
})
