import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MonthlyCalendar from '../../app/components/calendar/MonthlyCalendar.vue'
import record from '../fixtures/districts/pharr-san-juan-alamo-isd.json'
import type { CalendarEvent } from '../../shared/types/content'
// @ts-ignore Dependency-free checks are shared with the offline publishing gate.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Shared offline statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const calendar = record.schoolYears['2026-2027']
const events = calendar.events as CalendarEvent[]

describe('PSJA ISD source events and family planning', () => {
  it('passes the publishing gate and preserves official year boundaries and reporting totals', () => {
    expect(auditRecords([{ filename: 'pharr-san-juan-alamo-isd.json', record }])).toEqual([])
    expect(calendar.firstDay).toBe('2026-08-24')
    expect(calendar.lastDay).toBe('2027-06-02')
    expect(calendar.events).toHaveLength(41)
    expect(new Set(events.map(e => e.id)).size).toBe(41)
    expect([24, 29, 24, 32, 34, 32].reduce((sum, n) => sum + n, 0)).toBe(175)
  })

  it('keeps the August weekday camps separate rather than implying weekend programming', () => {
    const august = events.filter(e => e.id.startsWith('psja-2026-august-'))
    expect(august.map(e => [e.dateStart, e.dateEnd])).toEqual([
      ['2026-08-03', '2026-08-07'], ['2026-08-10', '2026-08-14'],
    ])
    for (const e of august) {
      expect(e.eventType).toBe('ENRICHMENT_DAY')
      expect(e.schoolStatus).toBe('program-specific')
      expect(e.noteSourceIds).toContain('psja-summer-opportunities-page')
    }
    expect(events.some(e => e.id === 'psja-2026-august-enrichment')).toBe(false)
  })

  it('keeps the official Winter Break separate from staff-development closures', () => {
    expect(events.find(e => e.id === 'psja-2026-winter-break')).toMatchObject({
      dateStart: '2026-12-21', dateEnd: '2027-01-01', name: 'Winter Break', basis: 'official',
    })
    const staff = events.filter(e => e.eventType === 'STAFF_DEVELOPMENT')
    expect(staff.map(e => [e.dateStart, e.dateEnd])).toEqual([
      ['2026-09-07', null], ['2026-10-12', null], ['2026-12-18', null], ['2027-01-04', '2027-01-05'],
    ])
    expect(staff.every(e => calendar.noSchoolDayEventIds.includes(e.id))).toBe(true)
    expect(calendar.keyDates.find(k => k.eventType === 'WINTER_BREAK')).toMatchObject({
      dateStart: '2026-12-21', dateEnd: '2027-01-01', basis: 'official',
    })
    expect(calendar.breaks.find(b => b.name === 'Winter Student No-School Period')).toMatchObject({
      dateStart: '2026-12-18', dateEnd: '2027-01-05', nextStudentAttendanceDate: '2027-01-06',
      nextStudentAttendanceDateBasis: 'derived', schoolWeekdaysOff: 13,
    })
  })

  it('uses reporting-period milestones rather than semester or testing attendance states', () => {
    const starts = events.filter(e => e.name.endsWith('Reporting Period Begins'))
    expect(starts).toHaveLength(5)
    expect(starts.every(e => e.eventType === 'GRADING_PERIOD_START' && e.schoolStatus === 'schools-open')).toBe(true)
    expect(events.some(e => e.eventType === 'SEMESTER_START' || e.schoolStatus === 'exam-day')).toBe(false)
    expect(events.find(e => e.id === 'psja-2027-fifth-reporting-period-end')?.schoolStatus).toBe('schools-open')
  })

  it('does not invent individual testing assignments or normal summer attendance', () => {
    const testing = events.filter(e => e.eventType === 'STATE_TEST')
    expect(testing).toHaveLength(8)
    for (const e of testing) {
      expect(e.isWindow).toBe(true)
      expect(e.gradeScope).toBeNull()
      if (e.dateEnd === '2027-04-16') {
        expect(e.noteBasis).toBe('derived')
        expect(e.note).toContain('end of the fifth reporting period')
      }
      else {
        expect(e.note).toBeNull()
        expect(e.noteBasis).toBeUndefined()
      }
      expect(e.schoolStatus).toBe(e.dateStart! > calendar.lastDay ? 'not-applicable' : 'schools-open')
    }
  })

  it('preserves both weather-day source labels without inventing a make-up activation policy', () => {
    for (const date of ['2027-02-15', '2027-03-26']) {
      const e = events.find(e => e.dateStart === date)!
      expect(e).toMatchObject({
        basis: 'official', dateBasis: 'official', eventTypeBasis: 'derived', schoolStatusBasis: 'official',
        schoolStatus: 'no-classes', scheduledAsNoSchool: true, scheduledAsNoSchoolBasis: 'official',
        countsAsStudentAttendanceDayUnderPublishedSchedule: false,
        countsAsStudentAttendanceDayUnderPublishedScheduleBasis: 'derived',
      })
      expect(e.officialLabels).toEqual([date === '2027-02-15' ? 'Non-School Day' : 'Easter Break', 'Weather Days'])
      expect(e.eventTypes).toContain('WEATHER_DAY')
      expect(e.eventTypes).not.toContain('BAD_WEATHER_DAY')
      expect(e.mayBecomeAttendanceDay).toBeUndefined()
      expect(e.mayBecomeAttendanceDayBasis).toBeUndefined()
      expect(e.note).toBeNull()
      expect(e.noteBasis).toBeUndefined()
      expect(e.countsAsStudentAttendanceDay).toBeUndefined()
      expect(calendar.noSchoolDayEventIds).toContain(e.id)
    }
    expect(JSON.stringify(calendar.faqs)).not.toMatch(/make-up|activated|may become an attendance day/)
    expect(events.some(e => e.schoolStatus === 'conditional-attendance')).toBe(false)
  })

  it('does not apply the Summer 2026 announcement to 2027 enrichment details', () => {
    const enrichment = events.filter(e => /enrichment/.test(e.id) && e.dateStart!.startsWith('2027'))
    expect(enrichment).toHaveLength(8)
    for (const e of enrichment) {
      expect(e.gradeScope).toBeNull()
      expect(e.eventType).toBe('ENRICHMENT_DAY')
      expect(e.eventTypeBasis).toBe('official')
      expect(e.occursOnRegularInstructionalDay).toBe(false)
      expect(e.note).toBeNull()
      expect(e.noteBasis).toBeUndefined()
      expect(e.noteSourceIds).toBeUndefined()
    }
    expect(calendar.sources.every(s => s.retrievedAt === calendar.verifiedAt)).toBe(true)
    expect(record.calendarDiscovery.lastCheckedAt).toBe(calendar.verifiedAt)
    expect(events.filter(e => e.eventType === 'ENRICHMENT_DAY')).toHaveLength(10)
    expect(events.some(e => e.eventType === 'SUMMER_PROGRAM' || e.eventType === 'RESERVED_ATTENDANCE_DAY')).toBe(false)
  })

  it('answers distinct parent queries without generic maintenance or assignment claims', () => {
    expect(calendar.seo.title).toBe('PSJA ISD 2026-2027 School Calendar: Dates & Breaks')
    expect(calendar.seo.description.length).toBeLessThanOrEqual(160)
    expect(calendar.faqs).toHaveLength(25)
    expect(new Set(calendar.faqs.map(f => f.question)).size).toBe(25)
    expect(calendar.faqs.map(f => f.question)).toEqual(expect.arrayContaining([
      'When is PSJA ISD Winter Break in 2026-2027?',
      'Does PSJA ISD have school on February 15, 2027?',
      'Does PSJA ISD have school on March 26, 2027?',
      'Does PSJA ISD have a Fall Break in 2026?',
      'When are PSJA ISD graduations in 2027?',
      'When are PSJA ISD staff-development days in 2026-2027?',
    ]))
    expect(JSON.stringify(calendar.faqs)).not.toMatch(/arrival time|Can PSJA ISD change the calendar|location and hours vary/)
    expect(JSON.stringify(calendar.editorialSummary)).not.toContain('guaranteed holidays')
    expect(JSON.stringify(record)).not.toMatch(/psja-2026-(september-7|october-12)-student-holiday/)
    expect(calendar.faqs.find(f => f.question === 'Does every student test on every marked state-testing day?')?.answer).toMatch(/^The academic calendar does not say/)
    const augustAnswer = calendar.faqs.find(f => f.question === 'Do all students attend the August enrichment days?')?.answer
    expect(augustAnswer).toMatch(/^The August dates are enrichment camps, not regular districtwide attendance days\./)
    expect(augustAnswer).toContain('registration available through the district')
    expect(JSON.stringify(record)).not.toContain('who sign up')
    expect(calendar.editorialSummary.paragraphs).toHaveLength(4)
    expect(calendar.editorialSummary.paragraphs[3]).toContain('transportation, breakfast and lunch provided')
    expect(calendar.hero.mobileDescription).toContain('from Dec. 18 through Jan. 5')
    expect(calendar.editorialSummary.paragraphs[1]).toContain('The district lists Winter Break as Dec. 21–Jan. 1')
    expect(calendar.editorialSummary.paragraphs[3]).toMatch(/^PSJA ISD also schedules enrichment beyond regular instructional days\./)
    expect(calendar.faqs.find(f => f.question === 'What are PSJA ISD enrichment days?')?.answer).toContain('participation details for the 2027 enrichment dates')
    for (const e of events) if (e.note === null) expect(e.noteBasis).toBeUndefined()
  })

  it('provides official graduation navigation without importing the Class of 2026 schedule into 2027', () => {
    const url = 'https://www.psjaisd.us/parents/graduations'
    expect(calendar.sources.find(s => s.id === 'psja-graduation-schedule-page')).toMatchObject({
      type: 'official-webpage', url, retrievedAt: calendar.verifiedAt,
    })
    expect(calendar.relatedResources.find(r => r.href === url)).toMatchObject({ external: true })
    const answer = calendar.faqs.find(f => f.question === 'When are PSJA ISD graduations in 2027?')?.answer
    expect(answer).toContain('does not list 2027 ceremony dates or times')
    expect(answer).toContain('official graduation schedule page for the 2027 schedule when it is published')
    expect(answer).not.toMatch(/June 4|June 5|June 4–5/)
    expect(events.some(e => /graduation/i.test(e.name))).toBe(false)
  })

  it('retains the exact Memorial Day name with explicit source provenance', () => {
    expect(events.find(e => e.id === 'psja-2027-memorial-day')).toMatchObject({
      name: 'Memorial Day', nameBasis: 'official', officialLabel: 'Memorial Day',
      dateStart: '2027-05-31', eventType: 'HOLIDAY', schoolStatus: 'no-classes',
    })
  })

  it('retains the official total and counts the published weather-day closures without assuming activation', () => {
    expect(calculateCalendarStatistics(calendar)).toEqual(calendar.statistics)
    const value = (id: string) => calendar.statistics.find(s => s.id === id)?.value
    expect(value('student-attendance-days')).toBe('175 days')
    expect(value('total-no-school-weekdays')).toBe('28 weekdays')
    expect(value('student-no-school-days')).toBe('6 days')
    expect(value('long-weekends')).toBe('5')
    expect(value('longest-no-school-stretch')).toBe('19 consecutive days')
    const withoutPublishedTotal = { ...calendar, highlights: [] }
    expect(calculateCalendarStatistics(withoutPublishedTotal).find((s: { id: string }) => s.id === 'student-attendance-days')).toMatchObject({
      value: '175 days', basis: 'derived',
    })
  })

  it('validates compound source labels and the enrichment taxonomy', () => {
    const invalid = structuredClone(record)
    const e = invalid.schoolYears['2026-2027'].events.find(e => e.id === 'psja-2027-february-15-weather-day')!
    e.officialLabels = ['Weather Days', 'Weather Days']
    expect(auditRecords([{ filename: 'pharr-san-juan-alamo-isd.json', record: invalid }])).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'INVALID_OFFICIAL_LABELS' }),
    ]))
  })

  it('renders the January staff-development closure but not an August enrichment weekend', () => {
    const wrapper = mount(MonthlyCalendar, { props: {
      districtName: record.district.shortName, events, firstDay: calendar.firstDay, lastDay: calendar.lastDay,
    } })
    try {
      for (const date of ['2027-01-04', '2027-01-05']) {
        expect(wrapper.find(`time[datetime="${date}"]`).element.parentElement?.classList.contains('month-day--holiday')).toBe(true)
      }
      for (const date of ['2026-08-08', '2026-08-09']) {
        expect(wrapper.find(`time[datetime="${date}"]`).element.parentElement?.classList.contains('month-day--holiday')).toBe(false)
      }
      for (const date of ['2027-02-15', '2027-03-26']) {
        expect(wrapper.find(`time[datetime="${date}"]`).element.parentElement?.classList.contains('month-day--holiday')).toBe(true)
      }
    }
    finally { wrapper.unmount() }
  })
})
