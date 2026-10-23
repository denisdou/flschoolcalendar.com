import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CalendarEventsTable from '../../app/components/calendar/CalendarEventsTable.vue'
import MonthlyCalendar from '../../app/components/calendar/MonthlyCalendar.vue'
import type { DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/hernando-county-school-district.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'
// @ts-ignore Dependency-free publication audit.
import { auditRecords } from '../../scripts/check-content-quality.mjs'

const record = recordJson as DistrictRecord
const calendar = record.schoolYears['2026-2027']!
const event = (key: string) => calendar.events.find(e => e.id === 'hernando-2026-2027-' + key)!
function weekdays(start: string, end: string) {
  const dates: string[] = []
  for (const d = new Date(start + 'T00:00:00Z'); d <= new Date(end + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    if (![0, 6].includes(d.getUTCDay())) dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}
function datesFor(ids: string[]) {
  return new Set(ids.flatMap(id => {
    const e = calendar.events.find(e => e.id === id)!
    return weekdays(e.dateStart!, e.dateEnd || e.dateStart!)
  }))
}
const fixed = () => datesFor(calendar.confirmedNoSchoolDayEventIds!)
const conditional = () => datesFor(calendar.conditionalNoSchoolDayEventIds!)

describe('Hernando County Florida 2026-2027 student calendar interpretation', () => {
  it('identifies the matching student file and keeps bell-table approval separate from annual calendar approval', () => {
    expect(record.district).toMatchObject({ id: 'FL-27', districtNumber: '27', timeZone: 'America/New_York', name: 'Hernando County School District' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027'])
    expect(calendar.sources[0]?.contentHash).toBe('sha256:a0a03d3ed76c667b8a37d9554471259600b8275e1811c5ba7f06a93d1548aac2')
    expect(calendar.approvedAt).toBe('2026-02-10')
    expect(calendar.sourceDocumentUpdatedAt).toBeNull()
    expect(calendar.sources.find(s => s.id === 'hernando-2026-2027-bell-times')).toMatchObject({ printedBoardApprovalDate: '2026-03-24', contentHash: 'sha256:77b707e8187172c0ffaad9a377f1e0f409c5cf575c46e006e593b6c7e77700a6' })
    expect(calendar.sources.find(s => s.id === 'hernando-2026-2027-board-calendar-approval')).toMatchObject({
      type: 'official-webpage', retrievedAt: '2026-10-23', publishedAt: null,
    })
    const approval = calendar.sourceDiscrepancies?.find(d => d.field === 'approvedAt')
    expect(approval?.resolution).toBe('resolved')
    expect(approval?.sourceIds).toContain('hernando-2026-2027-board-calendar-approval')
    expect(approval?.effect).toContain('26-3513')
    expect(approval?.effect).toContain('exact document-level agreement is not independently verified')
  })

  it('accepts resolved approval history while still rejecting missing evidence and invalid resolution states', () => {
    expect(auditRecords([{ filename: 'hernando-county-school-district.json', record }])).toEqual([])
    const copy = structuredClone(record)
    const approval = copy.schoolYears['2026-2027']!.sourceDiscrepancies![0]!
    const sources = [...approval.sourceIds]
    approval.sourceIds = ['missing-board-evidence']
    expect(auditRecords([{ filename: 'hernando-county-school-district.json', record: copy }]).some((issue: { code: string }) => issue.code === 'UNKNOWN_SOURCE_DISCREPANCY_ID')).toBe(true)
    approval.sourceIds = sources
    Object.assign(approval, { resolution: 'silently-discarded' })
    expect(auditRecords([{ filename: 'hernando-county-school-district.json', record: copy }]).some((issue: { code: string }) => issue.code === 'INVALID_SOURCE_DISCREPANCY_RESOLUTION')).toBe(true)
  })

  it('retains exactly four published hurricane reserve dates without unconditional absence flags', () => {
    expect([...conditional()].sort()).toEqual(['2026-11-23', '2026-11-24', '2027-03-15', '2027-03-16'])
    expect(calendar.conditionalNoSchoolDayEventIds).toHaveLength(4)
    for (const id of calendar.conditionalNoSchoolDayEventIds!) {
      const e = calendar.events.find(e => e.id === id)!
      expect(e).toMatchObject({ schoolStatus: 'no-classes', scheduledAsNoSchool: true, mayBecomeAttendanceDay: true, countsAsStudentAttendanceDayUnderPublishedSchedule: false, mayBecomeAttendanceDayBasis: 'official' })
      expect(e.countsAsStudentAttendanceDay).toBeUndefined()
      expect(hasEventType(e, 'MAKEUP_DAY')).toBe(true)
      expect(fixed().has(e.dateStart!)).toBe(false)
      expect(calendar.events.filter(other => other.dateStart === e.dateStart)).toHaveLength(1)
    }
    expect(calendar.events.some(e => hasEventType(e, 'EMERGENCY_CLOSURE'))).toBe(false)
  })

  it('partitions only the conditional weekdays and retains each complete official break as a planning span', () => {
    expect(event('thanksgiving-fixed')).toMatchObject({ dateStart: '2026-11-25', dateEnd: '2026-11-27', dateBasis: 'derived' })
    expect(event('spring-fixed')).toMatchObject({ dateStart: '2027-03-17', dateEnd: '2027-03-19', dateBasis: 'derived' })
    expect(calendar.breaks.find(b => b.name === 'Thanksgiving Break')).toMatchObject({ dateStart: '2026-11-23', dateEnd: '2026-11-27', schoolWeekdaysOff: 5, basis: 'official' })
    expect(calendar.breaks.find(b => b.name === 'Spring Break')).toMatchObject({ dateStart: '2027-03-15', dateEnd: '2027-03-19', schoolWeekdaysOff: 5, basis: 'official' })
    for (const b of calendar.breaks) {
      expect([...datesFor(b.componentEventIds!)].sort()).toEqual(weekdays(b.dateStart, b.dateEnd))
      expect(weekdays(b.dateStart, b.dateEnd)).toHaveLength(b.schoolWeekdaysOff!)
      if (['Spring Break', 'Thanksgiving Break'].includes(b.name)) expect(b.schoolWeekdaysOffNote).toContain('conditional')
    }
  })

  it('keeps January 4 and March 22 outside named breaks and derives the next student dates', () => {
    expect(event('winter-break')).toMatchObject({ dateStart: '2026-12-21', dateEnd: '2027-01-01' })
    expect(event('january-professional')).toMatchObject({ dateStart: '2027-01-04', schoolStatus: 'no-classes' })
    expect(event('winter-return')).toMatchObject({ dateStart: '2027-01-05', dateBasis: 'derived', basis: 'derived' })
    expect(event('march-professional')).toMatchObject({ dateStart: '2027-03-22', schoolStatus: 'no-classes', schoolStatusBasis: 'derived' })
    expect(calendar.breaks.find(b => b.name === 'Spring Break')).toMatchObject({ nextStudentAttendanceDate: '2027-03-23', nextStudentAttendanceDateBasis: 'derived' })
    expect(event('spring-return')).toMatchObject({ dateStart: '2027-03-23', eventType: 'SCHOOL_MILESTONE', basis: 'derived', dateBasis: 'derived', countsAsStudentAttendanceDay: true })
    expect(calendar.keyDates.find(k => k.dateStart === '2027-03-23')).toMatchObject({ dateBasis: 'derived', labelBasis: 'derived', eventTypeBasis: 'derived' })
    for (const d of weekdays('2027-03-23', '2027-03-25')) {
      expect(fixed().has(d)).toBe(false)
      expect(conditional().has(d)).toBe(false)
    }
    expect(event('march-long-weekend')).toMatchObject({ dateStart: '2027-03-26', eventType: 'NON_STUDENT_DAY', eventTypeBasis: 'derived', officialLabel: 'Long weekend', schoolStatus: 'no-classes' })
    expect(event('march-long-weekend').name).not.toContain('Good Friday')
  })

  it('counts four professional-development early releases and all six semester-end dates', () => {
    const early = calendar.events.filter(e => hasEventType(e, 'EARLY_RELEASE'))
    expect(early.map(e => e.dateStart)).toEqual(['2026-08-28', '2026-09-25', '2026-12-16', '2026-12-17', '2026-12-18', '2027-01-29', '2027-02-26', '2027-05-26', '2027-05-27', '2027-05-28'])
    expect(early.every(e => e.schoolStatus === 'early-dismissal' && e.countsAsStudentAttendanceDay === true && e.timeSourceId === 'hernando-2026-2027-bell-times')).toBe(true)
    expect(calendar.events.filter(e => hasEventType(e, 'GRADING_PERIOD_END')).map(e => e.dateStart)).toEqual(['2026-10-09', '2026-12-18', '2027-03-12', '2027-05-28'])
    for (const key of ['quarter-1-end', 'quarter-3-end']) {
      expect(hasEventType(event(key), 'EARLY_RELEASE')).toBe(false)
      expect(event(key).countsAsStudentAttendanceDay).toBe(true)
    }
    expect(event('last-day').eventTypes).toEqual(['LAST_DAY', 'EARLY_RELEASE', 'GRADING_PERIOD_END', 'SEMESTER_END'])
    expect(calendar.events.filter(e => e.dateStart === '2027-05-28')).toHaveLength(1)
    expect(calendar.events.some(e => hasEventType(e, 'EXAM') || hasEventType(e, 'FINAL_EXAM'))).toBe(false)
  })

  it('excludes preparation and payroll-only dates while retaining four full in-year student-free staff dates', () => {
    expect(calendar.events.filter(e => e.eventType === 'NON_STUDENT_DAY' && e.id !== event('march-long-weekend').id).map(e => e.dateStart)).toEqual(['2026-10-12', '2026-10-30', '2027-01-04', '2027-03-22'])
    expect(calendar.events.some(e => /PreSchool|Post School|Memorial Day|Paid Holidays|First day for instructional staff/.test(e.name) || e.schoolStatus === 'staff-only')).toBe(false)
    expect(calendar.firstDay).toBe('2026-08-11')
    expect(calendar.lastDay).toBe('2027-05-28')
    expect(calendar.events.some(e => e.dateStart! < calendar.firstDay! || e.dateStart! > calendar.lastDay!)).toBe(false)
  })

  it('stores all 23 school rows with separate arrival notes and the correct early-release clock groups', () => {
    const rows = calendar.schoolHours as Array<{ scope: string; regularHours: string; earlyReleaseTime: string; note: string; sourceId: string }>
    expect(rows).toHaveLength(23)
    expect(rows.every(r => r.sourceId === 'hernando-2026-2027-bell-times' && r.note.includes('Drop-off begins'))).toBe(true)
    const row = (scope: string) => rows.find(r => r.scope === scope)!
    expect(row('Hernando High School')).toMatchObject({ regularHours: '7:20 a.m. - 2:20 p.m.', earlyReleaseTime: '11:20 a.m.' })
    expect(row('Hernando High School').note).toContain('7:00 a.m.')
    expect(row('D.S. Parrott Middle School').earlyReleaseTime).toBe('11:00 a.m.')
    expect(row('Endeavor').earlyReleaseTime).toBe('11:05 a.m.')
    expect(row('Nature Coast Technical High School').earlyReleaseTime).toBe('11:10 a.m.')
    expect(row('Eastside Academy (elementary schedule)')).toMatchObject({ regularHours: '9:00 a.m. - 3:40 p.m.', earlyReleaseTime: '12:40 p.m.' })
    expect(row('Fox Chapel Middle School').earlyReleaseTime).toBe('12:10 p.m.')
    expect(row('Challenger K-8').earlyReleaseTime).toBe('12:55 p.m.')
    expect(row('Westside Elementary School').earlyReleaseTime).toBe('1:10 p.m.')
    expect(rows.filter(r => r.earlyReleaseTime === '1:10 p.m.')).toHaveLength(7)
  })

  it('separates 25 fixed closure weekdays from four current reserves and keeps the annual quarter sum derived', () => {
    expect(weekdays(calendar.firstDay!, calendar.lastDay!)).toHaveLength(209)
    expect(fixed().size).toBe(25)
    expect(conditional().size).toBe(4)
    expect(209 - fixed().size - conditional().size).toBe(180)
    expect(fixed().has('2026-11-03')).toBe(false)
    expect(conditional().has('2026-11-03')).toBe(false)
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar, { preserveStoredBreakWording: true }))
    expect(calendar.statistics.find(s => s.id === 'student-attendance-days')).toMatchObject({ value: '180 days', basis: 'derived' })
    expect(calendar.statistics.find(s => s.id === 'student-attendance-days')?.explanation).toContain('43 + 42 + 47 + 48')
    expect(calendar.statistics.find(s => s.id === 'total-no-school-weekdays')).toMatchObject({ value: '25 weekdays', label: 'Fixed no-school weekdays' })
    expect(calendar.statistics.find(s => s.id === 'longest-no-school-stretch')?.value).toBe('17 consecutive days')
    expect(calendar.statistics.find(s => s.id === 'full-week-breaks')).toMatchObject({ value: '1 break', label: 'Full-week breaks on fixed dates' })
  })

  it('shows all four hurricane reserves as conditional and the unnamed long weekend as no classes, not staff work', () => {
    const reserves = calendar.conditionalNoSchoolDayEventIds!.map(id => calendar.events.find(e => e.id === id)!)
    const events = [...reserves, event('march-long-weekend'), event('last-day')]
    const table = mount(CalendarEventsTable, { props: { events, districtName: record.district.name, schoolYear: calendar.schoolYear } })
    expect(table.findAll('.badge--conditional')).toHaveLength(4)
    for (const badge of table.findAll('.badge--conditional')) expect(badge.text()).toBe('No school scheduled')
    expect(table.findAll('.badge--closed')).toHaveLength(1)
    expect(table.find('.badge--closed').text()).toBe('No classes')
    const lastRow = table.findAll('tbody tr').find(row => row.find('time').attributes('datetime') === '2027-05-28')!
    expect(lastRow.classes()).toContain('calendar-event-row--early-release')
    expect(lastRow.find('.badge--early-release').text()).toBe('Last day / early dismissal')
    expect(table.text()).not.toMatch(/Teacher Workday|Good Friday Holiday/)
    table.unmount()

    const monthly = mount(MonthlyCalendar, { props: { events, districtName: record.district.name, firstDay: calendar.firstDay, lastDay: calendar.lastDay } })
    for (const reserve of reserves) {
      expect(monthly.find(`td time[datetime="${reserve.dateStart}"]`).element.closest('td')!.className).toContain('conditional')
    }
    expect(monthly.find('td time[datetime="2027-03-26"]').element.closest('td')!.className).toContain('holiday')
    monthly.unmount()
  })

  it('exports one event per reserved date and the original fixed and winter range endpoints', () => {
    const entries = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '').split('BEGIN:VEVENT').slice(1)
    const find = (key: string) => entries.find(e => e.includes('UID:' + event(key).id + '@'))!
    expect(entries).toHaveLength(31)
    expect(find('thanksgiving-reserve-1')).toContain('CATEGORIES:THANKSGIVING_BREAK,MAKEUP_DAY')
    expect(find('thanksgiving-reserve-1')).toContain('attendance may change')
    expect(entries.filter(e => e.includes('DTSTART;VALUE=DATE:20261123'))).toHaveLength(1)
    expect(find('thanksgiving-fixed')).toContain('DTEND;VALUE=DATE:20261128')
    expect(find('winter-break')).toContain('DTEND;VALUE=DATE:20270102')
    expect(find('spring-fixed')).toContain('DTEND;VALUE=DATE:20270320')
    expect(find('spring-return')).toContain('DTSTART;VALUE=DATE:20270323')
    expect(find('march-long-weekend')).toContain('CATEGORIES:NON_STUDENT_DAY')
    expect(entries.filter(e => e.includes('DTSTART;VALUE=DATE:20270528'))).toHaveLength(1)
    expect(find('last-day')).toContain('CATEGORIES:LAST_DAY,EARLY_RELEASE,GRADING_PERIOD_END,SEMESTER_END')
    expect(find('last-day')).toContain('Time source: https://files.smartsites.parentsquare.com/10061/2026-27__approved_bell_times')
  })
})
