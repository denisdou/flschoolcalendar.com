import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mount, shallowMount } from '@vue/test-utils'
import CalendarEventsTable from '../../app/components/calendar/CalendarEventsTable.vue'
import DistrictCalendarPage from '../../app/components/calendar/DistrictCalendarPage.vue'
import type { CalendarEvent } from '../../shared/types/content'
import record from '../fixtures/districts/midland-isd.json'
// @ts-ignore Dependency-free build-time calculator, not part of the application bundle.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'
// @ts-ignore Build-time publication gate.
import { auditRecords } from '../../scripts/check-content-quality.mjs'

const calendars = Object.values(record.schoolYears)
const main = record.schoolYears['2026-2027']
const sam = record.schoolYears['2026-2027-sam-houston-south']
const prek = record.schoolYears['2026-2027-pre-k-academy']
const echs = record.schoolYears['2026-2027-early-college']

function weekdays(start: string, end: string) {
  const dates: string[] = []
  for (const d = new Date(start + 'T00:00:00Z'); d <= new Date(end + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() % 6 !== 0) dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

function closures(calendar: typeof main | typeof sam | typeof prek | typeof echs) {
  return new Set(calendar.events
    .filter(event => calendar.noSchoolDayEventIds.includes(event.id))
    .flatMap(event => weekdays(event.dateStart, event.dateEnd || event.dateStart)))
}

describe('Midland ISD campus calendar evidence', () => {
  it('keeps four campus scopes and boundary provenance separate', () => {
    expect(calendars).toHaveLength(4)
    expect(main).toMatchObject({ firstDay: '2026-08-18', lastDay: '2027-05-26', lastDayBasis: 'derived' })
    expect(sam).toMatchObject({ firstDay: '2026-08-04', lastDay: '2027-05-28', lastDayBasis: 'official' })
    expect(prek).toMatchObject({ firstDay: '2026-08-17', lastDay: '2027-05-21', firstDayBasis: 'derived', lastDayBasis: 'derived' })
    expect(echs).toMatchObject({ firstDay: '2026-08-18', lastDay: '2027-05-14', lastDayBasis: 'derived' })
    for (const c of calendars) {
      if (c.lastDayBasis === 'official') {
        expect(c.events.some(e => e.eventType === 'LAST_DAY' && e.dateStart === c.lastDay && e.dateBasis === 'official')).toBe(true)
      } else {
        expect(c.events.some(e => e.dateStart === c.lastDay && 'isFinalStudentDate' in e && e.isFinalStudentDate && e.finalStudentDateBasis === 'derived' && e.finalStudentDateScope === 'regular-year')).toBe(true)
        expect(c.events.some(e => e.eventType === 'CALENDAR_END')).toBe(false)
        expect(c.events.filter(e => e.dateStart === c.lastDay)).toHaveLength(1)
      }
      expect(c.seo.title.length).toBeLessThanOrEqual(60)
      // Scope accuracy takes precedence over an arbitrary snippet character cap.
      expect(c.seo.description.trim()).not.toBe('')
    }
  })

  it('lists every mandatory Pre-K Friday half day without converting it to a closure', () => {
    const closed = closures(prek)
    const expected = weekdays(prek.firstDay, prek.lastDay)
      .filter(d => new Date(d + 'T00:00:00Z').getUTCDay() === 5 && !closed.has(d))
    const early = prek.events.filter(e => e.eventType === 'HALF_DAY')
    expect(early.map(e => e.dateStart)).toEqual(expected)
    expect(early).toHaveLength(33)
    expect(early.every(e => !e.dateEnd && e.countsAsStudentAttendanceDay && e.officialLabel.includes('7:30-12:00'))).toBe(true)
    expect(early.every(e => e.eventTypes.length === 1 && e.eventTypes[0] === 'HALF_DAY' && e.eventTypesBasis.HALF_DAY === 'official')).toBe(true)
    expect(early.every(e => e.schoolStatus === 'early-dismissal' && e.schoolStatusBasis === 'derived' && e.noteBasis === 'official')).toBe(true)
    expect(prek.schoolHours.halfDay).toMatchObject({ start: '07:30', end: '12:00', mandatoryAttendance: true })
    expect(closed.has('2027-02-15')).toBe(false)
    for (const date of ['2027-02-26', '2027-04-30']) {
      expect(early.some(e => e.dateStart === date)).toBe(true)
      expect(prek.events.some(e => e.eventType === 'MAKEUP_DAY' && e.dateStart === date)).toBe(false)
    }
  })

  it('distinguishes ECHS Thanksgiving, full learning closures and four shortened dates', () => {
    expect(echs.events.find(e => e.eventType === 'THANKSGIVING_BREAK')).toMatchObject({ dateStart: '2026-11-25', dateEnd: '2026-11-27' })
    expect(main.events.find(e => e.eventType === 'THANKSGIVING_BREAK')).toMatchObject({ dateStart: '2026-11-23', dateEnd: '2026-11-27' })
    expect(echs.events.filter(e => e.eventType === 'EARLY_RELEASE').map(e => e.dateStart)).toEqual(['2026-10-16', '2026-11-13', '2027-02-19', '2027-05-14'])
    expect(main.events.find(e => e.dateStart === '2026-12-18' && e.eventType === 'NON_STUDENT_DAY')?.schoolStatus).toBe('no-classes')
    const off = closures(echs)
    for (const date of ['2026-10-12', '2026-10-13', '2026-11-09', '2026-11-13', '2027-02-15']) expect(off.has(date)).toBe(false)
    expect(echs.events.find(e => e.id.endsWith('summer-bridge'))).toMatchObject({ dateStart: '2027-05-27', dateEnd: '2027-05-28', gradeScope: 'Incoming 9th graders' })
    expect(echs.sourceIssues[0].code).toBe('SUMMER_WINDOW_GRID_CONFLICT')
  })

  it('does not turn uncertain conference attendance or possible weather instruction into confirmed closures', () => {
    const off = closures(sam)
    for (const event of sam.events.filter(e => e.eventType === 'TEACHER_CONFERENCE')) {
      expect(event.schoolStatus).toBe('unknown')
      expect(event.schoolStatusReason).toBe('source-does-not-state')
      for (const date of weekdays(event.dateStart, event.dateEnd || event.dateStart)) expect(off.has(date)).toBe(false)
    }
    expect(sam.events.find(e => e.eventType === 'MAKEUP_DAY')).toMatchObject({ dateStart: '2027-06-02', dateEnd: '2027-06-04', schoolStatus: 'conditional-attendance', countsAsStudentAttendanceDay: false })
    for (const c of [main, echs]) {
      const weather = c.events.filter(e => e.eventType === 'BAD_WEATHER_DAY')
      expect(weather.map(e => e.dateStart)).toEqual(['2027-02-26', '2027-04-30'])
      expect(weather.every(e => e.schoolStatus === 'no-classes' && c.noSchoolDayEventIds.includes(e.id) && !e.countsAsStudentAttendanceDayUnderPublishedSchedule)).toBe(true)
      expect(weather.every(e => e.eventTypeBasis === 'official' && e.schoolStatusBasis === 'official' && e.note === null)).toBe(true)
    }
    expect(sam.events.find(e => e.id.endsWith('field-trips'))).toMatchObject({ schoolStatus: 'unknown', schoolStatusReason: 'source-does-not-state' })
  })

  it('answers attendance and noon-dismissal queries directly without inventing an ECHS last-day label', () => {
    expect(main.faqs.find(f => f.question.startsWith('How many student attendance'))?.answer).toMatch(/^The current district calendar works out to 169/)
    expect(main.faqs[1].question).toContain('apply to every')
    expect(echs.seo.description).not.toContain('year-end')
    const answer = prek.faqs.find(f => f.question.startsWith('Which Pre-K Academy dates'))!.answer
    const expected = ['August 2026: 21, 28', 'September 2026: 4, 11, 18, 25', 'October 2026: 2, 9, 16, 23, 30', 'November 2026: 6, 13, 20', 'December 2026: 4, 11', 'January 2027: 8, 15, 22, 29', 'February 2027: 5, 12, 19, 26', 'March 2027: 19', 'April 2027: 2, 9, 16, 23, 30', 'May 2027: 7, 14, 21']
    for (const dates of expected) expect(answer).toContain(dates)
    for (const c of calendars) expect(c.editorialSummary.paragraphs.join(' ')).not.toMatch(/green cell|orange cell|stored attendance|supplies the inferred|not independently reconciled/)
  })

  it('stores official and calculated figures with calendar-specific explanations and hides zero metrics', () => {
    const counts = ['169 days', '184 days', '172 days', '167 days']
    calendars.forEach((calendar, index) => {
      const calculated = calculateCalendarStatistics(calendar)
      expect(calendar.statistics.map(s => [s.id, s.value, s.basis])).toEqual(calculated.map((s: { id: string; value: string; basis: string }) => [s.id, s.value, s.basis]))
      expect(calendar.statistics[0].value).toBe(counts[index])
      expect(calendar.statistics.every(s => s.explanation.length > 30 && !/^0(?:\s|$)/.test(s.value))).toBe(true)
    })
    expect(sam.statistics[0].basis).toBe('official')
    expect(sam.statistics[0]).toMatchObject({ id: 'student-teacher-contact-days', label: 'Student-teacher contact days', value: '184 days' })
    expect(sam.highlights[0].label).toBe('Student-teacher contact days')
    expect(sam.statistics[0].explanation).toContain('184 Student-teacher contact days')
    expect(sam.statistics.some(s => s.id === 'early-release-days')).toBe(false)
    expect(prek.statistics.find(s => s.id === 'mandatory-half-days')).toMatchObject({ label: 'Mandatory half days', value: '33 dates' })
    expect(prek.statistics.find(s => s.id === 'mandatory-half-days')?.explanation).toContain('7:30 a.m.–noon')
    expect(prek.statistics.some(s => s.id === 'early-release-days')).toBe(false)
    expect(echs.statistics.find(s => s.id === 'early-release-days')?.explanation).not.toContain('districtwide')
  })

  it('limits final-date summaries and ICS annotations to the regular year', () => {
    expect(main.hero.desktopDescription).toContain('regular-year')
    expect(main.faqs.find(f => /last student day/.test(f.question))?.answer).toContain('regular-year')
    expect(sam.faqs.some(f => f.question.startsWith('How many student-teacher contact days'))).toBe(true)
    for (const c of [main, prek, echs]) {
      const final = c.events.find(e => 'isFinalStudentDate' in e && e.isFinalStudentDate)!
      const wrapper = mount(CalendarEventsTable, { props: { events: [final] as CalendarEvent[], districtName: 'Midland ISD', schoolYear: c.schoolYear } })
      expect(wrapper.text()).toContain(c === prek ? 'Final regular-year / half day' : 'Final regular-year / early dismissal')
      wrapper.unmount()
      const ics = readFileSync(new URL('../fixtures' + c.actions.staticIcsUrl, import.meta.url), 'utf8').replace(/\r?\n[ \t]/g, '')
      expect(ics).toContain('Final regular-year student date shown:')
      expect(ics).not.toContain('Final student date shown:')
    }
  })

  it('keeps all standalone HALF_DAY events in key dates, statistics and ICS', () => {
    const page = shallowMount(DistrictCalendarPage, {
      props: { district: record.district, calendar: prek, calendars, relatedResources: [], otherDistricts: [], nearbyDistricts: [] },
    })
    const selected = page.findComponent(CalendarEventsTable).props('events') as CalendarEvent[]
    const halfDays = selected.filter(event => event.eventType === 'HALF_DAY')
    expect(halfDays).toHaveLength(33)
    expect(halfDays.every(event => !event.eventTypes?.includes('EARLY_RELEASE'))).toBe(true)
    page.unmount()

    const table = mount(CalendarEventsTable, { props: { events: halfDays, districtName: 'Midland ISD', schoolYear: prek.schoolYear } })
    expect(table.findAll('tbody tr')).toHaveLength(33)
    expect(table.findAll('.calendar-event-row--early-release')).toHaveLength(33)
    expect(table.text()).toContain('Half day')
    expect(table.text()).not.toContain('Early dismissal')
    table.unmount()

    const stats = calculateCalendarStatistics(prek)
    expect(stats.find((s: { id: string }) => s.id === 'mandatory-half-days')).toMatchObject({ value: '33 dates' })
    expect(stats.some((s: { id: string }) => s.id === 'early-release-days')).toBe(false)
    const ics = readFileSync(new URL('../fixtures' + prek.actions.staticIcsUrl, import.meta.url), 'utf8').replace(/\r?\n[ \t]/g, '')
    expect(ics.match(/CATEGORIES:HALF_DAY/g)).toHaveLength(33)
    expect(ics).not.toContain('EARLY_RELEASE')
  })

  it('keeps snippet scopes precise and editorial metadata out of the opening paragraphs', () => {
    expect(main.seo.description).toBe('Midland ISD district calendar: Aug. 18 start, Nov. 23–27 Thanksgiving Break, Dec. 21–Jan. 1 Winter Break, Mar. 8–12 Spring Break and May 26 early release.')
    expect(sam.seo.description).toContain('six in-year staff PD days')
    expect(main.editorialSummary.paragraphs[0]).not.toContain('approved')
    expect(sam.editorialSummary.paragraphs[0]).not.toContain('revised')
    expect(main.about.updates).toContain('12.16.25')
    expect(sam.about.updates).toContain('Revised 7 March 2026')
    expect(sam.editorialSummary.paragraphs.join(' ')).not.toContain('qualified May 28')
    expect(sam.faqs.map(f => f.answer).join(' ')).not.toMatch(/transferred here|added to this schedule/)
  })

  it('keeps the final editorial polish source-scoped without expanding FAQ or changing event IDs', () => {
    expect(calendars.map(c => c.faqs.length)).toEqual([20, 21, 18, 19])
    expect(main.hero.desktopDescription).toContain('May 26 is the last regular-year student date shown on the calendar and is an early-release day.')
    expect(main.editorialSummary.paragraphs[2]).toContain('May 26 is the last regular-year student date shown on the calendar and is an early-release day.')
    expect(main.faqs.find(f => /Good Friday/.test(f.question))?.answer).toBe('No. Good Friday, March 26, is a no-school day. The district calendar does not list Monday, March 29 as a no-school day.')
    expect(sam.faqs.map(f => f.answer).join(' ')).not.toMatch(/qualified May 28|confirm any activation/)
    expect(prek.faqs.some(f => f.answer.startsWith('No. This calendar applies only to Pre-K Academy at Midland College.'))).toBe(true)
    expect(prek.events.filter(e => e.eventType === 'HALF_DAY').every(e => e.id.startsWith('midland-prek-early-'))).toBe(true)
    expect(echs.faqs.find(f => /February 15/.test(f.question))?.answer).toMatch(/^The ECHS calendar does not list February 15 as a no-school day\./)
    expect(echs.faqs.find(f => /Good Friday/.test(f.question))?.answer).toBe('Good Friday, March 26, is a no-school day. Monday, March 29 is not listed as a no-school day on the ECHS calendar.')
  })

  it('marks missing-information observations and closure relationships as derived notes', () => {
    for (const c of [main, echs]) {
      const notes = c.events.filter(e => e.note && /does not|no dismissal time|gives no|no session times|not a full-day/i.test(e.note))
      expect(notes.length).toBeGreaterThan(0)
      expect(notes.every(e => e.noteBasis === 'derived')).toBe(true)
    }
    expect(main.events.find(e => e.id === 'midland-main-semester')?.noteBasis).toBe('derived')
    expect(echs.events.find(e => e.id === 'midland-echs-semester')?.noteBasis).toBe('official')
  })

  it('separates Pre-K closure evidence from semantic break labels and recognizes official Sam recesses', () => {
    const types = ['THANKSGIVING_BREAK', 'WINTER_BREAK', 'SPRING_BREAK']
    for (const c of [prek, sam]) {
      const keys = c.keyDates.filter(k => types.includes(k.eventType))
      expect(keys).toHaveLength(3)
      for (const key of keys) {
        const event = c.events.find(e => e.eventType === key.eventType && e.dateStart === key.dateStart)!
        const expectedBasis = c === prek ? 'derived' : 'official'
        expect(key).toMatchObject({ basis: expectedBasis, dateBasis: 'official', labelBasis: 'official', eventTypeBasis: expectedBasis })
        expect(event).toMatchObject({ dateBasis: 'official', nameBasis: 'official', eventTypeBasis: expectedBasis })
        expect(key.label).toBe(event.name)
      }
    }
    expect(sam.faqs.at(-1)?.answer).toBe('Midland ISD lists the official download as “Sam Houston and South Elem. Calendar” on its Calendars page. This is the separate calendar for Sam Houston Collegiate Preparatory Elementary and South Elementary.')
    expect(main.editorialSummary.paragraphs.join(' ')).toContain('Good Friday, March 26, is a no-school day.')
    expect(echs.editorialSummary.paragraphs.join(' ')).toContain('Good Friday, March 26, is a no-school day.')
    expect(sam.editorialSummary.highlights.join(' ')).not.toContain('qualified by')
    expect(echs.editorialSummary.highlights).toContain('May 14 final grading cycle and early release')
  })

  it.each([
    [{ dateBasis: 'assumed' }, 'INVALID_KEY_DATE_FIELD_BASIS'],
    [{ basis: 'official' }, 'CONFLICTING_KEY_DATE_SUMMARY_BASIS'],
    [{ eventTypeBasis: 'official' }, 'KEY_DATE_EVENT_BASIS_MISMATCH'],
    [{ labelBasis: 'derived' }, 'KEY_DATE_EVENT_BASIS_MISMATCH'],
  ])('rejects unsafe key-date field provenance: %j', (overrides, code) => {
    const copy = structuredClone(record)
    Object.assign(copy.schoolYears['2026-2027-pre-k-academy'].keyDates.find(k => k.eventType === 'THANKSGIVING_BREAK')!, overrides)
    expect(auditRecords([{ filename: 'midland-isd.json', record: copy }]).some((issue: { code: string }) => issue.code === code)).toBe(true)
  })

  it('merges same-day grading boundaries without losing official closure or release status', () => {
    for (const [c, date, primary] of [[main, '2026-12-18', 'NON_STUDENT_DAY'], [sam, '2027-05-28', 'LAST_DAY'], [echs, '2026-10-16', 'EARLY_RELEASE'], [echs, '2026-12-18', 'NON_STUDENT_DAY']] as const) {
      const events = c.events.filter(e => e.dateStart === date)
      expect(events).toHaveLength(1)
      expect(events[0]?.eventType).toBe(primary)
      expect(events[0]?.eventTypes).toContain('GRADING_PERIOD_END')
      expect(events[0]?.eventTypesBasis.GRADING_PERIOD_END).toBe(c === sam ? 'derived' : 'official')
    }
    expect(sam.faqs.some(f => f.question.startsWith('Do Sam Houston and South Elementary follow'))).toBe(true)
    expect(echs.faqs.some(f => f.question.startsWith('Does Midland ISD Early College follow'))).toBe(true)
    expect(echs.editorialSummary.paragraphs.join(' ')).not.toMatch(/copied|transferred/)
  })

  it.each([{ finalStudentDateScope: 'all-year' }, { isFinalStudentDate: false }])('rejects unsafe final-date scope: %j', overrides => {
    const copy = structuredClone(record)
    Object.assign(copy.schoolYears['2026-2027'].events.find(e => 'isFinalStudentDate' in e && e.isFinalStudentDate)!, overrides)
    expect(auditRecords([{ filename: 'midland-isd.json', record: copy }]).some((issue: { code: string }) => issue.code === 'INVALID_FINAL_STUDENT_DATE_SCOPE')).toBe(true)
  })

  it('merges break dates only across confirmed continuous student closures', () => {
    for (const c of calendars) {
      const off = closures(c)
      for (const b of c.breaks) {
        const dates = weekdays(b.dateStart, b.dateEnd)
        expect(dates.every(date => off.has(date))).toBe(true)
        expect(dates).toHaveLength(b.schoolWeekdaysOff)
        expect(off.has(b.nextStudentAttendanceDate)).toBe(false)
        expect(off.has(b.lastStudentAttendanceDate)).toBe(false)
      }
    }
  })

  it('exports matching source events with exclusive all-day ICS ends', () => {
    for (const c of calendars) {
      const ics = readFileSync(new URL('../fixtures' + c.actions.staticIcsUrl, import.meta.url), 'utf8').replace(/\r?\n[ \t]/g, '')
      const blocks = [...ics.matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/g)].map(m => m[1]!)
      const visible = c.events.filter(e => !['CALENDAR_START', 'CALENDAR_END'].includes(e.eventType))
      expect(blocks).toHaveLength(visible.length)
      for (const e of visible) {
        const block = blocks.find(b => b.includes('UID:' + e.id + '@'))!
        const end = new Date((e.dateEnd || e.dateStart) + 'T00:00:00Z')
        end.setUTCDate(end.getUTCDate() + 1)
        expect(block).toContain('DTSTART;VALUE=DATE:' + e.dateStart.replaceAll('-', ''))
        expect(block).toContain('DTEND;VALUE=DATE:' + end.toISOString().slice(0, 10).replaceAll('-', ''))
      }
    }
  })
})
