import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DistrictCalendar, DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/charlotte-county-school-district.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
import { buildDistrictCatalog } from '../../shared/utils/districts'
// @ts-ignore Dependency-free publication checker.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord
const traditional = record.schoolYears['2026-2027']!
const yearRound = record.schoolYears['2026-2027-year-round']!
const ehs = record.schoolYears['2026-2027-early-head-start']!
const calendars = [traditional, yearRound, ehs]
const event = (calendar: DistrictCalendar, key: string) => calendar.events.find(item => item.id === `charlotte-2026-2027-${calendar.calendarLabel === 'Traditional' ? 'traditional' : calendar.calendarLabel === 'Year-Round' ? 'year-round' : 'early-head-start'}-${key}`)!

function weekdays(start: string, end: string) {
  const result: string[] = []
  for (const cursor = new Date(start + 'T00:00:00Z'); cursor <= new Date(end + 'T00:00:00Z'); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (![0, 6].includes(cursor.getUTCDay())) result.push(cursor.toISOString().slice(0, 10))
  }
  return result
}

function datesFor(calendar: DistrictCalendar, ids: string[]) {
  return new Set(ids.flatMap(id => {
    const item = calendar.events.find(item => item.id === id)!
    return weekdays(item.dateStart!, item.dateEnd || item.dateStart!)
  }))
}

describe('Charlotte 2026-2027 Traditional, Year-Round and Early Head Start', () => {
  it('publishes three variants of one year with separate routes, scopes and official PDFs', () => {
    expect(record.district).toMatchObject({ id: 'FL-08', name: 'Charlotte County Public Schools', timeZone: 'America/New_York' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027', '2026-2027-year-round', '2026-2027-early-head-start'])
    expect(calendars.map(item => item.schoolYear)).toEqual(['2026-2027', '2026-2027', '2026-2027'])
    expect(calendars.map(item => item.sources[0]?.contentHash)).toEqual([
      'sha256:cefef9d37fa8fe7d6a0fb1bee6a9a6b223566db9d11d7cdcdfda98a1aee3a2e9',
      'sha256:67648056e08df172b32f8fd31032c5570266a3cb7ebd2de06537d1c026bb49e6',
      'sha256:443a358e3c57e2444b0a46db84ad43a3b028470e981050d8d452a8977f50219a',
    ])
    expect(yearRound.campusScope).toEqual(['East Elementary School', 'Sallie Jones Elementary School'])
    expect(traditional.excludedCampuses).toEqual(yearRound.campusScope)
    for (const calendar of calendars) {
      expect(calendar.status).toBe('official')
      expect(calendar.approvedAt).toBeNull()
      expect(calendar.sources.find(item => item.id === 'charlotte-calendar-approval')?.publishedAt).toBe('2025-11-12')
    }
    const catalog = buildDistrictCatalog([record])
    expect(catalog.counts.indexableCalendars).toBe(3)
    expect(new Set(catalog.districts[0]!.calendarPages.map(item => item.href)).size).toBe(3)
    expect(auditRecords([{ filename: record.district.slug + '.json', record }])).toEqual([])
  })

  it('uses only the four green early releases, leaving academic boundaries and final dates separate', () => {
    for (const calendar of calendars) {
      const shortened = calendar.events.filter(item => hasEventType(item, 'EARLY_RELEASE'))
      expect(shortened.map(item => item.dateStart)).toEqual(['2026-09-16', '2026-11-11', '2027-02-24', '2027-03-31'])
      expect(shortened.every(item => item.schoolStatus === 'early-dismissal' && item.countsAsStudentAttendanceDay === true)).toBe(true)
      for (const date of ['2026-12-18', '2027-02-12', '2027-05-28', '2027-06-18']) {
        expect(shortened.some(item => item.dateStart === date)).toBe(false)
      }
      expect(event(calendar, 'early-release-2026-11-11').eventType).toBe('EARLY_RELEASE')
      expect(datesFor(calendar, calendar.confirmedNoSchoolDayEventIds!).has('2026-11-11')).toBe(false)
    }
    expect(event(yearRound, 'second-period-end')).toMatchObject({ dateStart: '2027-02-12', schoolStatus: 'not-applicable' })
    expect(event(traditional, 'first-semester-end').eventTypes).toEqual(['SEMESTER_END', 'GRADING_PERIOD_END'])
  })

  it('keeps each hurricane reserve conditional and preserves variant-specific teacher labels', () => {
    for (const calendar of calendars) {
      expect(calendar.conditionalNoSchoolDayEventIds).toHaveLength(3)
      for (const id of calendar.conditionalNoSchoolDayEventIds!) {
        const item = calendar.events.find(item => item.id === id)!
        expect(item).toMatchObject({ scheduledAsNoSchool: true, mayBecomeAttendanceDay: true, countsAsStudentAttendanceDayUnderPublishedSchedule: false, schoolStatus: 'no-classes' })
        expect(item.countsAsStudentAttendanceDay).toBeUndefined()
        expect(calendar.confirmedNoSchoolDayEventIds).not.toContain(id)
      }
      expect(event(calendar, 'hmu-1').dateStart).toBe('2026-10-12')
      expect(event(calendar, 'hmu-2').dateStart).toBe('2027-01-05')
      expect(event(calendar, 'hmu-3').dateStart).toBe(calendar === yearRound ? '2027-02-16' : '2027-03-12')
      expect(event(calendar, 'winter-december').mayBecomeAttendanceDay).toBeUndefined()
      expect(event(calendar, 'winter-january-1').mayBecomeAttendanceDay).toBeUndefined()
    }
    expect(event(ehs, 'hmu-1').officialLabel).toContain('Teacher Planning Day')
    expect(event(traditional, 'hmu-1').officialLabel).toContain('Prof Day')
    expect(event(yearRound, 'march-day-off')).toMatchObject({ dateStart: '2027-03-12', countsAsStudentAttendanceDay: false })
    expect(event(yearRound, 'march-day-off').mayBecomeAttendanceDay).toBeUndefined()
  })

  it('does not bridge the traditional spring return to the later Good Friday holiday', () => {
    for (const calendar of [traditional, ehs]) {
      expect(event(calendar, 'spring-break')).toMatchObject({ dateStart: '2027-03-15', dateEnd: '2027-03-19', dateBasis: 'official' })
      expect(event(calendar, 'good-friday').dateStart).toBe('2027-03-26')
      const closed = datesFor(calendar, [...calendar.confirmedNoSchoolDayEventIds!, ...calendar.conditionalNoSchoolDayEventIds!])
      for (const date of weekdays('2027-03-22', '2027-03-25')) expect(closed.has(date)).toBe(false)
      expect(calendar.breaks.find(span => span.name === 'March make-up reserve and spring break')).toMatchObject({ schoolWeekdaysOff: null, nextStudentAttendanceDate: '2027-03-22', lastStudentAttendanceDate: null })
    }
    for (const calendar of calendars) {
      const winter = calendar.breaks.find(span => span.name === 'Winter break and January planning days')!
      expect(winter).toMatchObject({ dateStart: '2026-12-21', dateEnd: '2027-01-05', schoolWeekdaysOff: null, nextStudentAttendanceDate: '2027-01-06', nextStudentAttendanceDateBasis: 'official' })
      expect(winter.componentEventIds).toContain(event(calendar, 'hmu-2').id)
      expect(event(calendar, 'winter-december').dateEnd).toBe('2026-12-31')
      expect(event(calendar, 'winter-january-1').dateStart).toBe('2027-01-01')
    }
  })

  it('keeps year-round intersession participation outside guaranteed holiday totals', () => {
    const intersessions = yearRound.events.filter(item => hasEventType(item, 'INTERSESSION'))
    expect(intersessions).toHaveLength(3)
    const dates = datesFor(yearRound, intersessions.map(item => item.id))
    expect(dates.size).toBe(15)
    for (const item of intersessions) {
      expect(item.schoolStatus).toBe('program-specific')
      expect(item.countsAsStudentAttendanceDay).toBe(false)
      expect(item.occursOnRegularInstructionalDay).toBe(false)
      expect(yearRound.confirmedNoSchoolDayEventIds).not.toContain(item.id)
      expect(item.schoolStatusLabel).toBe('No regular classes; check school for program details')
      expect(item.note).toContain('Regular classes pause')
      expect(item.note).not.toContain('does not require every student to attend')
    }
    expect(yearRound.breaks.find(span => span.name.startsWith('Fall intersession'))).toMatchObject({ dateStart: '2026-10-19', dateEnd: '2026-11-03', schoolWeekdaysOff: null, nextStudentAttendanceDate: '2026-11-04' })
    expect(yearRound.breaks.find(span => span.name.startsWith('March day off'))).toMatchObject({ dateStart: '2027-03-12', dateEnd: '2027-03-26', schoolWeekdaysOff: null, nextStudentAttendanceDate: '2027-03-29' })
    for (const date of weekdays('2026-10-13', '2026-10-16')) expect(dates.has(date)).toBe(false)
    expect(yearRound.events.some(item => hasEventType(item, 'INTERSESSION') && item.dateStart === '2026-10-12')).toBe(false)
    expect(yearRound.statistics.find(item => item.id === 'longest-no-school-stretch')).toMatchObject({
      label: 'Longest confirmed no-class stretch outside intersessions', value: '17 consecutive days',
    })
    expect(yearRound.longestBreakStatisticExplanation).toContain('October 17-November 3')
    expect(yearRound.longestBreakStatisticExplanation).toContain('18 calendar days without regular classes')
    expect(yearRound.longestBreakStatisticExplanation).toContain('not counted here as a guaranteed all-student holiday')
    expect(yearRound.statistics.find(item => item.id === 'long-weekends')).toMatchObject({ label: 'Independent long weekends', value: '3', basis: 'derived' })
    expect(yearRound.statistics.find(item => item.id === 'full-week-breaks')).toMatchObject({ label: 'Named full-week breaks (excluding intersessions)', value: '3 breaks', basis: 'derived' })
    const withoutIntersessions = calculateCalendarStatistics({
      ...yearRound, events: yearRound.events.filter(item => !hasEventType(item, 'INTERSESSION')),
    })
    expect(withoutIntersessions.find((item: { id: string }) => item.id === 'long-weekends')?.value).toBe('4')
  })

  it('adds derived year-round regular-class returns without inventing program participation or extra student days', () => {
    const noRegularClasses = datesFor(yearRound, [
      ...yearRound.confirmedNoSchoolDayEventIds!,
      ...yearRound.conditionalNoSchoolDayEventIds!,
      ...yearRound.events.filter(item => hasEventType(item, 'INTERSESSION')).map(item => item.id),
    ])
    for (const [key, date] of [['fall-return', '2026-11-04'], ['spring-return', '2027-03-29']]) {
      const item = event(yearRound, key!)
      expect(item).toMatchObject({ dateStart: date, dateEnd: null, eventType: 'SCHOOL_MILESTONE', basis: 'derived', dateBasis: 'derived', nameBasis: 'derived', schoolStatus: 'schools-open', countsAsStudentAttendanceDay: true })
      expect(noRegularClasses.has(date!)).toBe(false)
      expect(yearRound.events.filter(candidate => candidate.dateStart === date)).toHaveLength(1)
    }
    expect(event(yearRound, 'fall-return').noteSourceIds).toContain('charlotte-sje-fall-return')
    expect(yearRound.statistics.find(item => item.id === 'student-attendance-days')?.value).toBe('180 days')
  })

  it('retains the EHS May caption conflict while using the supported June final date once', () => {
    expect(ehs).toMatchObject({ firstDay: '2026-08-10', lastDay: '2027-06-18', lastDayBasis: 'official' })
    expect(event(ehs, 'may-period-end')).toMatchObject({ dateStart: '2027-05-28', sourceInternalConflict: true, schoolStatus: 'not-applicable' })
    expect(event(ehs, 'may-period-end').officialLabels).toContain('Last Day for Students')
    expect(hasEventType(event(ehs, 'may-period-end'), 'LAST_DAY')).toBe(false)
    expect(ehs.events.filter(item => hasEventType(item, 'LAST_DAY'))).toEqual([event(ehs, 'last-day')])
    expect(event(ehs, 'last-day')).toMatchObject({ dateStart: '2027-06-18', schoolStatus: 'schools-open' })
    expect(ehs.sourceDiscrepancies?.find(item => item.field === 'lastDay label')?.effect).toContain('193')
    const off = datesFor(ehs, ehs.confirmedNoSchoolDayEventIds!)
    expect(off.has('2027-05-31')).toBe(true)
    expect(off.has('2027-06-01')).toBe(true)
    for (const date of weekdays('2027-06-02', '2027-06-18')) expect(off.has(date)).toBe(false)
    expect(weekdays('2027-06-02', '2027-06-18')).toHaveLength(13)
    expect(traditional.events.some(item => item.dateStart! > traditional.lastDay!)).toBe(false)
    expect(yearRound.events.some(item => item.dateStart! > yearRound.lastDay!)).toBe(false)
  })

  it('reconciles printed baseline days without counting conditional dates or intersessions as regular attendance', () => {
    for (const [calendar, confirmed, total, published] of [[traditional, 27, 210, 180], [yearRound, 29, 227, 180], [ehs, 29, 225, 193]] as Array<[DistrictCalendar, number, number, number]>) {
      const off = datesFor(calendar, calendar.confirmedNoSchoolDayEventIds!)
      const reserves = datesFor(calendar, calendar.conditionalNoSchoolDayEventIds!)
      const inter = datesFor(calendar, calendar.events.filter(item => hasEventType(item, 'INTERSESSION')).map(item => item.id))
      expect(weekdays(calendar.firstDay!, calendar.lastDay!)).toHaveLength(total)
      expect(off.size).toBe(confirmed)
      expect(total - new Set([...off, ...reserves, ...inter]).size).toBe(published)
      expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
      expect(calendar.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value: published + ' days', basis: 'official' })
      expect(calendar.statistics.find(item => item.id === 'early-release-days')?.value).toBe('4 dates')
    }
  })

  it('scopes verified bell times to schools and never copies them or care hours into Early Head Start', () => {
    expect(ehs.schoolHours).toEqual([])
    expect(yearRound.schoolHours).toEqual([
      expect.objectContaining({ scope: 'East Elementary', regularHours: '8:40 a.m.-3:10 p.m.', earlyReleaseHours: '2 hours before regular dismissal' }),
      expect.objectContaining({ scope: 'Sallie Jones Elementary', regularHours: '8:20 a.m.-2:50 p.m.', earlyReleaseHours: '2 hours before regular dismissal' }),
    ])
    expect(traditional.schoolHours).toHaveLength(6)
    expect(JSON.stringify(traditional.schoolHours)).not.toContain('Sallie Jones')
    expect(ehs.faqs.find(item => item.question === 'What time does Early Head Start dismiss children on early-release days?')?.answer).toContain('should not be assumed to apply to Early Head Start')
    for (const calendar of calendars) expect(calendar.events.some(item => /\b(?:FTE|survey|preplanning|summer school)\b/i.test(item.name))).toBe(false)
  })

  it('exports three independent subscriptions with exclusive end dates and canonical final occurrences', () => {
    const counts = [24, 30, 27]
    for (const [index, calendar] of calendars.entries()) {
      const ics = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
      const entries = ics.split('BEGIN:VEVENT').slice(1)
      const find = (key: string) => entries.find(item => item.includes('UID:' + event(calendar, key).id + '@'))!
      expect(entries).toHaveLength(counts[index]!)
      expect(ics).toContain('X-WR-CALNAME:Charlotte County Schools 2026-2027 ' + calendar.calendarLabel)
      expect(find('winter-december')).toContain('DTEND;VALUE=DATE:20270101')
      expect(find('spring-break')).toContain('DTEND;VALUE=DATE:20270320')
      expect(find('hmu-2')).toContain('If needed')
      expect(find('hmu-2')).toContain('attendance may change')
      expect(find('last-day')).toContain('DTSTART;VALUE=DATE:' + (calendar === ehs ? '20270618' : '20270528'))
      expect(entries.filter(item => item.includes('CATEGORIES:LAST_DAY'))).toHaveLength(1)
      expect(ics).not.toMatch(/SUMMARY:.*(?:FTE|Survey Week)/)
    }
    const yearIcs = readFileSync('public' + yearRound.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
    const fall = yearIcs.split('BEGIN:VEVENT').find(item => item.includes('UID:' + event(yearRound, 'fall-intersession').id + '@'))!
    expect(fall).toContain('DTEND;VALUE=DATE:20261031')
    expect(yearIcs).toContain('DTSTART;VALUE=DATE:20261102')
    for (const key of ['fall-return', 'spring-return']) {
      const returned = yearIcs.split('BEGIN:VEVENT').find(item => item.includes('UID:' + event(yearRound, key).id + '@'))!
      expect(returned).toContain('CATEGORIES:SCHOOL_MILESTONE')
      expect(returned).toContain('Calculated from calendar: these dates are grouped or inferred from published entries.')
    }
  })
})
