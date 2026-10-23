import { readFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CalendarEventsTable from '../../app/components/calendar/CalendarEventsTable.vue'
import MonthlyCalendar from '../../app/components/calendar/MonthlyCalendar.vue'
import type { DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/citrus-county-school-district.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
import { groupCalendarEvents } from '../../shared/utils/calendarEventDisplay.mjs'
// @ts-ignore Dependency-free publication checker.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord
const calendar = record.schoolYears['2026-2027']!
const event = (key: string) => calendar.events.find(item => item.id === 'citrus-2026-2027-' + key)!
function weekdays(start: string, end: string) {
  const dates: string[] = []
  for (const cursor = new Date(start + 'T00:00:00Z'); cursor <= new Date(end + 'T00:00:00Z'); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (![0, 6].includes(cursor.getUTCDay())) dates.push(cursor.toISOString().slice(0, 10))
  }
  return dates
}
function datesFor(ids: string[]) {
  return new Set(ids.flatMap(id => {
    const item = calendar.events.find(item => item.id === id)!
    return weekdays(item.dateStart!, item.dateEnd || item.dateStart!)
  }))
}

describe('Citrus 2026-2027 student calendar', () => {
  it('publishes the approved Florida calendar with verified sources and no future placeholders', () => {
    expect(record.district).toMatchObject({ id: 'FL-09', timeZone: 'America/New_York' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027'])
    expect(calendar).toMatchObject({ status: 'official', approvedAt: '2025-12-09', firstDay: '2026-08-10', lastDay: '2027-05-27' })
    expect(calendar.sources[0]).toMatchObject({ printedBoardApprovalDate: '2025-12-09', contentHash: 'sha256:74c28b10745890650222e62886d8f52f8d7a33007ec1bc2aecafe512ce5834dd' })
    expect(auditRecords([{ filename: record.district.slug + '.json', record }])).toEqual([])
  })

  it('reads diagonal early-dismissal markers as attendance even on conference and teacher-work dates', () => {
    const early = calendar.events.filter(item => hasEventType(item, 'EARLY_RELEASE'))
    expect(early.map(item => item.dateStart)).toEqual(['2026-09-23', '2026-10-16', '2026-10-28', '2026-11-18', '2027-02-24', '2027-03-17', '2027-04-21'])
    expect(early.every(item => item.schoolStatus === 'early-dismissal' && item.countsAsStudentAttendanceDay)).toBe(true)
    expect(hasEventType(event('early-release-2026-09-23'), 'PARENT_CONFERENCE')).toBe(true)
    expect(event('early-release-2026-09-23').gradeScope).toBeUndefined()
    expect(hasEventType(event('early-release-2026-10-16'), 'GRADING_PERIOD_END')).toBe(true)
    for (const item of early.slice(0, 4)) {
      if (item.dateStart! <= '2026-10-16') {
        expect(item.note).toContain('The approved calendar lists')
        expect(item.note).toContain('first-priority')
        expect(item.note).toContain('possible full-day')
      } else expect(item.note).toMatch(/extended to a full (?:school )?day/)
      expect(item.mayBecomeAttendanceDay).toBeUndefined()
    }
    expect(event('april-workday')).toMatchObject({ schoolStatus: 'no-classes', countsAsStudentAttendanceDay: false })
    expect(event('veterans-day')).toMatchObject({ schoolStatus: 'schools-closed', dateStart: '2026-11-11' })
  })

  it('makes only the five expressly reserved holiday weekdays conditional', () => {
    const confirmed = datesFor(calendar.confirmedNoSchoolDayEventIds!)
    const conditional = datesFor(calendar.conditionalNoSchoolDayEventIds!)
    expect([...conditional]).toEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-12-21', '2026-12-22'])
    expect(confirmed.size).toBe(24)
    for (const date of conditional) expect(confirmed.has(date)).toBe(false)
    for (const id of calendar.conditionalNoSchoolDayEventIds!) {
      const item = calendar.events.find(item => item.id === id)!
      expect(item).toMatchObject({ schoolStatus: 'schools-closed', scheduledAsNoSchool: true, mayBecomeAttendanceDay: true, countsAsStudentAttendanceDayUnderPublishedSchedule: false })
      expect(item.countsAsStudentAttendanceDay).toBeUndefined()
      expect(hasEventType(item, 'MAKEUP_DAY')).toBe(true)
    }
    expect(event('thanksgiving-remainder')).toMatchObject({ dateStart: '2026-11-26', dateEnd: '2026-11-29', dateBasis: 'derived' })
    expect(event('christmas-december-remainder')).toMatchObject({ dateStart: '2026-12-23', dateEnd: '2026-12-31', dateBasis: 'derived' })
    expect(event('christmas-january')).toMatchObject({ dateStart: '2027-01-01', dateEnd: '2027-01-03', dateBasis: 'official' })
  })

  it('verifies each continuous break while qualifying the two conditional vacation windows', () => {
    const closed = new Set([...datesFor(calendar.confirmedNoSchoolDayEventIds!), ...datesFor(calendar.conditionalNoSchoolDayEventIds!)])
    for (const span of calendar.breaks) {
      for (const date of weekdays(span.dateStart, span.dateEnd)) expect(closed.has(date)).toBe(true)
      expect(closed.has(span.nextStudentAttendanceDate!)).toBe(false)
    }
    expect(calendar.breaks.slice(0, 2).map(span => span.schoolWeekdaysOff)).toEqual([null, null])
    expect(calendar.breaks[1]).toMatchObject({ dateStart: '2026-12-19', dateEnd: '2027-01-06', nextStudentAttendanceDate: '2027-01-07', nextStudentAttendanceDateBasis: 'official' })
    expect(calendar.breaks[2]).toMatchObject({ dateStart: '2027-03-20', dateEnd: '2027-03-29', lastStudentAttendanceDate: '2027-03-19', nextStudentAttendanceDate: '2027-03-30', nextStudentAttendanceDateBasis: 'derived', schoolWeekdaysOff: 6 })
    expect(event('spring-break')).toMatchObject({ dateStart: '2027-03-20', dateEnd: '2027-03-28', dateBasis: 'official' })
    expect(event('easter-monday').dateStart).toBe('2027-03-29')
  })

  it('keeps senior and graduation scope separate from the district final day and avoids invented early releases', () => {
    expect(event('senior-last-day')).toMatchObject({ dateStart: '2027-05-21', gradeScope: 'Grade 12 graduating seniors' })
    expect(event('senior-last-day').isFinalStudentDate).toBeUndefined()
    const last = event('last-day')
    expect(calendar.events.filter(item => item.dateStart === '2027-05-27')).toEqual([last])
    expect(last.eventTypes).toEqual(['LAST_DAY', 'GRADING_PERIOD_END', 'SCHOOL_MILESTONE'])
    expect(last.gradeScope).toBeUndefined()
    expect(last).toMatchObject({ schoolStatus: 'schools-open', countsAsStudentAttendanceDay: true })
    for (const key of ['quarter-2-end', 'quarter-3-end', 'last-day']) expect(hasEventType(event(key), 'EARLY_RELEASE')).toBe(false)
    for (const item of calendar.events.filter(item => item.eventType === 'SCHOOL_MILESTONE')) {
      expect(item.schoolStatus).toBe('not-applicable')
      expect(item.gradeScope).toContain('graduating students')
      expect(item.countsAsStudentAttendanceDay).toBeUndefined()
    }
    expect(calendar.events.some(item => item.dateStart! < calendar.firstDay! || item.dateStart! > calendar.lastDay!)).toBe(false)
    expect(calendar.events.some(item => hasEventType(item, 'EMERGENCY_CLOSURE'))).toBe(false)
  })

  it('calculates the non-senior baseline without presenting it as a printed annual total', () => {
    expect(weekdays(calendar.firstDay!, calendar.lastDay!)).toHaveLength(209)
    expect(209 - datesFor(calendar.confirmedNoSchoolDayEventIds!).size - datesFor(calendar.conditionalNoSchoolDayEventIds!).size).toBe(180)
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
    expect(calendar.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value: '180 days', basis: 'derived' })
    expect(calendar.statistics.find(item => item.id === 'total-no-school-weekdays')).toMatchObject({ value: '24 weekdays', label: 'Confirmed non-conditional no-school weekdays' })
    expect(calendar.statistics.find(item => item.id === 'early-release-days')?.value).toBe('7 dates')
    expect(calendar.calendarScope).toContain('other than graduating seniors')
    expect(calendar.faqs.find(item => item.question.startsWith('How many student attendance days'))?.answer).toContain('not an annual total published in the official PDF')
  })

  it('retains school-specific bell exceptions and the separate college attendance calendar', () => {
    expect(calendar.schoolHours).toHaveLength(6)
    const hours = calendar.schoolHours as Array<{ scope: string; regularHours: string; earlyReleaseHours: string; sourceId: string }>
    expect(hours.find(item => item.scope === 'Lecanto Middle School')).toMatchObject({ regularHours: '7:55 a.m.-2:30 p.m.', earlyReleaseHours: '7:55 a.m.-12:30 p.m.' })
    expect(hours.find(item => item.scope.startsWith('Academy'))?.earlyReleaseHours).toBe('7:55 a.m.-12:02 p.m.')
    expect(hours.find(item => item.scope === 'CREST School')?.earlyReleaseHours).toBe('8:45 a.m.-1:15 p.m.')
    expect(hours.every(item => item.sourceId === 'citrus-school-start-times')).toBe(true)
    expect(calendar.excludedCampuses).toContain('Withlacoochee Technical College (regular attendance calendar)')
    expect(event('wtc-graduation').note).toContain('own attendance calendar')
    expect(calendar.faqs.find(item => item.question.startsWith('Does Citrus eSchool'))?.answer).toContain('same calendar')
    expect(new Set(calendar.faqs.map(item => item.question)).size).toBe(34)
  })

  it('exports inclusive source ranges with exclusive subscription ends and no staff-only summer dates', () => {
    const ics = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
    const entries = ics.split('BEGIN:VEVENT').slice(1)
    const entry = (key: string) => entries.find(item => item.includes('UID:citrus-2026-2027-' + key + '@'))!
    expect(entries).toHaveLength(28)
    const thanksgiving = entry('thanksgiving-display')
    expect(thanksgiving).toContain('DTSTART;VALUE=DATE:20261121')
    expect(thanksgiving).toContain('DTEND;VALUE=DATE:20261130')
    expect(thanksgiving).toContain('2026-11-23 through 2026-11-25')
    expect(thanksgiving).toContain('after extending the four fall early-dismissal days')
    const christmas = entry('christmas-display')
    expect(christmas).toContain('DTSTART;VALUE=DATE:20261219')
    expect(christmas).toContain('DTEND;VALUE=DATE:20270104')
    expect(christmas).toContain('2026-12-21 through 2026-12-22')
    expect(christmas).toContain("third in the district's weather make-up order")
    expect(christmas).toContain('January 4-6')
    expect(christmas).toContain('return January 7')
    expect(ics.match(/SUMMARY:Thanksgiving Break\r?\n/g)).toHaveLength(1)
    expect(ics.match(/SUMMARY:Christmas Break\r?\n/g)).toHaveLength(1)
    for (const group of calendar.eventDisplayGroups!) for (const id of group.eventIds) {
      expect(ics).not.toContain('UID:' + id + '@')
    }
    expect(entry('january-workdays')).toContain('DTEND;VALUE=DATE:20270106')
    expect(entry('spring-break')).toContain('DTEND;VALUE=DATE:20270329')
    expect(entry('easter-monday')).toContain('DTEND;VALUE=DATE:20270330')
    expect(entry('last-day')).toContain('DTEND;VALUE=DATE:20270528')
    expect(entry('last-day')).toContain('Lecanto High Graduation')
    expect(entry('last-day')).toContain('CATEGORIES:LAST_DAY,GRADING_PERIOD_END,SCHOOL_MILESTONE')
    expect(entries.filter(item => item.includes('DTSTART;VALUE=DATE:20270527'))).toHaveLength(1)
    expect(ics).not.toContain('DTSTART;VALUE=DATE:20270528')
    expect(ics).not.toContain('DTSTART;VALUE=DATE:20261009')
  })

  it('groups holiday lists while keeping conditional dates, staff days and graduation scope distinct', () => {
    const before = JSON.stringify(calendar.events)
    const props = { events: calendar.events, eventDisplayGroups: calendar.eventDisplayGroups, districtName: record.district.name }
    const table = mount(CalendarEventsTable, { props: { ...props, schoolYear: calendar.schoolYear } })
    const rows = table.findAll('tbody tr')
    for (const [start, end, name, warning] of [
      ['2026-11-21', '2026-11-29', 'Thanksgiving Break', 'November 23-25'],
      ['2026-12-19', '2027-01-03', 'Christmas Break', 'December 21-22'],
    ]) {
      const matching = rows.filter(row => row.find('time').attributes('datetime') === start)
      expect(matching).toHaveLength(1)
      const row = matching[0]!
      expect(row.findAll('time').map(time => time.attributes('datetime'))).toEqual([start, end])
      expect(row.text()).toContain(name)
      expect(row.text()).toContain(warning)
      expect(row.find('.badge--conditional').text()).toContain('possible weather make-up dates')
      expect(row.find('.badge--closed').exists()).toBe(false)
    }
    const final = rows.filter(row => row.find('time').attributes('datetime') === '2027-05-27')
    expect(final).toHaveLength(1)
    expect(final[0]!.text()).toContain('Lecanto High School graduation')
    expect(final[0]!.text()).toContain('Lecanto High Graduation (school-specific ceremony)')
    expect(final[0]!.text()).toContain('ceremony is specific to that school')
    expect(final[0]!.find('.badge--early-release').exists()).toBe(false)
    table.unmount()

    const monthly = mount(MonthlyCalendar, { props: { ...props, firstDay: calendar.firstDay, lastDay: calendar.lastDay } })
    const listed = monthly.findAll('.month-event-list li')
    for (const start of ['2026-11-21', '2026-12-19']) {
      expect(listed.filter(row => row.find('time').attributes('datetime') === start)).toHaveLength(1)
    }
    for (const fragment of ['2026-11-23', '2026-11-26', '2026-12-21', '2026-12-23', '2027-01-01']) {
      expect(listed.some(row => row.find('time').attributes('datetime') === fragment)).toBe(false)
    }
    expect(listed.some(row => row.find('time').attributes('datetime') === '2027-01-04')).toBe(true)
    for (const date of ['2026-11-23', '2026-11-24', '2026-11-25', '2026-12-21', '2026-12-22']) {
      const day = monthly.find('time[datetime="' + date + '"]').element.closest('td')!
      expect(day.classList.contains('month-day--conditional')).toBe(true)
      expect(day.classList.contains('month-day--school-day')).toBe(false)
      expect(monthly.find('#month-day-tooltip-' + date).text()).toContain('Scheduled day off; possible weather make-up')
    }
    for (const date of ['2026-11-26', '2026-12-23', '2027-01-01']) {
      const day = monthly.find('time[datetime="' + date + '"]').element.closest('td')!
      expect(day.classList.contains('month-day--conditional')).toBe(false)
    }
    expect(monthly.find('#month-day-tooltip-2027-05-27').text()).toContain('ceremony is specific to that school')
    monthly.unmount()
    expect(JSON.stringify(calendar.events)).toBe(before)
  })

  it('includes the compound last day in a school-milestone view without duplicating or narrowing attendance', () => {
    const milestones = calendar.events.filter(item => hasEventType(item, 'SCHOOL_MILESTONE'))
    expect(milestones).toHaveLength(5)
    const wrapper = mount(CalendarEventsTable, { props: {
      events: milestones, districtName: record.district.name, schoolYear: calendar.schoolYear,
    } })
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(5)
    const last = rows.filter(row => row.find('time').attributes('datetime') === '2027-05-27')
    expect(last).toHaveLength(1)
    expect(last[0]!.text()).toContain('Last Day for Students')
    expect(last[0]!.text()).toContain('Lecanto High Graduation (school-specific ceremony)')
    expect(event('last-day').schoolStatus).toBe('schools-open')
    expect(event('last-day').gradeScope).toBeUndefined()
    wrapper.unmount()
  })

  it('rejects display groups that would bridge dates or hide student attendance', () => {
    for (const eventIds of [
      [event('thanksgiving-opening-weekend').id, event('thanksgiving-remainder').id],
      [event('first-day').id, event('thanksgiving-reserve').id],
    ]) {
      const clone = structuredClone(record)
      clone.schoolYears['2026-2027']!.eventDisplayGroups = [{ id: 'invalid-display', name: 'Holiday', eventIds, note: 'Unverified grouping.' }]
      expect(auditRecords([{ filename: record.district.slug + '.json', record: clone }]).some(
        (issue: { code: string }) => issue.code === 'INVALID_EVENT_DISPLAY_GROUP',
      )).toBe(true)
      expect(groupCalendarEvents(calendar.events, clone.schoolYears['2026-2027']!.eventDisplayGroups)).toEqual(calendar.events)
    }
  })
})
