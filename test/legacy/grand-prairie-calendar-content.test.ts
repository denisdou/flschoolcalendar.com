import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import CalendarEventsTable from '../../app/components/calendar/CalendarEventsTable.vue'
import CalendarBreakCountdown from '../../app/components/calendar/CalendarBreakCountdown.vue'
import MonthlyCalendar from '../../app/components/calendar/MonthlyCalendar.vue'
import CalendarBellTimes from '../../app/components/calendar/CalendarBellTimes.vue'
import raw from '../fixtures/districts/grand-prairie-isd.json'
import type { DistrictRecord } from '../../shared/types/content'
import { buildDistrictCatalog } from '../../shared/utils/districts'
// @ts-ignore Offline content validator.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Offline statistics generator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'

const record = raw as unknown as DistrictRecord
const dates = (start: string, end = start) => {
  const result: string[] = []
  for (const date = new Date(start + 'T00:00:00Z'); date <= new Date(end + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() + 1)) result.push(date.toISOString().slice(0, 10))
  return result
}
const weekday = (date: string) => new Date(date + 'T00:00:00Z').getUTCDay() % 6 !== 0

describe('Grand Prairie ISD approved student calendars', () => {
  afterEach(() => vi.useRealTimers())

  it('publishes only the two supplied calendars and uses the correct Grand Prairie entity', () => {
    expect(record.district).toMatchObject({ id: '057910', slug: 'grand-prairie-isd', countySlug: 'dallas-county', regionSlug: 'region-10' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027', '2027-2028'])
    expect(auditRecords([{ filename: 'grand-prairie-isd.json', record }])).toEqual([])
    expect(buildDistrictCatalog([record]).districts[0]!.calendarPages.map(page => page.href).sort()).toEqual(['/grand-prairie-isd/2026-2027/', '/grand-prairie-isd/2027-2028/'])
  })

  for (const [key, first, last, weather, count] of [
    ['2026-2027', '2026-08-11', '2027-05-27', '2027-04-19', 33],
    ['2027-2028', '2027-08-10', '2028-05-25', '2028-04-17', 34],
  ] as const) {
    const calendar = record.schoolYears[key]!
    const events = calendar.events
    const event = (suffix: string) => events.find(e => e.id.endsWith('-' + suffix))!
    const confirmed = new Set(events.filter(e => calendar.confirmedNoSchoolDayEventIds!.includes(e.id)).flatMap(e => dates(e.dateStart!, e.dateEnd || e.dateStart!)))

    describe(key, () => {
      it('preserves printed approval without inventing a publication or revision date', () => {
        expect(calendar).toMatchObject({ approvedAt: '2025-12-11', publishedAt: null, lastOfficialRevisionAt: null, verifiedAt: '2026-10-13', firstDay: first, lastDay: last })
        expect(calendar.sources[0]).toMatchObject({ printedBoardApprovalDate: '2025-12-11', retrievedAt: '2026-10-13' })
        expect(calendar.sources[0]!.contentHash).toBe(key === '2026-2027' ? '06e020640568d8b87db6896f903244c221fb87cefd0d6a93f18f56ead8a02216' : '67bbd269e6969c4f807e3e1bb3c14fee2a60e3fc0d962ddfa59d497aa3c19b01')
        expect(calendar.seo.title).toContain('Grand Prairie ISD Calendar ' + key)
        expect(calendar.seo.title.length).toBeLessThanOrEqual(60)
        expect(calendar.seo.description.length).toBeLessThanOrEqual(160)
      })

      it('reconciles every printed period count and the official 175-day total', () => {
        expect(dates(first, last).filter(weekday)).toHaveLength(208)
        expect([...confirmed].filter(weekday)).toHaveLength(32)
        expect(208 - [...confirmed].filter(weekday).length - 1).toBe(175)
        expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
        expect(calendar.statistics.find(s => s.id === 'student-attendance-days')).toMatchObject({ value: '175 days', basis: 'official' })
        const starts = events.filter(e => hasEventType(e, 'GRADING_PERIOD_START')).map(e => e.dateStart!)
        const ends = events.filter(e => hasEventType(e, 'GRADING_PERIOD_END')).map(e => e.dateStart!)
        expect(starts).toEqual(key === '2026-2027' ? ['2026-08-11', '2026-10-14', '2027-01-06', '2027-03-22'] : ['2027-08-10', '2027-10-13', '2028-01-05', '2028-03-20'])
        expect(ends).toEqual(key === '2026-2027' ? ['2026-10-08', '2026-12-18', '2027-03-11', '2027-05-27'] : ['2027-10-07', '2027-12-17', '2028-03-09', '2028-05-25'])
        expect(starts.map((start, i) => dates(start, ends[i]!).filter(d => weekday(d) && !confirmed.has(d) && d !== weather).length)).toEqual([42, 41, 45, 47])
      })

      it('proves every weekday inside each continuous family break is confirmed off', () => {
        for (const br of calendar.breaks) {
          const off = dates(br.dateStart, br.dateEnd).filter(weekday)
          expect(off.every(date => confirmed.has(date))).toBe(true)
          expect(off).toHaveLength(br.schoolWeekdaysOff!)
          expect(confirmed.has(br.lastStudentAttendanceDate!)).toBe(false)
          expect(confirmed.has(br.nextStudentAttendanceDate!)).toBe(false)
          expect(br.componentEventIds!.every(id => calendar.confirmedNoSchoolDayEventIds!.includes(id))).toBe(true)
          expect(br.componentEventIds).not.toContain(event('inclement-weather-day').id)
        }
        const fall = event('fall-break')
        expect(dates(fall.dateStart!, fall.dateEnd!)).toHaveLength(5)
        expect(dates(fall.dateStart!, fall.dateEnd!).filter(weekday)).toHaveLength(3)
        expect(event('indigenous-peoples-day').coveredByBreakEventId).toBe(fall.id)
        expect(calendar.statistics.find(s => s.id === 'longest-no-school-stretch')!.value).toBe('18 consecutive days')
        expect(calendar.statistics.find(s => s.id === 'full-week-breaks')!.value).toBe('3 breaks')
      })

      it('keeps January staff holidays outside the official named Winter Break', () => {
        expect(event('winter-break')).toMatchObject(key === '2026-2027'
          ? { dateStart: '2026-12-21', dateEnd: '2027-01-01', dateBasis: 'derived' }
          : { dateStart: '2027-12-20', dateEnd: '2027-12-31', dateBasis: 'official' })
        expect(event('staff-day-3').dateStart).toBe(key === '2026-2027' ? '2027-01-04' : '2028-01-03')
        expect(event('staff-day-4').dateStart).toBe(key === '2026-2027' ? '2027-01-05' : '2028-01-04')
        expect(calendar.statistics.find(s => s.id === 'student-no-school-days')).toMatchObject({ label: 'Other No-School Weekdays', value: '7 days' })
      })

      it('keeps the reserved weather day conditional in data, table, monthly calendar and countdown', async () => {
        const reserved = event('inclement-weather-day')
        expect(reserved).toMatchObject({ dateStart: weather, scheduledAsNoSchool: true, countsAsStudentAttendanceDayUnderPublishedSchedule: false, mayBecomeAttendanceDay: true, schoolStatusLabel: 'Reserved weather day — attendance subject to district confirmation.' })
        expect(reserved.countsAsStudentAttendanceDay).toBeUndefined()
        expect(calendar.conditionalNoSchoolDayEventIds).toEqual([reserved.id])
        expect(confirmed.has(weather)).toBe(false)
        const table = mount(CalendarEventsTable, { props: { events: [reserved], districtName: 'Grand Prairie ISD', schoolYear: key } })
        expect(table.findAll('.badge--conditional')).toHaveLength(1)
        expect(table.text()).toContain('attendance subject to district confirmation')
        expect(table.findAll('.badge--closed')).toHaveLength(0)
        table.unmount()
        const monthly = mount(MonthlyCalendar, { props: { events, districtName: 'Grand Prairie ISD', firstDay: first, lastDay: last } })
        const cell = monthly.find(`time[datetime="${weather}"]`).element.closest('td')!
        expect(cell.className).toContain('conditional')
        monthly.unmount()
        vi.useFakeTimers()
        vi.setSystemTime(new Date(weather + 'T18:00:00Z'))
        const countdown = mount(CalendarBreakCountdown, { props: { events } })
        await countdown.vm.$nextTick()
        expect(countdown.text()).not.toContain('No school today')
        expect(countdown.text()).not.toContain('Inclement Weather Day')
        countdown.unmount()
      })

      it('combines grading meanings once and excludes unrelated staff and post-year events', () => {
        expect(events).toHaveLength(23)
        expect(new Set(events.map(e => e.id)).size).toBe(23)
        expect(events.map(e => e.dateStart)).toEqual(events.map(e => e.dateStart).toSorted())
        expect(events.every(e => e.dateStart! >= first && (e.dateEnd || e.dateStart!) <= last)).toBe(true)
        expect(events.filter(e => e.eventType === 'NON_STUDENT_DAY')).toHaveLength(7)
        for (const suffix of ['february-non-school-day', 'spring-non-school-day']) {
          expect(event(suffix)).toMatchObject({ eventType: 'NON_STUDENT_DAY', name: 'No School', officialLabel: 'Non-school Day', nameBasis: 'derived' })
        }
        const staff = events.filter(e => /-staff-day-[1-5]$/.test(e.id))
        expect(staff).toHaveLength(5)
        expect(staff.every(e => e.name.startsWith('No School — ') && e.officialLabel!.includes('No Students') && e.nameBasis === 'derived')).toBe(true)
        expect(event('staff-day-2').name).toBe('No School — AM Professional Development / PM Teacher Workday')
        expect(events.some(e => e.schoolStatus === 'staff-only' || /Vector Solutions|Unified Closure|Juneteenth|New Teacher/.test(e.name))).toBe(false)
        expect(events.filter(e => e.dateStart === last)).toHaveLength(1)
        expect(hasEventType(event('last-day'), 'LAST_DAY')).toBe(true)
        expect(hasEventType(event('last-day'), 'GRADING_PERIOD_END')).toBe(true)
        expect(hasEventType(event('last-day'), 'SEMESTER_END')).toBe(true)
        expect(events.some(e => hasEventType(e, 'EARLY_RELEASE') || hasEventType(e, 'STATE_TEST'))).toBe(false)
        expect(event('first-nine-weeks-end').nameBasis).toBe('derived')
        expect(event('second-nine-weeks-start').nameBasis).toBe('derived')
      })

      it('answers distinct parent questions without promising unpublished exam or ceremony schedules', () => {
        expect(calendar.faqs).toHaveLength(count)
        expect(new Set(calendar.faqs.map(f => f.question)).size).toBe(count)
        expect(calendar.faqs.find(f => f.question.includes('Election Day'))!.answer).toMatch(/^No\./)
        expect(calendar.faqs.find(f => f.question.includes('Veterans Day'))!.answer).toContain('Regular student classes are scheduled')
        expect(calendar.faqs.find(f => f.question.includes('Good Friday'))!.answer).toMatch(/^No\./)
        expect(calendar.faqs.find(f => f.question.includes('early-release'))!.answer).toContain('does not list early-release')
        expect(calendar.faqs.find(f => f.question.includes('graduation'))!.answer).toContain('does not list graduation ceremonies')
        expect(calendar.faqs.find(f => f.question.includes('STAAR'))!.answer).toContain('does not list STAAR, TELPAS or final-exam dates')
        expect(calendar.faqs.find(f => f.question.includes('weather closure'))!.answer).toContain('5 a.m.')
        expect(calendar.faqs.find(f => f.question.includes('Spanish version'))!.answer).toContain('Spanish-language PDF')
        expect(calendar.faqs.find(f => f.question.includes('How long'))!.answer).toContain('18 consecutive calendar days')
        expect(calendar.relatedResources.some(r => r.label.includes('calendar in Spanish'))).toBe(true)
        expect(calendar.sources.find(s => s.id === 'grand-prairie-school-hours')!.url).toBe('https://www.gpisd.org/about-gpisd/school-hours')
        expect(JSON.stringify([calendar.hero, calendar.editorialSummary, calendar.faqs])).not.toMatch(/stored as|this route|comprehensive|stay informed|source was supplied|with no weekend sessions shown/i)
      })

      it('exports every canonical occurrence once with exclusive range end dates', () => {
        const ics = readFileSync(`test/fixtures/ics/grand-prairie-isd-${key}.ics`, 'utf8')
        expect((ics.match(/BEGIN:VEVENT/g) || [])).toHaveLength(23)
        expect(ics).not.toContain('Vector Solutions')
        expect(ics).not.toContain('Juneteenth')
        expect(ics).toContain('Inclement Weather Day')
        const unfolded = ics.replace(/\r\n /g, '')
        const reserved = unfolded.split('BEGIN:VEVENT').find(e => e.includes('UID:' + event('inclement-weather-day').id))!
        expect(reserved).toContain('School status: Reserved weather day — attendance subject to district confirmation.')
        expect(reserved).not.toContain('School status: no-classes')
        expect(reserved).not.toContain('School status: no classes')
        for (const e of events.filter(e => e.dateEnd)) {
          const block = unfolded.split('BEGIN:VEVENT').find(item => item.includes('UID:' + e.id))!
          const exclusive = new Date(e.dateEnd! + 'T00:00:00Z')
          exclusive.setUTCDate(exclusive.getUTCDate() + 1)
          expect(block).toContain('DTEND;VALUE=DATE:' + exclusive.toISOString().slice(0, 10).replaceAll('-', ''))
        }
        expect(unfolded).toContain('SUMMARY:No School — Staff Development')
        const expected = key === '2026-2027' ? ['DTSTART;VALUE=DATE:20261009', 'DTEND;VALUE=DATE:20261014'] : ['DTSTART;VALUE=DATE:20271008', 'DTEND;VALUE=DATE:20271013']
        expect(expected.every(line => ics.includes(line))).toBe(true)
      })
    })
  }

  it('distinguishes future Presidents’ Day attendance and Easter Monday weather activation', () => {
    const current = record.schoolYears['2026-2027']!
    const future = record.schoolYears['2027-2028']!
    expect(current.faqs.find(f => f.question.includes("Presidents' Day"))!.answer).toMatch(/^No\./)
    expect(future.faqs.find(f => f.question.includes("Presidents' Day"))!.answer).toContain('Monday, February 21, 2028')
    expect(future.events.some(e => e.dateStart === '2028-02-21' && e.schoolStatus === 'no-classes')).toBe(false)
    expect(current.faqs.find(f => f.question.includes('Easter Monday'))!.answer).toMatch(/^Yes\./)
    expect(future.faqs.some(f => f.question.includes('Easter Monday'))).toBe(false)
    expect(future.faqs.find(f => f.question.includes('four-day weekend April'))!.answer).toMatch(/^Not necessarily\./)
    expect(future.faqs.find(f => f.question.includes('four-day weekend April'))!.answer).toContain('may become a make-up school day')
    expect(future.faqs.find(f => f.question.includes("Valentine's Day"))!.answer).toContain('does not identify')
  })

  it('sources current bell times separately and does not project them into 2027-2028', () => {
    const current = record.schoolYears['2026-2027']!
    const future = record.schoolYears['2027-2028']!
    expect(current.schoolHours).toHaveLength(9)
    expect(Array.isArray(current.schoolHours) && current.schoolHours.every(row => row.sourceId === 'grand-prairie-school-hours' && row.basis === 'official')).toBe(true)
    expect(Array.isArray(current.schoolHours) && current.schoolHours.every(row => row.note === 'Current hours listed by GPISD; confirm the campus schedule for the 2026-2027 school year.')).toBe(true)
    const bellTimes = mount(CalendarBellTimes, { props: { hours: current.schoolHours, sources: current.sources, heading: 'GPISD school hours' } })
    expect(bellTimes.findAll('.calendar-bell-times-note')).toHaveLength(1)
    expect(bellTimes.findAll('.calendar-bell-times-shared-note')).toHaveLength(1)
    expect(bellTimes.find('.calendar-bell-times-list').text()).not.toContain('Current hours listed by GPISD')
    expect(bellTimes.text()).toContain('confirm the campus schedule for the 2026-2027 school year')
    bellTimes.unmount()
    expect(future.schoolHours).toBeNull()
    expect(future.faqs.find(f => f.question.includes('start and dismissal'))!.answer).toContain('rather than assuming the current hours will carry forward')
    expect(current.sourceDiscrepancies![0]).toMatchObject({ gridDate: '2027-06-17', captionDate: '2027-06-19', resolution: 'unresolved' })
  })
})
