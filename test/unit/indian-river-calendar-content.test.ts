import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CalendarSchoolHours, DistrictCalendar, DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/indian-river-county-school-district.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
import { buildDistrictCatalog } from '../../shared/utils/districts'
// @ts-ignore Dependency-free content audit.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord
const current = record.schoolYears['2026-2027'] as DistrictCalendar
const draft = record.schoolYears['2027-2028'] as DistrictCalendar
const on = (calendar: DistrictCalendar, day: string) => calendar.events.find(event => event.dateStart === day)!
function weekdays(start: string, end: string) {
  const result: string[] = []
  for (const d = new Date(start + 'T00:00:00Z'); d <= new Date(end + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    if (![0, 6].includes(d.getUTCDay())) result.push(d.toISOString().slice(0, 10))
  }
  return result
}
const offDates = (calendar: DistrictCalendar, ids = calendar.confirmedNoSchoolDayEventIds!) => new Set(ids.flatMap(id => {
  const event = calendar.events.find(item => item.id === id)!
  return weekdays(event.dateStart!, event.dateEnd || event.dateStart!)
}))

describe('Indian River published calendar and explicitly tentative following year', () => {
  it('distinguishes live publication labels from Draft filenames and separate bell-time approval', () => {
    expect(record.district).toMatchObject({ id: 'FL-31', name: 'School District of Indian River County', timeZone: 'America/New_York' })
    expect(current).toMatchObject({ status: 'official', indexable: true, approvedAt: null, publishedAt: null })
    expect(draft).toMatchObject({ status: 'draft', indexable: false, approvedAt: null, publishedAt: null })
    expect(current.sources[0]!.contentHash).toBe('sha256:44ef189929f8d353ae2dba90c3f1bfed7f23f942230db30382d68475bbb380d4')
    expect(draft.sources[0]!.contentHash).toBe('sha256:8effa465ef6e88e630a6d74d410042f3b7835f0e15505e01812b127190624037')
    expect(draft.sourceDiscrepancies![0]!.effect).toContain('community-feedback')
    expect(draft.events.every(event => event.status === 'proposed')).toBe(true)
    expect(draft.actions.staticIcsUrl).toBeNull()
    expect(existsSync('public/ics/indian-river-county-school-district-2027-2028.ics')).toBe(false)
    expect(buildDistrictCatalog([record]).counts.indexableCalendars).toBe(1)
    expect(auditRecords([{ filename: record.district.slug + '.json', record }])).toEqual([])
  })

  it('reconciles both dated schedules to their printed quarter subtotals without labeling an annual figure official', () => {
    const cases = [
      [current, 210, 32, ['2026-10-09', '2026-12-18', '2027-03-12', '2027-05-28'], [43, 42, 44, 49]],
      [draft, 209, 31, ['2027-10-08', '2027-12-17', '2028-03-10', '2028-05-26'], [43, 41, 45, 49]],
    ] as const
    for (const [calendar, total, closures, ends, counts] of cases) {
      const off = offDates(calendar)
      expect(weekdays(calendar.firstDay!, calendar.lastDay!)).toHaveLength(total)
      expect(off.size).toBe(closures)
      expect(total - closures).toBe(178)
      let start = calendar.firstDay!
      ends.forEach((end, i) => {
        expect(weekdays(start, end).filter(day => !off.has(day))).toHaveLength(counts[i]!)
        start = new Date(new Date(end).valueOf() + 86400000).toISOString().slice(0, 10)
      })
      expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
      expect(calendar.conditionalNoSchoolDayEventIds).toEqual([])
    }
    expect(current.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value: '178 days', basis: 'derived' })
    expect(draft.statistics).toEqual([])
    expect(on(draft, '2027-08-10')).toMatchObject({ dateBasis: 'official', officialLabel: 'Student First/Last Day', schoolStatus: 'schools-open' })
    expect(on(draft, '2027-08-10').note).toContain('orange')
  })

  it('covers each continuous break weekday and keeps separate January closure meanings', () => {
    expect(current.breaks.map(span => [span.dateStart, span.dateEnd, span.nextStudentAttendanceDate])).toEqual([
      ['2026-11-21', '2026-11-29', '2026-11-30'],
      ['2026-12-19', '2027-01-05', '2027-01-06'],
      ['2027-02-12', '2027-02-15', '2027-02-16'],
      ['2027-03-20', '2027-03-28', '2027-03-29'],
    ])
    expect(draft.breaks.map(span => [span.dateStart, span.dateEnd, span.nextStudentAttendanceDate])).toEqual([
      ['2027-11-20', '2027-11-28', '2027-11-29'],
      ['2027-12-18', '2028-01-04', '2028-01-05'],
      ['2028-02-18', '2028-02-21', '2028-02-22'],
      ['2028-03-18', '2028-03-26', '2028-03-27'],
    ])
    for (const calendar of [current, draft]) {
      const off = offDates(calendar)
      for (const span of calendar.breaks) {
        expect([...offDates(calendar, span.componentEventIds!)].sort()).toEqual(weekdays(span.dateStart, span.dateEnd))
        expect(off.has(span.lastStudentAttendanceDate!)).toBe(false)
        expect(off.has(span.nextStudentAttendanceDate!)).toBe(false)
      }
      expect(calendar.breaks[1]).toMatchObject({ schoolWeekdaysOff: 12, nextStudentAttendanceDateBasis: 'official' })
      expect(on(calendar, calendar.breaks[1]!.nextStudentAttendanceDate!).countsAsStudentAttendanceDay).toBe(true)
    }
    expect(current.sourceDiscrepancies![0]).toMatchObject({ field: 'writtenWinterBreakEndYear', captionDate: '2026-01-01', gridDate: '2027-01-01', resolution: 'source-conflict' })
    expect(on(current, '2026-12-21').dateEnd).toBe('2026-12-31')
    expect(on(current, '2027-01-01').eventType).toBe('WINTER_BREAK')
    expect(on(current, '2027-01-04').schoolStatus).toBe('no-classes')
    expect(on(draft, '2028-01-03').eventType).toBe('WINTER_BREAK')
    expect(on(draft, '2028-01-04').schoolStatus).toBe('no-classes')
  })

  it('does not bridge normal school weeks or transfer closures between years', () => {
    const currentOff = offDates(current)
    const draftOff = offDates(draft)
    for (const day of weekdays('2026-10-26', '2026-10-29').concat(weekdays('2027-03-15', '2027-03-19'))) expect(currentOff.has(day)).toBe(false)
    for (const day of weekdays('2028-03-13', '2028-03-17')) expect(draftOff.has(day)).toBe(false)
    expect(currentOff.has('2026-11-11')).toBe(true)
    expect(draftOff.has('2027-11-11')).toBe(false)
    expect(draftOff.has('2027-11-12')).toBe(true)
    expect(draftOff.has('2027-09-21')).toBe(false)
    expect(draftOff.has('2027-10-11')).toBe(true)
    expect(draft.events.some(event => event.dateStart === '2028-01-28' || event.dateStart === '2028-01-29')).toBe(false)
  })

  it('keeps five modified dates as attendance with conditional clocks and one final-day occurrence', () => {
    for (const [calendar, dates] of [[current, ['2026-12-17', '2026-12-18', '2027-05-26', '2027-05-27', '2027-05-28']], [draft, ['2027-12-16', '2027-12-17', '2028-05-24', '2028-05-25', '2028-05-26']]] as const) {
      const modified = calendar.events.filter(event => hasEventType(event, 'MODIFIED_DAY'))
      expect(modified.map(event => event.dateStart)).toEqual(dates)
      for (const event of modified) {
        expect(event).toMatchObject({ schoolStatus: 'modified-schedule', countsAsStudentAttendanceDay: true, scheduleType: 'MODIFIED_DAY' })
        expect(calendar.confirmedNoSchoolDayEventIds).not.toContain(event.id)
        expect(event.mayBecomeAttendanceDay).toBeUndefined()
        expect(event.note).toContain('emergency make-up')
      }
      expect(calendar.events.filter(event => event.dateStart === calendar.lastDay)).toHaveLength(1)
      expect(on(calendar, calendar.lastDay!)).toMatchObject({ isFinalStudentDate: true, finalStudentDateBasis: 'official' })
      expect(hasEventType(on(calendar, calendar.lastDay!), 'GRADING_PERIOD_END')).toBe(true)
      expect(calendar.events.some(event => hasEventType(event, 'SEMESTER_END') || hasEventType(event, 'MAKEUP_DAY'))).toBe(false)
    }
    expect(current.events.filter(event => hasEventType(event, 'EARLY_RELEASE'))).toHaveLength(5)
    expect(on(current, current.lastDay!).eventTypesBasis?.EARLY_RELEASE).toBe('derived')
    expect(on(current, current.lastDay!).scheduleSourceId).toBe('indian-river-2026-2027-parent-guide')
    expect(draft.events.some(event => hasEventType(event, 'EARLY_RELEASE'))).toBe(false)
    expect(current.statistics.find(item => item.id === 'early-release-days')?.explanation).toContain('IRPrep and Wabasso')
  })

  it('scopes family milestones and excludes pre/post-year staff work', () => {
    for (const [calendar, orientation, fall, spring] of [
      [current, ['2026-08-05', '2026-08-06', '2026-08-07'], ['2026-10-20', '2026-10-21', '2026-10-22'], ['2027-02-09', '2027-02-10', '2027-02-11']],
      [draft, ['2027-08-05', '2027-08-06', '2027-08-09'], ['2027-10-19', '2027-10-20', '2027-10-21'], ['2028-02-15', '2028-02-16', '2028-02-17']],
    ] as const) {
      expect(calendar.events.filter(event => event.name.endsWith('Orientation')).map(event => event.dateStart)).toEqual(orientation)
      expect(calendar.events.filter(event => hasEventType(event, 'PARENT_CONFERENCE')).map(event => event.dateStart)).toEqual([...fall, ...spring])
      expect(calendar.events.filter(event => hasEventType(event, 'BACK_TO_SCHOOL_NIGHT'))).toHaveLength(3)
      for (const event of calendar.events.filter(event => event.gradeScope)) {
        expect(event.schoolStatus).toBe('not-applicable')
        expect(event.countsAsStudentAttendanceDay).toBeUndefined()
        expect(event.participantScope).toContain('families')
      }
      expect(calendar.events.some(event => event.dateStart! > calendar.lastDay!)).toBe(false)
      expect(calendar.events.some(event => /Memorial|FTE|post.?planning|Teacher planning day/i.test(event.name))).toBe(false)
    }
    expect(current.events).toHaveLength(40)
    expect(draft.events).toHaveLength(38)
  })

  it('uses only the year-specific guide for clocks and preserves report-card dates and distinct parent answers', () => {
    const rows = current.schoolHours as CalendarSchoolHours[]
    expect(rows).toHaveLength(5)
    expect(rows.map(row => row.regularHours)).toEqual(['9:00 a.m.-3:40 p.m. Eastern Time', '8:10 a.m.-2:51 p.m. Eastern Time', '7:20 a.m.-2:07 p.m. Eastern Time', '9:00 a.m.-3:40 p.m. Eastern Time', '8:30 a.m.-2:45 p.m. Eastern Time'])
    expect(rows.slice(0, 3).map(row => row.earlyReleaseHours)).toEqual(['9:00 a.m.-1:50 p.m. Eastern Time', '8:10 a.m.-1:00 p.m. Eastern Time', '7:20 a.m.-12:20 p.m. Eastern Time'])
    for (const row of rows.slice(3)) expect(row.earlyReleaseHours).toBeUndefined()
    expect(current.sources.find(source => source.id === rows[0]!.sourceId)?.contentHash).toBe('sha256:bcca83790120cff715863fb3ee19bbdbc6d769aa8eb663b1293ab6eba58a7665')
    expect(draft.schoolHours).toEqual([])
    expect(current.events.filter(event => hasEventType(event, 'REPORT_CARD')).map(event => event.dateStart)).toEqual(['2026-10-16', '2027-01-08', '2027-03-19'])
    expect(draft.events.filter(event => hasEventType(event, 'REPORT_CARD')).map(event => event.dateStart)).toEqual(['2027-10-15', '2028-01-07', '2028-03-17'])
    expect(current.faqs).toHaveLength(22)
    expect(draft.faqs).toHaveLength(18)
    for (const calendar of [current, draft]) expect(new Set(calendar.faqs.map(item => item.question)).size).toBe(calendar.faqs.length)
  })

  it('exports exact official closure ranges and multi-type final attendance once, without publishing the draft', () => {
    const ics = readFileSync('public' + current.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
    const entries = ics.split('BEGIN:VEVENT').slice(1)
    const entry = (day: string) => entries.find(text => text.includes('UID:' + on(current, day).id + '@'))!
    expect(entries).toHaveLength(40)
    expect(entry('2026-08-05')).toContain('SUMMARY:Elementary and K-8 School Orientation')
    expect(entry('2026-11-23')).toContain('DTEND;VALUE=DATE:20261128')
    expect(entry('2026-12-21')).toContain('DTEND;VALUE=DATE:20270101')
    expect(entry('2027-01-01')).toContain('DTEND;VALUE=DATE:20270102')
    expect(entry('2027-03-22')).toContain('DTEND;VALUE=DATE:20270327')
    expect(entry('2027-05-28')).toContain('CATEGORIES:LAST_DAY,MODIFIED_DAY,GRADING_PERIOD_END,EARLY_RELEASE')
    expect(entry('2027-05-28')).toContain('dismissal time depends on emergency make-up')
    expect(ics).not.toContain('DTSTART;VALUE=DATE:20270531')
    expect(ics).not.toContain('DTSTART;VALUE=DATE:20270810')
  })
})
