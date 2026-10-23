import { readFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CalendarEventsTable from '../../app/components/calendar/CalendarEventsTable.vue'
import MonthlyCalendar from '../../app/components/calendar/MonthlyCalendar.vue'
import type { DistrictCalendar, DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/hillsborough-county-public-schools.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord
const first = record.schoolYears['2026-2027']!
const second = record.schoolYears['2027-2028']!
const event = (calendar: DistrictCalendar, key: string) => calendar.events.find(e => e.id === `hillsborough-${calendar.schoolYear}-${key}`)!
function weekdays(start: string, end: string) {
  const dates: string[] = []
  for (const day = new Date(start + 'T00:00:00Z'); day <= new Date(end + 'T00:00:00Z'); day.setUTCDate(day.getUTCDate() + 1)) {
    if (![0, 6].includes(day.getUTCDay())) dates.push(day.toISOString().slice(0, 10))
  }
  return dates
}
function datesFor(calendar: DistrictCalendar, ids: string[]) {
  return new Set(ids.flatMap(id => {
    const e = calendar.events.find(e => e.id === id)!
    return weekdays(e.dateStart!, e.dateEnd || e.dateStart!)
  }))
}
function entries(calendar: DistrictCalendar) {
  return readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '').split('BEGIN:VEVENT').slice(1)
}

describe('Hillsborough County Florida calendar interpretation', () => {
  it('separates original approval, printed revision and next-year approval', () => {
    expect(record.district).toMatchObject({ id: 'FL-29', districtNumber: '29', name: 'Hillsborough County Public Schools', timeZone: 'America/New_York', priority: 'P0' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027', '2027-2028'])
    expect(first).toMatchObject({ status: 'revised', approvedAt: '2025-06-17', sourceDocumentUpdatedAt: '2026-03-24', lastOfficialRevisionAt: '2026-03-24', publishedAt: null })
    expect(first.sources[0]).toMatchObject({ printedBoardApprovalDate: '2025-06-17', printedRevisionDate: '2026-03-24', contentHash: 'sha256:747c4e6fd04c6b277e879cd9c438cdeb794ff31459b653800837fcde59b95a31' })
    expect(second).toMatchObject({ status: 'official', approvedAt: '2026-07-14', sourceDocumentUpdatedAt: null, publishedAt: null })
    expect(second.sources[0]).toMatchObject({ printedBoardApprovalDate: '2026-07-14', contentHash: 'sha256:1dbd5674efde0f118c11b09beddbb60f1fdea2d9259236f51ca258e144f436c0' })
    expect(second.sources.some(s => s.url.endsWith('/o/benito/article/3031818') && s.publishedAt === '2026-07-14')).toBe(true)
  })

  it('expands only instructional Mondays and combines first-day and return meanings', () => {
    const closed = new Set([...datesFor(first, first.confirmedNoSchoolDayEventIds!), ...datesFor(first, first.conditionalNoSchoolDayEventIds!)])
    const mondays = weekdays(first.firstDay!, first.lastDay!).filter(d => new Date(d + 'T00:00:00Z').getUTCDay() === 1 && !closed.has(d))
    const shortened = first.events.filter(e => hasEventType(e, 'EARLY_RELEASE')).map(e => e.dateStart)
    expect(mondays).toHaveLength(31)
    expect(shortened).toEqual([...mondays, '2027-05-28'])
    for (const key of ['first-day', 'fall-return']) {
      expect(event(first, key).schoolStatus).toBe('early-dismissal')
      expect(hasEventType(event(first, key), 'EARLY_RELEASE')).toBe(true)
      expect(first.events.filter(e => e.dateStart === event(first, key).dateStart)).toHaveLength(1)
    }
    expect(event(first, 'first-day').eventTypes).toEqual(['FIRST_DAY', 'EARLY_RELEASE'])
    expect(event(first, 'fall-return').eventTypes).toEqual(['SCHOOL_MILESTONE', 'EARLY_RELEASE'])
    const expandedMondays = first.events.filter(e => e.id.startsWith('hillsborough-2026-2027-monday-'))
    expect(expandedMondays).toHaveLength(29)
    for (const monday of expandedMondays) {
      expect(monday).toMatchObject({ nameBasis: 'derived', dateBasis: 'derived', eventTypeBasis: 'official' })
    }
    for (const d of closed) expect(shortened).not.toContain(d)
  })

  it('moves the 2027 festival holiday while retaining March 1 as an instructional Monday', () => {
    expect(event(first, 'strawberry-festival')).toMatchObject({ dateStart: '2027-03-08', schoolStatus: 'no-classes' })
    expect(event(first, 'monday-2027-03-01')).toMatchObject({ eventType: 'EARLY_RELEASE', countsAsStudentAttendanceDay: true, dateBasis: 'derived' })
    expect(first.revisions).toEqual([expect.objectContaining({ changedAt: '2026-03-24', oldValue: '2027-03-01', newValue: '2027-03-08', eventId: event(first, 'strawberry-festival').id })])
    expect(event(second, 'strawberry-festival').dateStart).toBe('2028-03-06')
  })

  it('keeps next-year early release pending and August 16 explicitly full length', () => {
    expect(second.events.filter(e => hasEventType(e, 'EARLY_RELEASE')).map(e => e.dateStart)).toEqual(['2028-05-26'])
    expect(event(second, 'august-full-day')).toMatchObject({ dateStart: '2027-08-16', schoolStatus: 'schools-open', scheduleStatus: 'regular', countsAsStudentAttendanceDay: true, scheduleSourceId: second.sources[0]!.id })
    expect(hasEventType(event(second, 'august-full-day'), 'EARLY_RELEASE')).toBe(false)
    expect(event(second, 'fall-return').schoolStatus).toBe('schools-open')
    expect(second.earlyReleaseStatisticExplanation).toContain('not a complete annual')
    expect(second.schoolHours).toEqual([])
    for (const d of ['2027-10-11', '2027-10-12', '2028-03-29', '2028-04-16']) expect(second.events.some(e => e.dateStart === d)).toBe(false)
  })

  it('retains all six and five tentative hurricane dates without declaring absolute attendance', () => {
    const expectations = [
      { calendar: first, dates: ['2026-10-12', '2026-11-11', '2026-11-23', '2026-11-24', '2026-11-25', '2027-01-04'] },
      { calendar: second, dates: ['2027-11-11', '2027-11-22', '2027-11-23', '2027-11-24', '2028-01-03'] },
    ]
    for (const { calendar, dates } of expectations) {
      expect([...datesFor(calendar, calendar.conditionalNoSchoolDayEventIds!)]).toEqual(dates)
      for (const id of calendar.conditionalNoSchoolDayEventIds!) {
        const e = calendar.events.find(e => e.id === id)!
        expect(e).toMatchObject({ scheduledAsNoSchool: true, mayBecomeAttendanceDay: true, countsAsStudentAttendanceDayUnderPublishedSchedule: false, schoolStatus: 'no-classes', nameBasis: 'derived' })
        expect(e.countsAsStudentAttendanceDay).toBeUndefined()
        expect(e.dateEnd).toBeNull()
        expect(hasEventType(e, 'MAKEUP_DAY')).toBe(true)
        expect(calendar.confirmedNoSchoolDayEventIds).not.toContain(id)
      }
    }
  })

  it('preserves exact break ranges and separately printed non-student Mondays and returns', () => {
    expect(first.breaks.map(b => [b.name, b.dateStart, b.dateEnd, b.nextStudentAttendanceDate])).toEqual([
      ['Fall Break', '2026-11-23', '2026-11-27', '2026-11-30'],
      ['Winter Break', '2026-12-21', '2027-01-01', '2027-01-05'],
      ['Spring Break', '2027-03-22', '2027-03-26', '2027-03-30'],
    ])
    expect(second.breaks.map(b => [b.name, b.dateStart, b.dateEnd, b.nextStudentAttendanceDate])).toEqual([
      ['Fall Break', '2027-11-22', '2027-11-26', '2027-11-29'],
      ['Winter Break', '2027-12-20', '2027-12-31', '2028-01-04'],
      ['Spring Break', '2028-03-13', '2028-03-17', '2028-03-21'],
    ])
    for (const calendar of [first, second]) {
      for (const b of calendar.breaks) {
        expect([...datesFor(calendar, b.componentEventIds!)].sort()).toEqual(weekdays(b.dateStart, b.dateEnd))
        expect(b.schoolWeekdaysOff).toBe(weekdays(b.dateStart, b.dateEnd).length)
        expect(b.nextStudentAttendanceDateBasis).toBe('official')
      }
      const allOff = new Set([...datesFor(calendar, calendar.confirmedNoSchoolDayEventIds!), ...datesFor(calendar, calendar.conditionalNoSchoolDayEventIds!)])
      const occurrences = calendar.events.filter(e => allOff.has(e.dateStart!)).flatMap(e => weekdays(e.dateStart!, e.dateEnd || e.dateStart!))
      expect(occurrences.length).toBe(allOff.size)
      expect(event(calendar, 'january-nonstudent').dateStart! > event(calendar, 'winter-break').dateEnd!).toBe(true)
      expect(event(calendar, 'march-nonstudent').dateStart! > event(calendar, 'spring-break').dateEnd!).toBe(true)
    }
    expect(event(first, 'fall-fixed')).toMatchObject({ dateStart: '2026-11-26', dateEnd: '2026-11-27' })
    expect(event(second, 'fall-fixed')).toMatchObject({ dateStart: '2027-11-25', dateEnd: '2027-11-26' })
  })

  it('does not mistake ordinary grading ends or festival gaps for closures or shortened dates', () => {
    for (const calendar of [first, second]) {
      for (const key of ['quarter-1-end', 'quarter-2-end', 'quarter-3-end']) {
        expect(event(calendar, key).schoolStatus).toBe('schools-open')
        expect(hasEventType(event(calendar, key), 'EARLY_RELEASE')).toBe(false)
      }
      expect(calendar.events.filter(e => e.dateStart === calendar.lastDay)).toHaveLength(1)
      expect(event(calendar, 'last-day').eventTypes).toEqual(['LAST_DAY', 'EARLY_RELEASE', 'GRADING_PERIOD_END', 'SEMESTER_END'])
      expect(calendar.events.some(e => e.schoolStatus === 'staff-only' || hasEventType(e, 'REPORT_CARD') || hasEventType(e, 'GRADUATION'))).toBe(false)
    }
    const off = datesFor(second, second.confirmedNoSchoolDayEventIds!)
    for (const d of weekdays('2028-03-07', '2028-03-10')) expect(off.has(d)).toBe(false)
    expect(event(first, 'state-fair').dateStart).toBe('2027-02-12')
    expect(event(second, 'state-fair').dateStart).toBe('2028-02-18')
    for (const calendar of [first, second]) {
      expect(event(calendar, 'april-nonstudent')).toMatchObject({ name: 'Non-Student Day', nameBasis: 'official' })
    }
  })

  it('scopes the current Riverview bell schedule by school and effective date', () => {
    expect(first.schoolHours).toEqual([expect.objectContaining({ scope: 'Riverview High School only', effectiveFrom: '2026-09-10', effectiveThrough: null, regularHours: '8:30 a.m. - 3:35 p.m. (Tuesday-Friday)', earlyReleaseHours: '8:30 a.m. - 2:35 p.m. (instructional Mondays)', sourceId: 'hillsborough-riverview-bell' })])
    expect(first.sources.find(s => s.id === 'hillsborough-riverview-bell')).toMatchObject({ url: 'https://aptg.co/p9fcfC', contentHash: 'sha256:946cadbfe373616c4deb660a8542457d38ea585fe76be5bdf3affa12c347d5ff' })
    expect(first.events.every(e => !e.timeSourceId)).toBe(true)
  })

  it('reconciles published attendance separately from the fixed no-school subset', () => {
    for (const calendar of [first, second]) {
      const fixed = datesFor(calendar, calendar.confirmedNoSchoolDayEventIds!)
      const conditional = datesFor(calendar, calendar.conditionalNoSchoolDayEventIds!)
      expect(fixed.size).toBe(24)
      expect(weekdays(calendar.firstDay!, calendar.lastDay!).length - fixed.size - conditional.size).toBe(180)
      expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar, { preserveStoredBreakWording: true }))
      expect(calendar.statistics.find(s => s.id === 'student-attendance-days')).toMatchObject({ value: '180 days', basis: 'derived' })
      expect(calendar.statistics.find(s => s.id === 'longest-no-school-stretch')?.value).toBe('16 consecutive days')
    }
    expect(first.statistics.find(s => s.id === 'early-release-days')?.value).toBe('32 dates')
    expect(second.statistics.find(s => s.id === 'early-release-days')?.value).toBe('1 date')
    expect(calculateCalendarStatistics(second).find((s: { id: string }) => s.id === 'early-release-days')).toMatchObject({
      label: 'Confirmed early-release date (so far)', value: '1 date', basis: 'derived',
    })
  })

  it('keeps instructional Mondays open, next-year August 16 full length and hurricane reserves conditional in the UI', () => {
    for (const calendar of [first, second]) {
      const table = mount(CalendarEventsTable, { props: {
        events: calendar.events, districtName: record.district.name, schoolYear: calendar.schoolYear,
      } })
      const rowFor = (key: string) => table.findAll('tbody tr').find(row => row.find('time').attributes('datetime') === event(calendar, key).dateStart)!
      if (calendar === first) {
        for (const key of ['first-day', 'fall-return', 'monday-2027-03-01']) {
          expect(rowFor(key).find('.badge--early-release').exists()).toBe(true)
          expect(rowFor(key).find('.badge--closed').exists()).toBe(false)
        }
      } else {
        expect(rowFor('august-full-day').find('.badge--early-release').exists()).toBe(false)
        expect(rowFor('august-full-day').find('.badge--closed').exists()).toBe(false)
      }
      if (calendar === first) {
        expect(rowFor('october-nonstudent').find('.badge--conditional').text()).toBe('Published no-class schedule; actual attendance unverified')
        expect(event(first, 'october-nonstudent')).toMatchObject({ attendanceContingencyStatus: 'historical', mayBecomeAttendanceDay: true })
      }
      for (const id of calendar.conditionalNoSchoolDayEventIds!) {
        const key = id.replace(`hillsborough-${calendar.schoolYear}-`, '')
        expect(rowFor(key).find('.badge--conditional').exists()).toBe(true)
        expect(rowFor(key).find('.badge--closed').exists()).toBe(false)
      }
      table.unmount()

      const monthly = mount(MonthlyCalendar, { props: {
        events: calendar.events, districtName: record.district.name, firstDay: calendar.firstDay, lastDay: calendar.lastDay,
      } })
      const cellFor = (key: string) => monthly.findAll('td').find(cell => cell.find(`time[datetime="${event(calendar, key).dateStart}"]`).exists())!
      for (const key of calendar === first ? ['first-day', 'fall-return', 'monday-2027-03-01'] : ['august-full-day']) {
        expect(cellFor(key).classes()).toContain('month-day--school-day')
        expect(cellFor(key).classes()).not.toContain('month-day--holiday')
      }
      for (const id of calendar.conditionalNoSchoolDayEventIds!) {
        expect(cellFor(id.replace(`hillsborough-${calendar.schoolYear}-`, '')).classes()).toContain('month-day--conditional')
      }
      if (calendar === first) {
        const pastDate = monthly.find('#month-day-tooltip-2026-10-12').text()
        expect(pastDate).toContain('actual attendance unverified')
        expect(pastDate).toContain('historical make-up designation')
        expect(pastDate).not.toContain('attendance may change')
      }
      monthly.unmount()
    }
  })

  it('exports individual Mondays, exact inclusive break ends and conditional caveats', () => {
    for (const calendar of [first, second]) {
      const exported = entries(calendar)
      const find = (key: string) => exported.find(e => e.includes('UID:' + event(calendar, key).id + '@'))!
      expect(exported).toHaveLength(calendar.events.length)
      expect(exported.filter(e => e.includes('DTSTART;VALUE=DATE:' + calendar.lastDay!.replaceAll('-', '')))).toHaveLength(1)
      expect(find('last-day')).toContain('CATEGORIES:LAST_DAY,EARLY_RELEASE,GRADING_PERIOD_END,SEMESTER_END')
      expect(find('veterans-day')).toContain('School status: If needed\\; attendance may change')
    }
    expect(entries(first).find(e => e.includes('UID:' + event(first, 'winter-break').id + '@'))).toContain('DTEND;VALUE=DATE:20270102')
    expect(entries(first).find(e => e.includes('UID:' + event(first, 'spring-break').id + '@'))).toContain('DTEND;VALUE=DATE:20270327')
    const historical = entries(first).find(e => e.includes('UID:' + event(first, 'october-nonstudent').id + '@'))!
    expect(historical).toContain('actual attendance unverified')
    expect(historical).toContain('historical make-up designation')
    expect(historical).not.toContain('attendance may change')
    expect(historical).not.toContain('may become an attendance day')
    expect(entries(second).find(e => e.includes('UID:' + event(second, 'winter-break').id + '@'))).toContain('DTEND;VALUE=DATE:20280101')
    expect(entries(second).find(e => e.includes('UID:' + event(second, 'spring-break').id + '@'))).toContain('DTEND;VALUE=DATE:20280318')
  })
})
