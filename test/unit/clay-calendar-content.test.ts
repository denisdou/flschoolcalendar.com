import { readFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CalendarEventsTable from '../../app/components/calendar/CalendarEventsTable.vue'
import type { DistrictCalendar, DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/clay-county-school-district.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore Dependency-free publication checker.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord
const current = record.schoolYears['2026-2027']!
const next = record.schoolYears['2027-2028']!
const calendars = [current, next]
const event = (calendar: DistrictCalendar, key: string) => calendar.events.find(item => item.id === `clay-${calendar.schoolYear}-${key}`)!
function weekdays(start: string, end: string) {
  const dates: string[] = []
  for (const cursor = new Date(start + 'T00:00:00Z'); cursor <= new Date(end + 'T00:00:00Z'); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (![0, 6].includes(cursor.getUTCDay())) dates.push(cursor.toISOString().slice(0, 10))
  }
  return dates
}
function closedDates(calendar: DistrictCalendar) {
  return new Set(calendar.confirmedNoSchoolDayEventIds!.flatMap(id => {
    const item = calendar.events.find(item => item.id === id)!
    return weekdays(item.dateStart!, item.dateEnd || item.dateStart!)
  }))
}
function shortened(calendar: DistrictCalendar, scope: string) {
  return calendar.events.filter(item => hasEventType(item, 'EARLY_RELEASE') && (
    (!item.gradeScope && !item.scheduleScope)
    || (item.gradeScope || item.scheduleScope || '').toLowerCase().split('; ').includes(scope.toLowerCase())
  )).map(item => item.dateStart)
}

describe('Clay final online-calendar PDF exports', () => {
  it('publishes both approved years while keeping Google documents as the original source', () => {
    expect(record.district).toMatchObject({ id: 'FL-10', name: 'Clay County District Schools', slug: 'clay-county-school-district', timeZone: 'America/New_York' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027', '2027-2028'])
    expect(calendars.map(calendar => calendar.approvedAt)).toEqual(['2024-12-12', '2025-11-06'])
    expect(calendars.map(calendar => calendar.sources[0]?.contentHash)).toEqual([
      'sha256:2478d86795744686d9141ca0369f5864641723c703d48d2bebada0647679778c',
      'sha256:ac8541271ba62d361cadbfd4b0aa87fcecdebf37adfd0fb94e9b67e424b4bab1',
    ])
    for (const calendar of calendars) {
      expect(calendar).toMatchObject({ status: 'official', indexable: true, verifiedAt: '2026-10-16' })
      expect(calendar.actions.officialPdfUrl).toBeNull()
      expect(calendar.actions.officialCalendarUrl).toContain('https://docs.google.com/document/d/')
      expect(calendar.sources[0]?.url).toBe(calendar.actions.officialCalendarUrl)
      expect(calendar.sources[0]?.printedBoardApprovalDate).toBe(calendar.approvedAt)
    }
    expect(auditRecords([{ filename: record.district.slug + '.json', record }])).toEqual([])
  })

  it('retains six early dismissals per school group rather than ten universal shortened days', () => {
    expect(shortened(current, 'Elementary schools')).toEqual(['2026-09-18', '2026-10-30', '2026-12-18', '2027-02-12', '2027-04-23', '2027-05-27'])
    expect(shortened(current, 'Junior high and high schools')).toEqual(['2026-12-16', '2026-12-17', '2026-12-18', '2027-05-25', '2027-05-26', '2027-05-27'])
    expect(shortened(next, 'Elementary schools')).toEqual(['2027-09-17', '2027-10-29', '2027-12-17', '2028-02-11', '2028-05-05', '2028-05-26'])
    expect(shortened(next, 'Junior high and high schools')).toEqual(['2027-12-15', '2027-12-16', '2027-12-17', '2028-05-24', '2028-05-25', '2028-05-26'])
    for (const calendar of calendars) {
      const early = calendar.events.filter(item => hasEventType(item, 'EARLY_RELEASE'))
      expect(early).toHaveLength(10)
      expect(early.every(item => item.schoolStatus === 'early-dismissal' && item.countsAsStudentAttendanceDay === true)).toBe(true)
      expect(early.filter(item => item.gradeScope === 'Elementary schools; junior high and high schools')).toHaveLength(2)
    }
  })

  it('uses the final March 31 report card without changing the March 29 spring return', () => {
    const returning = event(current, 'spring-return')
    expect(returning).toMatchObject({ dateStart: '2027-03-29', schoolStatus: 'schools-open' })
    expect(hasEventType(returning, 'REPORT_CARD')).toBe(false)
    expect(current.events.filter(item => hasEventType(item, 'REPORT_CARD')).map(item => item.dateStart)).toEqual(['2026-10-16', '2027-01-11', '2027-03-31', '2027-06-04'])
    expect(current.events.filter(item => item.dateStart === '2027-03-29')).toEqual([returning])
    expect(current.sourceDiscrepancies?.find(item => item.field === 'third report-card posting date')?.effect).toContain('Use March 31')
    expect(event(current, 'report_card-2027-03-31')).toMatchObject({ schoolStatus: 'not-applicable', schoolStatusLabel: 'Report cards posted' })
  })

  it('combines shared dates without narrowing district reporting to the early-dismissal grades', () => {
    const april = event(current, 'early-dismissal-2027-04-23')
    expect(april.eventTypes).toEqual(['EARLY_RELEASE', 'PROGRESS_REPORT'])
    expect(april.gradeScope).toBeUndefined()
    expect(april).toMatchObject({ scheduleScope: 'Elementary schools', scheduleType: 'MODIFIED_DAY' })
    for (const calendar of calendars) {
      const last = event(calendar, 'last-day')
      expect(last.eventTypes).toEqual(['LAST_DAY', 'GRADING_PERIOD_END', 'EARLY_RELEASE'])
      expect(last).toMatchObject({ gradeScope: 'Elementary schools; junior high and high schools', gradeScopeBasis: 'derived', gradeScopeSourceId: `clay-${calendar.schoolYear}-calendar` })
      expect(calendar.events.filter(item => item.dateStart === calendar.lastDay)).toEqual([last])
      expect(event(calendar, 'grading-period-2-end').eventTypes).toEqual(['GRADING_PERIOD_END', 'EARLY_RELEASE'])
      expect(hasEventType(event(calendar, 'grading-period-1-end'), 'EARLY_RELEASE')).toBe(false)
      expect(hasEventType(event(calendar, 'grading-period-3-end'), 'EARLY_RELEASE')).toBe(false)
    }
  })

  it('shows scoped compound dismissals once and includes the shared interim posting in reporting filters', () => {
    for (const calendar of calendars) {
      const early = calendar.events.filter(item => hasEventType(item, 'EARLY_RELEASE'))
      const wrapper = mount(CalendarEventsTable, { props: { events: early, districtName: record.district.name, schoolYear: calendar.schoolYear } })
      expect(wrapper.findAll('tbody tr')).toHaveLength(10)
      expect(wrapper.findAll('.calendar-event-row--early-release')).toHaveLength(10)
      const rowFor = (date: string) => wrapper.findAll('tbody tr').find(row => row.find('time').attributes('datetime') === date)!
      expect(rowFor(event(calendar, 'grading-period-2-end').dateStart!).text()).toContain('Second Grading Period Ends & Early Dismissal')
      expect(rowFor(event(calendar, 'grading-period-2-end').dateStart!).find('.badge--early-release').text()).toBe('Grading period ends / early dismissal')
      expect(rowFor(calendar.lastDay!).text()).toContain('Last day / early dismissal')
      expect(rowFor(calendar.lastDay!).text()).toContain('Last Day for Students - Early Dismissal')
      expect(rowFor(shortened(calendar, 'Elementary schools')[0]!).text()).toContain('Elementary Early Dismissal')
      expect(rowFor(shortened(calendar, 'Junior high and high schools')[0]!).text()).toContain('Junior High & High School Early Dismissal')
      if (calendar === current) {
        expect(rowFor('2027-04-23').text()).toContain('Elementary Early Dismissal & Interim Grades Posted')
        expect(calendar.events.filter(item => hasEventType(item, 'PROGRESS_REPORT'))).toContain(event(calendar, 'early-dismissal-2027-04-23'))
      }
      wrapper.unmount()
    }
  })

  it('keeps named spring holidays separate from opposite-side planning days and later Fair Day', () => {
    expect(event(current, 'spring-break')).toMatchObject({ dateStart: '2027-03-22', dateEnd: '2027-03-26', dateBasis: 'official' })
    expect(event(current, 'spring-planning').dateStart).toBe('2027-03-19')
    expect(current.breaks[2]).toMatchObject({ dateStart: '2027-03-19', dateEnd: '2027-03-28', nextStudentAttendanceDate: '2027-03-29', schoolWeekdaysOff: 6 })
    expect(event(next, 'spring-break')).toMatchObject({ dateStart: '2028-03-13', dateEnd: '2028-03-17', dateBasis: 'official' })
    expect(event(next, 'spring-planning').dateStart).toBe('2028-03-20')
    expect(next.breaks[2]).toMatchObject({ dateStart: '2028-03-11', dateEnd: '2028-03-20', nextStudentAttendanceDate: '2028-03-21', schoolWeekdaysOff: 6 })
    for (const calendar of calendars) {
      const closed = closedDates(calendar)
      for (const span of calendar.breaks) {
        for (const day of weekdays(span.dateStart, span.dateEnd)) expect(closed.has(day)).toBe(true)
        expect(closed.has(span.nextStudentAttendanceDate!)).toBe(false)
      }
    }
    for (const day of weekdays('2027-03-29', '2027-04-01')) expect(closedDates(current).has(day)).toBe(false)
    for (const day of weekdays('2028-04-10', '2028-04-13')) expect(closedDates(next).has(day)).toBe(false)
    expect(event(next, 'fair-day').dateStart).toBe('2028-04-07')
    expect(event(next, 'good-friday').dateStart).toBe('2028-04-14')
  })

  it('derives annual totals from quarter figures and preserves student reporting after the last class date', () => {
    for (const [calendar, total, closed] of [[current, 208, 28], [next, 209, 29]] as Array<[DistrictCalendar, number, number]>) {
      expect(weekdays(calendar.firstDay!, calendar.lastDay!)).toHaveLength(total)
      expect(closedDates(calendar).size).toBe(closed)
      expect(total - closed).toBe(180)
      expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
      expect(calendar.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value: '180 days', basis: 'derived' })
      expect(calendar.statistics.find(item => item.id === 'early-release-days')).toMatchObject({ value: '10 dates', basis: 'derived' })
      expect(calendar.highlights).toContainEqual(expect.objectContaining({ label: 'Scheduled student attendance days', value: '180 days', basis: 'derived' }))
      expect(calendar.events.filter(item => item.dateStart! > calendar.lastDay!).every(item => item.eventType === 'REPORT_CARD')).toBe(true)
      expect(calendar.events.filter(item => hasEventType(item, 'LAST_DAY'))).toEqual([event(calendar, 'last-day')])
      expect(event(calendar, 'graduation')).toMatchObject({ schoolStatus: 'not-applicable' })
      expect(calendar.events.some(item => hasEventType(item, 'MAKEUP_DAY') || hasEventType(item, 'EMERGENCY_CLOSURE'))).toBe(false)
    }
    expect(event(current, 'report_card-2027-06-04').dateStart).toBe('2027-06-04')
    expect(event(next, 'report_card-2028-06-09').dateStart).toBe('2028-06-09')
  })

  it('uses current student hours only for the explicitly supported year, without office or inferred early-release times', () => {
    expect(current.schoolHours).toHaveLength(8)
    expect(next.schoolHours).toEqual([])
    expect(current.schoolHours).toContainEqual(expect.objectContaining({ scope: 'Orange Park Elementary', regularHours: '7:45 a.m.-1:57 p.m.' }))
    expect(current.schoolHours).toContainEqual(expect.objectContaining({ scope: 'Rideout Elementary, Shadowlawn Elementary', regularHours: '8:20 a.m.-2:32 p.m.' }))
    expect(current.schoolHours).toContainEqual(expect.objectContaining({ scope: 'McRae Elementary', regularHours: '8:45 a.m.-2:57 p.m.' }))
    expect(current.schoolHours).toContainEqual(expect.objectContaining({ scope: 'Bannerman Learning Center — Success program', regularHours: '6:45 a.m.-1:10 p.m.' }))
    for (const row of current.schoolHours as Array<{ regularHours: string; earlyReleaseHours?: string }>) expect(row.earlyReleaseHours).toBeUndefined()
    expect(current.faqs.find(item => item.question === 'Where can parents check Clay County grades and report cards?')?.answer).toContain('Focus')
    expect(current.faqs).toHaveLength(23)
    expect(next.faqs).toHaveLength(21)
  })

  it('exports each occurrence once with exclusive end dates and the final report-card correction', () => {
    for (const [calendar, count] of [[current, 34], [next, 36]] as Array<[DistrictCalendar, number]>) {
      const ics = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
      const entries = ics.split('BEGIN:VEVENT').slice(1)
      const find = (key: string) => entries.find(item => item.includes('UID:' + event(calendar, key).id + '@'))!
      expect(entries).toHaveLength(count)
      expect(find('christmas')).toContain('DTEND;VALUE=DATE:' + (calendar === current ? '20270102' : '20280101'))
      expect(find('spring-break')).toContain('DTEND;VALUE=DATE:' + (calendar === current ? '20270327' : '20280318'))
      expect(find('last-day')).toContain('CATEGORIES:LAST_DAY,GRADING_PERIOD_END,EARLY_RELEASE')
      expect(find('last-day')).toContain('SUMMARY:Last Day for Students - Early Dismissal')
      expect(find('grading-period-2-end')).toContain('CATEGORIES:GRADING_PERIOD_END,EARLY_RELEASE')
      expect(find('last-day')).toContain('DTEND;VALUE=DATE:' + (calendar === current ? '20270528' : '20280527'))
      expect(entries.filter(item => item.includes('CATEGORIES:LAST_DAY'))).toHaveLength(1)
      if (calendar === current) {
        expect(find('report_card-2027-03-31')).toContain('DTSTART;VALUE=DATE:20270331')
        expect(find('spring-return')).not.toContain('REPORT_CARD')
        expect(find('early-dismissal-2027-04-23')).toContain('Elementary schools')
        expect(find('early-dismissal-2027-04-23')).toContain('CATEGORIES:EARLY_RELEASE,PROGRESS_REPORT')
      }
    }
  })
})
