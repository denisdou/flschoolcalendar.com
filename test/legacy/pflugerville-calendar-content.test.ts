import { describe, expect, it, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import raw from '../fixtures/districts/pflugerville-isd.json'
import type { DistrictRecord } from '../../shared/types/content'
import CalendarEventsTable from '../../app/components/calendar/CalendarEventsTable.vue'
import MonthlyCalendar from '../../app/components/calendar/MonthlyCalendar.vue'
import CalendarBreakCountdown from '../../app/components/calendar/CalendarBreakCountdown.vue'
import CalendarFaq from '../../app/components/calendar/CalendarFaq.vue'
import DistrictCalendarPage from '../../app/components/calendar/DistrictCalendarPage.vue'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore Offline validator.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Offline statistic generator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = raw as unknown as DistrictRecord
const calendar = record.schoolYears['2026-2027']!
const events = calendar.events
function dates(start: string, end = start) {
  const result = []
  for (const d = new Date(start + 'T00:00:00Z'); d <= new Date(end + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) result.push(d.toISOString().slice(0, 10))
  return result
}
const weekday = (d: string) => ![0, 6].includes(new Date(d + 'T00:00:00Z').getUTCDay())
const confirmed = new Set(events.filter(e => calendar.confirmedNoSchoolDayEventIds!.includes(e.id)).flatMap(e => dates(e.dateStart!, e.dateEnd || e.dateStart!)))

describe('Pflugerville regular student calendar', () => {
  afterEach(() => vi.useRealTimers())

  it('uses the checked regular PDF and keeps ACE campuses and unavailable years outside its scope', () => {
    expect(record.district).toMatchObject({ id: '227904', slug: 'pflugerville-isd', schoolAgePopulation: 25046 })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027'])
    expect(calendar).toMatchObject({ firstDay: '2026-08-12', lastDay: '2027-05-27', approvedAt: '2025-12-11', publishedAt: null, lastOfficialRevisionAt: null })
    expect(calendar.excludedCampuses).toEqual(['Dessau Elementary School', 'Timmerman Elementary School'])
    expect(calendar.sources[0]!.contentHash).toBe('342f22d9b1fee8b3529d02e2d78e5bdcab61e53c4a97da67ac266f8f9fdea524')
    expect(auditRecords([{ filename: 'pflugerville-isd.json', record }])).toEqual([])
  })

  it('reconciles the published attendance baseline without presenting it as an official total', () => {
    expect(dates(calendar.firstDay!, calendar.lastDay!).filter(weekday)).toHaveLength(207)
    expect([...confirmed].filter(weekday)).toHaveLength(30)
    expect(calendar.conditionalNoSchoolDayEventIds).toHaveLength(2)
    expect(207 - 30 - 2).toBe(175)
    expect(calendar.highlights[0]).toMatchObject({ value: '175 days', basis: 'derived' })
    expect(calendar.highlights[0]!.note).toContain('not an official annual total printed on the PDF')
    expect(calendar.highlights[0]!.note).toContain('may change which dates students attend')
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
    expect(calendar.statistics.find(s => s.id === 'longest-no-school-stretch')!.value).toBe('17 consecutive days')
    expect(calendar.statistics.some(s => s.id === 'early-release-days')).toBe(false)
  })

  it('preserves named break boundaries and verifies every weekday in longer planning spans', () => {
    expect(events.find(e => e.eventType === 'WINTER_BREAK')).toMatchObject({ dateStart: '2026-12-21', dateEnd: '2026-12-31' })
    expect(events.find(e => e.eventType === 'SPRING_BREAK')).toMatchObject({ dateStart: '2027-03-15', dateEnd: '2027-03-20' })
    expect(events.find(e => e.eventType === 'FALL_BREAK')).toMatchObject({ dateStart: '2026-10-12', dateEnd: '2026-10-16' })
    expect(events.filter(e => hasEventType(e, 'GRADING_PERIOD_START')).map(e => e.dateStart)).toEqual(['2026-08-12', '2026-10-19', '2027-01-05', '2027-03-22'])
    expect(events.filter(e => hasEventType(e, 'GRADING_PERIOD_END')).map(e => e.dateStart)).toEqual(['2026-10-08', '2026-12-18', '2027-03-12', '2027-05-27'])
    for (const br of calendar.breaks) {
      const off = dates(br.dateStart, br.dateEnd).filter(weekday)
      expect(off.every(d => confirmed.has(d))).toBe(true)
      expect(off).toHaveLength(br.schoolWeekdaysOff!)
      expect(confirmed.has(br.nextStudentAttendanceDate!)).toBe(false)
      expect(confirmed.has(br.lastStudentAttendanceDate!)).toBe(false)
      expect(['2027-01-18', '2027-03-26'].some(d => d >= br.dateStart && d <= br.dateEnd)).toBe(false)
    }
  })

  it('retains only student-facing PDF events and does not invent April or early-release dates', () => {
    expect(events).toHaveLength(21)
    expect(events.some(e => hasEventType(e, 'EARLY_RELEASE') || hasEventType(e, 'HALF_DAY'))).toBe(false)
    expect(events.some(e => e.dateStart === '2027-04-03' || e.dateStart === '2027-05-28')).toBe(false)
    expect(events.filter(e => e.dateStart! < calendar.firstDay!).map(e => e.eventType)).toEqual(['MEET_THE_TEACHER'])
    expect(events.filter(e => e.dateStart! > calendar.lastDay!)).toEqual([])
    expect(events.every(e => e.schoolStatus !== 'staff-only')).toBe(true)
    expect(calendar.schoolHours).toHaveLength(3)
    expect(JSON.stringify(calendar.schoolHours)).not.toMatch(/earlyReleaseTime|earlyReleaseHours/)
  })

  it('shows weather dates as conditional in the event table, month grid and countdown', async () => {
    for (const date of ['2027-01-18', '2027-03-26']) {
      const e = events.find(e => e.dateStart === date)!
      expect(e).toMatchObject({ schoolStatus: 'no-classes', mayBecomeAttendanceDay: true, scheduledAsNoSchool: true, countsAsStudentAttendanceDayUnderPublishedSchedule: false })
      expect(hasEventType(e, 'WEATHER_DAY')).toBe(true)
      expect(hasEventType(e, 'HOLIDAY')).toBe(true)
      expect(confirmed.has(date)).toBe(false)
      const table = mount(CalendarEventsTable, { props: { events: [e], districtName: 'Pflugerville ISD', schoolYear: '2026-2027' } })
      expect(table.find('.badge--conditional').exists()).toBe(true)
      expect(table.find('.badge--closed').exists()).toBe(false)
      expect(table.find('.badge--conditional').text()).toBe('Scheduled holiday; may become a school day')
      table.unmount()
      const month = mount(MonthlyCalendar, { props: { events, districtName: 'Pflugerville ISD', firstDay: calendar.firstDay, lastDay: calendar.lastDay } })
      expect(month.find(`time[datetime="${date}"]`).element.closest('td')!.className).toContain('conditional')
      month.unmount()
      vi.useFakeTimers()
      vi.setSystemTime(new Date(date + 'T18:00:00Z'))
      const countdown = mount(CalendarBreakCountdown, { props: { events } })
      await countdown.vm.$nextTick()
      expect(countdown.text()).not.toContain('No school today')
      countdown.unmount()
      vi.useRealTimers()
    }
  })

  it('renders distinct FAQs with the correct attendance caveats', () => {
    expect(calendar.faqs).toHaveLength(38)
    expect(new Set(calendar.faqs.map(f => f.question)).size).toBe(38)
    const faq = (term: string) => calendar.faqs.find(f => f.question.includes(term))!
    expect(faq('Martin Luther').answer).toContain('first date reserved')
    expect(faq('Good Friday').answer).toContain('second reserved')
    expect(faq('Easter Monday').answer).toContain('not marked as a student holiday')
    expect(faq('Election Day').answer).toMatch(/^Yes, under the published regular calendar\./)
    expect(faq('early-release days').answer).toMatch(/^No early-release days/)
    expect(faq('Presidents Day').answer).toMatch(/^No\./)
    expect(faq('October 9').answer).toMatch(/^No\./)
    expect(faq('weather closures change').answer).toContain('more than two days')
    expect(faq('weather closures change').answer).toContain('Texas Education Agency')
    expect(faq('morning Pre-K').answer).toMatch(/^No\./)
    expect(faq('morning Pre-K').answer).toContain('will not be offered when school starts late')
    expect(calendar.faqs.some(f => /longest continuous break|weekdays are definitely off|report-card and UIL/.test(f.question))).toBe(false)
    expect(calendar.relatedResources.some(r => r.label === 'PfISD Grade Report Days')).toBe(true)
    expect(calendar.relatedResources.some(r => r.label === 'PfISD Athletics and Eligibility Calendar')).toBe(true)
    const component = mount(CalendarFaq, { props: { items: calendar.faqs } })
    expect(component.findAll('details')).toHaveLength(38)
    expect(component.findAll('details').filter(d => d.attributes('open') !== undefined)).toHaveLength(2)
    component.unmount()
  })

  it('gives concrete ACE dates without adding campus attendance to regular events or statistics', () => {
    const answers = calendar.faqs.map(f => f.answer).join(' ')
    expect(answers).toContain('Tuesday, August 4, 2026')
    expect(answers).toContain('Friday, July 31')
    expect(answers).toContain('7:25–11:30 a.m.')
    expect(calendar.sources.filter(s => s.type === 'official-pdf' && /ACE Campus Calendar/.test(s.label))).toHaveLength(2)
    expect(calendar.sourceDiscrepancies?.find(d => d.field === 'campusScope.firstDay')?.effect).toContain('campus-specific PDFs take precedence')
    expect(events.some(e => ['2026-07-31', '2026-08-04', '2026-08-07'].includes(e.dateStart!))).toBe(false)
    expect(calendar.statistics.find(s => s.id === 'student-attendance-days')!.value).toBe('175 days')
  })

  it('keeps the instructional semester boundary derived and separate from administrative deadlines', () => {
    const end = events.find(e => e.id.endsWith('second-grading-period-end'))!
    expect(end.dateStart).toBe('2026-12-18')
    expect(end.eventTypesBasis?.SEMESTER_END).toBe('derived')
    expect(calendar.about.processing).toContain('second-period row label runs through January 4')
    const month = mount(MonthlyCalendar, { props: { events, districtName: 'Pflugerville ISD', firstDay: calendar.firstDay, lastDay: calendar.lastDay } })
    expect(month.find('#month-day-tooltip-2026-12-18').text()).toContain('December 18 is a full school day. Students return January 5 after winter holidays.')
    month.unmount()
  })

  it('keeps derived holiday names separate from the PDF’s official labels', () => {
    const holidays = events.filter(e => e.displayName)
    expect(holidays).toHaveLength(4)
    for (const holiday of holidays) {
      expect(holiday.displayNameBasis).toBe('derived')
      expect(holiday.displayNameSourceId).toBeUndefined()
      expect(holiday.sourceId).toBe('pflugerville-2026-2027-calendar-pdf')
      expect(holiday.officialLabel).toMatch(/Student|Staff/)
    }
  })

  it('renders one school-year H1 and all 38 visible FAQ entries in the calendar page', () => {
    const page = mount(DistrictCalendarPage, {
      props: { district: record.district, calendar, calendars: [calendar], relatedResources: [], otherDistricts: [], nearbyDistricts: [] },
      global: { stubs: { LazyMonthlyCalendar: true } },
    })
    expect(page.findAll('h1')).toHaveLength(1)
    expect(page.find('h1').text()).toBe(calendar.hero.heading)
    expect(page.findAll('#faq details')).toHaveLength(38)
    page.unmount()
  })

  it('distinguishes five camp dates from the longer student break and traces notes to the right sources', () => {
    const campIndex = calendar.faqs.findIndex(f => f.question === 'Is childcare available during Pflugerville ISD Fall Break in 2026?')
    expect(campIndex).toBe(8)
    const [camp, cost, coverage] = calendar.faqs.slice(campIndex, campIndex + 3)
    expect(camp!.answer).toContain('Ruth Barron Elementary was limited to Raising Travis County Families')
    expect(camp!.answer).toContain('published registration deadline was September 25, 2026')
    expect(cost!.question).toContain('cost')
    expect(cost!.answer).toContain('$185 for all five days per camper')
    expect(cost!.answer).toContain('$35 per-family registration fee')
    expect(coverage!.question).toContain('October 9, 2026 student holiday')
    expect(coverage!.answer).toContain('does not establish whether other childcare is available')
    const prefix = 'pflugerville-2026-2027-'
    const event = (suffix: string) => events.find(e => e.id === prefix + suffix)!
    expect(event('fall-break').noteSourceIds).toEqual([prefix + 'calendar-pdf', prefix + 'october-break-camp'])
    expect(event('meet-the-teacher').noteSourceIds).toEqual([prefix + 'calendar-pdf', prefix + 'dessau-ace-calendar', prefix + 'timmerman-ace-calendar'])
    expect(event('second-grading-period-end').noteSourceIds).toEqual([prefix + 'calendar-pdf'])
    expect(events.some(e => /camp/i.test(e.name))).toBe(false)
  })

  it('exports one occurrence per event, conditional warnings and exclusive range ends', () => {
    const ics = readFileSync('test/fixtures' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r\n /g, '')
    expect((ics.match(/BEGIN:VEVENT/g) || [])).toHaveLength(21)
    for (const e of events) {
      const block = ics.split('BEGIN:VEVENT').find(b => b.includes('UID:' + e.id + '@'))!
      const end = new Date((e.dateEnd || e.dateStart) + 'T00:00:00Z')
      end.setUTCDate(end.getUTCDate() + 1)
      expect(block).toContain('DTEND;VALUE=DATE:' + end.toISOString().slice(0, 10).replaceAll('-', ''))
      if (e.mayBecomeAttendanceDay) {
        expect(block).toContain('Scheduled holiday\\; may become a school day')
        expect(block).not.toContain('attendance may change')
        expect(block).not.toContain('School status: no classes')
      }
    }
  })
})
