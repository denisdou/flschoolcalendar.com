import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import raw from '../fixtures/districts/hays-cisd.json'
import type { DistrictRecord } from '../../shared/types/content'
import CalendarEventsTable from '../../app/components/calendar/CalendarEventsTable.vue'
import MonthlyCalendar from '../../app/components/calendar/MonthlyCalendar.vue'
import CalendarBreakCountdown from '../../app/components/calendar/CalendarBreakCountdown.vue'
import CalendarBellTimes from '../../app/components/calendar/CalendarBellTimes.vue'
import CalendarYearStatistics from '../../app/components/calendar/CalendarYearStatistics.vue'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore Offline validator.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Offline statistic calculation.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = raw as unknown as DistrictRecord
function dates(start: string, end = start) {
  const out: string[] = []
  for (const date = new Date(start + 'T00:00:00Z'); date <= new Date(end + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() + 1)) out.push(date.toISOString().slice(0, 10))
  return out
}
const weekday = (date: string) => ![0, 6].includes(new Date(date + 'T00:00:00Z').getUTCDay())

describe('Hays CISD two-page adopted calendars', () => {
  afterEach(() => vi.useRealTimers())

  it('uses the correct entity and publishes only the supplied school years', () => {
    expect(record.district).toMatchObject({ id: '105906', slug: 'hays-cisd', countySlug: 'hays-county', regionSlug: 'region-13' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027', '2027-2028'])
    expect(auditRecords([{ filename: 'hays-cisd.json', record }])).toEqual([])
  })

  for (const row of [
    { key: '2026-2027', first: '2026-08-13', last: '2027-05-27', weekdays: 206, off: 35, winter: 19, events: 52, weather: ['2027-02-12', '2027-04-30'], starts: ['2026-08-13', '2026-10-13', '2027-01-06', '2027-03-22'], ends: ['2026-10-08', '2026-12-17', '2027-03-12', '2027-05-27'], periods: [39, 40, 45, 45], cards: ['2026-10-14', '2027-01-12', '2027-03-25', '2027-06-04'] },
    { key: '2027-2028', first: '2027-08-12', last: '2028-05-24', weekdays: 205, off: 34, winter: 20, events: 51, weather: ['2028-02-18', '2028-04-17'], starts: ['2027-08-12', '2027-10-12', '2028-01-06', '2028-03-20'], ends: ['2027-10-07', '2027-12-16', '2028-03-10', '2028-05-24'], periods: [39, 40, 44, 46], cards: ['2027-10-13', '2028-01-12', '2028-03-24', '2028-06-02'] },
  ]) {
    const calendar = record.schoolYears[row.key]!
    const events = calendar.events
    const event = (suffix: string) => events.find(e => e.id === `hays-${row.key}-${suffix}`)!
    const confirmed = new Set(events.filter(e => calendar.confirmedNoSchoolDayEventIds!.includes(e.id)).flatMap(e => dates(e.dateStart!, e.dateEnd || e.dateStart!)))

    describe(row.key, () => {
      it('records adoption separately from publication and addition of the UIL chart', () => {
        expect(calendar).toMatchObject({ firstDay: row.first, lastDay: row.last, approvedAt: '2025-11-17', publishedAt: null, lastOfficialRevisionAt: null, verifiedAt: '2026-10-14' })
        expect(calendar.sources[0]!.contentHash).toBe(row.key === '2026-2027' ? '51648786a5397f8746297ed2f691312206abfc341233b99c9903452bad6c8936' : '9f78a972ea28e7278838c67fdb3263ccf9b5a3207fbbd727398cf1c0910d603b')
        expect(calendar.about.updates).toContain('January 8, 2026')
        expect(calendar.seo.title).toContain('Hays CISD ' + row.key + ' School Calendar')
        expect(calendar.seo.description.length).toBeLessThanOrEqual(160)
      })

      it('independently reconciles 169 attendance dates and the printed 79/90 semester totals', () => {
        expect(dates(row.first, row.last).filter(weekday)).toHaveLength(row.weekdays)
        expect([...confirmed].filter(weekday)).toHaveLength(row.off)
        expect(row.weekdays - row.off - row.weather.length).toBe(169)
        const starts = events.filter(e => hasEventType(e, 'GRADING_PERIOD_START')).map(e => e.dateStart)
        const ends = events.filter(e => hasEventType(e, 'GRADING_PERIOD_END')).map(e => e.dateStart)
        expect(starts).toEqual(row.starts)
        expect(ends).toEqual(row.ends)
        const actual = row.starts.map((start, i) => dates(start, row.ends[i]!).filter(d => weekday(d) && !confirmed.has(d) && !row.weather.includes(d)).length)
        expect(actual).toEqual(row.periods)
        expect(actual[0]! + actual[1]!).toBe(79)
        expect(actual[2]! + actual[3]!).toBe(90)
        expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
        expect(calendar.statistics[0]).toMatchObject({ value: '169 days', basis: 'official' })
        expect(calendar.statistics.some(s => s.id === 'student-no-school-days')).toBe(false)
        const shortened = calendar.statistics.find(s => s.id === 'early-release-days')!
        expect(shortened.value).toBe('6 dates')
        expect(shortened.explanation).toContain('High schools have six')
        expect(shortened.explanation).toContain('middle schools have two')
        expect(shortened.explanation).toContain('elementary schools have none')
        const statistics = mount(CalendarYearStatistics, { props: { calendar } })
        expect(statistics.text()).toContain(calendar.earlyReleaseStatisticExplanation)
        statistics.unmount()
        expect(calendar.keyDates.map(d => d.dateStart)).toEqual(calendar.keyDates.map(d => d.dateStart).toSorted())
      })

      it('proves continuous breaks without bridging a conditional weather date', () => {
        for (const br of calendar.breaks) {
          const weekdays = dates(br.dateStart, br.dateEnd).filter(weekday)
          expect(weekdays.every(d => confirmed.has(d))).toBe(true)
          expect(weekdays).toHaveLength(br.schoolWeekdaysOff!)
          expect(br.componentEventIds!.every(id => calendar.confirmedNoSchoolDayEventIds!.includes(id))).toBe(true)
          expect(confirmed.has(br.nextStudentAttendanceDate!)).toBe(false)
          expect(confirmed.has(br.lastStudentAttendanceDate!)).toBe(false)
          expect(row.weather.some(d => d >= br.dateStart && d <= br.dateEnd)).toBe(false)
        }
        expect(calendar.statistics.find(s => s.id === 'longest-no-school-stretch')!.value).toBe(row.winter + ' consecutive days')
        expect(event('third-grading-period-start').dateStart).toBe(row.key === '2026-2027' ? '2027-01-06' : '2028-01-06')
        expect(event('winter-holidays').dateBasis).toBe(row.key === '2026-2027' ? 'derived' : 'official')
      })

      it('retains both weather-day meanings without presenting confirmed no-school badges or countdowns', async () => {
        expect(calendar.conditionalNoSchoolDayEventIds).toHaveLength(2)
        for (const suffix of ['weather-day-1', 'weather-day-2']) {
          const reserved = event(suffix)
          expect(hasEventType(reserved, 'WEATHER_DAY')).toBe(true)
          expect(hasEventType(reserved, 'NON_STUDENT_DAY')).toBe(true)
          expect(reserved).toMatchObject({ schoolStatus: 'no-classes', scheduledAsNoSchool: true, mayBecomeAttendanceDay: true, countsAsStudentAttendanceDayUnderPublishedSchedule: false })
          expect(reserved.countsAsStudentAttendanceDay).toBeUndefined()
          expect(confirmed.has(reserved.dateStart!)).toBe(false)
          const table = mount(CalendarEventsTable, { props: { events: [reserved], districtName: 'Hays CISD', schoolYear: row.key } })
          expect(table.findAll('.badge--conditional')).toHaveLength(1)
          expect(table.find('.badge--closed').exists()).toBe(false)
          table.unmount()
          const month = mount(MonthlyCalendar, { props: { events, districtName: 'Hays CISD', firstDay: row.first, lastDay: row.last } })
          const cell = month.find(`time[datetime="${reserved.dateStart}"]`).element.closest('td')!
          expect(cell.className).toContain('conditional')
          month.unmount()
          vi.useFakeTimers()
          vi.setSystemTime(new Date(reserved.dateStart + 'T18:00:00Z'))
          const countdown = mount(CalendarBreakCountdown, { props: { events } })
          await countdown.vm.$nextTick()
          expect(countdown.text()).not.toContain('No school today')
          expect(countdown.text()).not.toContain('Weather Make-up')
          countdown.unmount()
          vi.useRealTimers()
        }
      })

      it('keeps six high-school and two middle-school release dates separate from elementary hours', () => {
        const highOnly = events.filter(e => hasEventType(e, 'FINAL_EXAM'))
        expect(highOnly).toHaveLength(2)
        expect(highOnly.every(e => e.gradeScope === 'High school only')).toBe(true)
        expect(highOnly.flatMap(e => dates(e.dateStart!, e.dateEnd!))).toHaveLength(4)
        expect(events.filter(e => hasEventType(e, 'EARLY_RELEASE')).flatMap(e => dates(e.dateStart!, e.dateEnd || e.dateStart!))).toHaveLength(6)
        expect(event('last-day').scheduleScope).toContain('regular elementary schedule')
        expect(event('december-secondary-early-release').scheduleScope).toContain('grades 6–12')
        const bell = mount(CalendarBellTimes, { props: { hours: calendar.schoolHours, sources: calendar.sources, heading: 'Hays CISD bell times' } })
        const rows = bell.findAll('.calendar-bell-times-row')
        expect(rows).toHaveLength(3)
        expect(rows[0]!.text()).toContain('No elementary early-release')
        expect(rows[0]!.text()).not.toContain('1:00 p.m.')
        expect(rows[1]!.text()).toContain('8:10 a.m.–2:00 p.m.')
        expect(rows[2]!.text()).toContain('8:55 a.m.–1:00 p.m.')
        bell.unmount()
      })

      it('retains student-facing report and UIL milestones but not teacher grade-entry deadlines', () => {
        expect(events.filter(e => e.eventType === 'REPORT_CARD').map(e => e.dateStart)).toEqual(row.cards)
        const reports = events.filter(e => e.id.includes('-report-issued-'))
        expect(reports).toHaveLength(12)
        expect(reports.every(e => e.gradeScope === 'Grades 6–12 only' && e.schoolStatus === 'not-applicable')).toBe(true)
        const eligibility = events.filter(e => e.id.includes('-uil-eligibility-'))
        expect(eligibility).toHaveLength(10)
        expect(eligibility.every(e => e.schoolStatus === 'not-applicable')).toBe(true)
        expect(events.filter(e => e.dateStart! > row.last)).toHaveLength(1)
        expect(events.find(e => e.dateStart! > row.last)!.eventType).toBe('REPORT_CARD')
        expect(events.some(e => /grades online|Staff Work Day$|Graduation|Summer School|August Workday/i.test(e.name))).toBe(false)
        expect(events.some(e => e.eventType === 'STATE_TEST' || e.schoolStatus === 'staff-only')).toBe(false)
      })

      it('answers distinct questions with correct yes/no polarity and grade-specific scope', () => {
        const count = 46
        expect(calendar.faqs).toHaveLength(count)
        expect(new Set(calendar.faqs.map(f => f.question)).size).toBe(count)
        const faq = (term: string) => calendar.faqs.find(f => f.question.includes(term))!
        expect(faq('Election Day').answer).toMatch(/^No\./)
        expect(faq('Presidents').answer).toMatch(/^No\./)
        expect(faq('Martin Luther').answer).toMatch(/^Yes\./)
        expect(faq('Veterans').answer).toMatch(/^No\./)
        expect(faq('elementary students').answer).toMatch(/^No\./)
        expect(faq('STAAR').answer).toContain('does not list STAAR')
        expect(faq('STAAR').answer).not.toContain('2027-2028 Assessment Calendar is available')
        expect(faq('graduation').answer).toContain('does not list graduation ceremony')
        if (row.key === '2026-2027') {
          expect(faq('graduation').answer).toContain('Johnson High School on June 1 at 1 p.m.')
          expect(faq('graduation').answer).toContain('Live Oak Academy on June 1 at 6 p.m.')
          expect(faq('graduation').answer).toContain('Hays High School on June 2 at 1 p.m.')
          expect(faq('graduation').answer).toContain('Lehman High School on June 2 at 6 p.m.')
          expect(faq('graduation').answer).toContain('Strahan Arena')
        } else {
          expect(faq('graduation').answer).not.toContain('June 1')
        }
        expect(faq('report cards issued').answer).toContain('do not represent the elementary report-card schedule')
        expect(faq('How long').answer).toContain(row.winter + ' consecutive calendar days')
        expect(faq('Fall Break').answer).toContain(row.key === '2026-2027' ? 'October 30–November 3' : 'October 29–November 2')
        expect(faq('Veterans').answer).toContain('honoring veterans')
        expect(faq('officially approved').answer).toContain('November 17, 2025')
        expect(faq('late August').answer).toContain('District of Innovation')
        expect(faq('bell times different').answer).toContain('same buses')
        expect(faq('align with UT Austin').answer).toContain('dual-credit')
        expect(faq('align with UT Austin').answer).toContain(row.key === '2026-2027' ? 'UT Austin lists March 15–20' : 'UT Austin lists March 13–18')
        expect(faq('high school finals').answer).toContain(row.key === '2026-2027' ? 'December 15–16' : 'December 14–15')
        expect(faq('count toward').answer).toMatch(/^Yes\./)
        expect(calendar.editorialSummary.paragraphs).toHaveLength(5)
        expect(faq('staff exchange day').answer).not.toContain('in-year')
        if (row.key === '2027-2028') {
          expect(faq('day after Halloween').answer).toContain('November 1, 2027')
          expect(faq('day after Halloween').answer).toMatch(/^No\./)
          expect(faq('day after Halloween').answer).toContain('Classes resume November 3')
        } else {
          expect(calendar.faqs.some(f => f.question.includes('day after Halloween'))).toBe(false)
        }
        const reservedFaq = faq(row.key === '2026-2027' ? 'February 12' : 'February 18')
        expect(reservedFaq.answer).not.toMatch(/^No/)
        expect(reservedFaq.answer).toContain('may require attendance')
        expect(JSON.stringify([calendar.hero, calendar.editorialSummary, calendar.faqs])).not.toMatch(/stored as|this route|comprehensive|source was supplied|stay informed|school calendar template/i)
      })

      it('tags UIL cutoffs without changing all-student dates or secondary dismissal scope', () => {
        const cutoffs = events.filter(e => e.uilEligibility?.kind === 'cutoff')
        expect(cutoffs).toHaveLength(5)
        expect(cutoffs.map(e => e.dateStart).toSorted()).toEqual([
          event('six-week-uil-cutoff').dateStart, ...row.ends,
        ].toSorted())
        for (const e of cutoffs) {
          expect(hasEventType(e, 'SCHOOL_MILESTONE')).toBe(true)
          expect(e.uilEligibility).toMatchObject({ gradeScope: 'Grades 6–12 only', sourceId: calendar.sources[0]!.id, basis: 'official' })
        }
        expect(event('last-day').gradeScope).toBeUndefined()
        expect(event('last-day').scheduleScope).toContain('regular elementary schedule')
        expect(events.filter(e => e.uilEligibility?.kind === 'eligibility-change')).toHaveLength(10)
        const regain = events.filter(e => e.officialLabel === 'Regain')
        expect(regain).toHaveLength(6)
        expect(regain.every(e => e.name === 'UIL Eligibility Regain Date — Grades 6–12')).toBe(true)
        expect(events.every(e => hasEventType(e, e.eventType))).toBe(true)
        const overlapDate = row.key === '2026-2027' ? '2027-03-29' : '2028-04-14'
        const table = mount(CalendarEventsTable, { props: { events: events.filter(e => e.dateStart === overlapDate), districtName: 'Hays CISD', schoolYear: row.key } })
        expect(table.findAll('tbody tr')).toHaveLength(1)
        expect(table.text()).toContain('No classes')
        expect(table.text()).toContain('UIL milestone — grades 6–12')
        table.unmount()
      })

      it('rejects a UIL milestone with an unknown source', () => {
        const invalid = structuredClone(record)
        const cutoff = invalid.schoolYears[row.key]!.events.find(e => e.uilEligibility?.kind === 'cutoff')!
        cutoff.uilEligibility!.sourceId = 'not-a-published-source'
        expect(auditRecords([{ filename: 'hays-cisd.json', record: invalid }]).some((issue: { code: string }) => issue.code === 'INVALID_UIL_ELIGIBILITY')).toBe(true)
      })

      it('exports canonical events once, scoped dismissal times and exclusive multi-day ends', () => {
        expect(events).toHaveLength(row.events)
        expect(new Set(events.map(e => e.id)).size).toBe(row.events)
        expect(events.map(e => e.dateStart)).toEqual(events.map(e => e.dateStart).toSorted())
        const ics = readFileSync('test/fixtures' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r\n /g, '')
        expect((ics.match(/BEGIN:VEVENT/g) || [])).toHaveLength(row.events)
        for (const e of events) {
          const block = ics.split('BEGIN:VEVENT').find(b => b.includes('UID:' + e.id + '@'))!
          const end = new Date((e.dateEnd || e.dateStart) + 'T00:00:00Z')
          end.setUTCDate(end.getUTCDate() + 1)
          expect(block).toContain('DTEND;VALUE=DATE:' + end.toISOString().slice(0, 10).replaceAll('-', ''))
          if (e.mayBecomeAttendanceDay) {
            expect(block).toContain('attendance subject to district confirmation')
            expect(block).not.toContain('School status: no classes')
          }
        }
        expect(ics).toContain('Middle schools dismiss at 2 p.m.')
        expect(ics).toContain('high schools at 1 p.m.')
      })
    })
  }

  it('preserves the different spring attendance sequences and final reporting dates', () => {
    const current = record.schoolYears['2026-2027']!, future = record.schoolYears['2027-2028']!
    expect(current.events.find(e => e.id.endsWith('march-workday'))!.dateStart).toBe('2027-03-29')
    expect(current.events.find(e => e.id.endsWith('may-holiday'))!.dateStart).toBe('2027-05-03')
    expect(future.events.some(e => e.id.endsWith('march-workday') || e.id.endsWith('may-holiday'))).toBe(false)
    expect(future.events.find(e => e.id.endsWith('january-holiday'))!.dateStart).toBe('2028-01-03')
    expect(future.events.find(e => e.id.endsWith('weather-day-2'))!.dateStart).toBe('2028-04-17')
    expect(current.faqs.find(f => f.question.includes('Easter Monday'))!.answer).toContain('Tuesday, March 30')
    expect(future.faqs.find(f => f.question.includes('Easter Monday'))!.answer).toContain('not a guaranteed day off')
  })
})
