import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CalendarSchoolHours, DistrictCalendar, DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/holmes-county-school-district.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore Dependency-free content audit.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord
const calendar = record.schoolYears['2026-2027'] as DistrictCalendar
const on = (day: string) => calendar.events.find(event => event.dateStart === day)!
function weekdays(start: string, end: string) {
  const dates: string[] = []
  for (const day = new Date(start + 'T00:00:00Z'); day <= new Date(end + 'T00:00:00Z'); day.setUTCDate(day.getUTCDate() + 1)) {
    if (![0, 6].includes(day.getUTCDay())) dates.push(day.toISOString().slice(0, 10))
  }
  return dates
}
const offDates = (ids: string[]) => new Set(ids.flatMap(id => {
  const event = calendar.events.find(item => item.id === id)!
  return weekdays(event.dateStart!, event.dateEnd || event.dateStart!)
}))

describe('Holmes paired approved calendars, May endpoint and student-only planning', () => {
  it('keeps the current complete color/written sources and printed approval distinct from metadata dates', () => {
    expect(record.district).toMatchObject({ id: 'FL-30', timeZone: 'America/Chicago', name: 'Holmes District Schools' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027'])
    expect(calendar).toMatchObject({ approvedAt: '2026-01-27', printedBoardApprovalDate: '2026-01-27', publishedAt: null, lastOfficialRevisionAt: null })
    expect(calendar.sources[0]).toMatchObject({ contentHash: 'sha256:9415d7e6ccbe394da02ec69ad63d30838d1aad89d6686b07572fd48364ac7710', printedBoardApprovalDate: '2026-01-27' })
    expect(calendar.sources[1]).toMatchObject({ contentHash: 'sha256:06d27d12358e5793380eaf5b687d5660d7566849180cc71e66490627263c90cc', printedBoardApprovalDate: '2026-01-27' })
    expect(calendar.actions.officialPdfUrl).toContain('73483810-99B8-4B67-996B-3BA3A17CAC30')
    // Reviewed overlap: the date overview and ceremony time/location lookup
    // answer separate parent questions despite sharing district/school words.
    expect(auditRecords([{ filename: record.district.slug + '.json', record }])).toEqual([{
      severity: 'warning',
      code: 'SIMILAR_FAQ_INTENT',
      path: 'server/data/districts/records/holmes-county-school-district.json.schoolYears.2026-2027.faqs[29].question',
      message: 'May overlap FAQ #25 (83% token similarity).',
    }])
  })

  it('resolves the inconsistent May 28 summary endpoint to the corroborated May 27 last student date', () => {
    expect(calendar.lastDay).toBe('2027-05-27')
    expect(on('2027-05-27')).toMatchObject({ eventTypes: ['LAST_DAY', 'EARLY_RELEASE', 'GRADING_PERIOD_END', 'SEMESTER_END'], schoolStatus: 'early-dismissal', countsAsStudentAttendanceDay: true })
    expect(calendar.events.some(item => item.dateStart === '2027-05-28')).toBe(false)
    expect(calendar.sourceDiscrepancies).toHaveLength(1)
    expect(calendar.sourceDiscrepancies![0]).toMatchObject({ field: 'fourthQuarterRangeEnd', gridDate: '2027-05-27', captionDate: '2027-05-27', resolution: 'source-conflict' })
    expect(calendar.sourceDiscrepancies![0]!.effect).toContain('summary table prints a May 28')
    expect(calendar.sourceDiscrepancies![0]!.effect).toContain('44-day quarter count')
    expect(calendar.attendanceUncertaintyDates).toBeUndefined()
  })

  it('reconciles the derived 180 annual dates with the printed quarter and semester subtotals', () => {
    const off = offDates(calendar.confirmedNoSchoolDayEventIds!)
    expect(weekdays(calendar.firstDay!, calendar.lastDay!)).toHaveLength(207)
    expect(off.size).toBe(27)
    expect(calendar.conditionalNoSchoolDayEventIds).toEqual([])
    const quarters = [['2026-08-12', '2026-10-09', 41], ['2026-10-12', '2026-12-18', 43], ['2027-01-05', '2027-03-19', 52], ['2027-03-29', '2027-05-27', 44]] as const
    for (const [start, end, count] of quarters) expect(weekdays(start, end).filter(day => !off.has(day))).toHaveLength(count)
    expect(quarters[0][2] + quarters[1][2]).toBe(84)
    expect(quarters[2][2] + quarters[3][2]).toBe(96)
    expect(weekdays('2027-03-29', '2027-05-28')).toHaveLength(45)
    expect(calendar.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value: '180 days', basis: 'derived' })
    expect(calendar.highlights.find(item => item.label === 'Student days')).toMatchObject({ calculationMethod: 'sum-published-semester-days', basis: 'derived' })
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
    expect(calendar.events.some(item => item.mayBecomeAttendanceDay || hasEventType(item, 'MAKEUP_DAY'))).toBe(false)
  })

  it('validates complete break spans, preserving the student January 4 holiday and explicit returns', () => {
    expect(calendar.breaks.map(item => [item.dateStart, item.dateEnd, item.nextStudentAttendanceDate, item.schoolWeekdaysOff])).toEqual([
      ['2026-10-02', '2026-10-04', '2026-10-05', 1],
      ['2026-10-29', '2026-11-01', '2026-11-02', 2],
      ['2026-11-21', '2026-11-29', '2026-11-30', 5],
      ['2026-12-19', '2027-01-04', '2027-01-05', 11],
      ['2027-03-20', '2027-03-28', '2027-03-29', 5],
    ])
    const off = offDates(calendar.confirmedNoSchoolDayEventIds!)
    for (const span of calendar.breaks) {
      expect([...offDates(span.componentEventIds!)].sort()).toEqual(weekdays(span.dateStart, span.dateEnd))
      expect(off.has(span.lastStudentAttendanceDate!)).toBe(false)
      expect(off.has(span.nextStudentAttendanceDate!)).toBe(false)
    }
    expect(on('2026-12-21').dateEnd).toBe('2027-01-04')
    expect(calendar.events.some(item => item.dateStart === '2027-01-04')).toBe(false)
    for (const index of [1, 3, 4]) expect(calendar.breaks[index]!.nextStudentAttendanceDateBasis).toBe('official')
    expect(on('2026-11-02').schoolStatus).toBe('schools-open')
    expect(on('2027-01-05').countsAsStudentAttendanceDay).toBe(true)
    expect(on('2027-03-29').countsAsStudentAttendanceDay).toBe(true)
  })

  it('retains quarter starts and four early releases without duplicating final-day meanings or adding employee dates', () => {
    expect(calendar.events.filter(item => hasEventType(item, 'GRADING_PERIOD_START')).map(item => item.dateStart)).toEqual(['2026-08-12', '2026-10-12', '2027-01-05', '2027-03-29'])
    const early = calendar.events.filter(item => hasEventType(item, 'EARLY_RELEASE'))
    expect(early.map(item => item.dateStart)).toEqual(['2026-10-28', '2026-12-18', '2027-03-19', '2027-05-27'])
    for (const event of early) {
      expect(event.countsAsStudentAttendanceDay).toBe(true)
      expect(calendar.confirmedNoSchoolDayEventIds).not.toContain(event.id)
    }
    expect(hasEventType(on('2026-10-09'), 'EARLY_RELEASE')).toBe(false)
    expect(calendar.events.filter(item => item.dateStart === '2027-05-27')).toHaveLength(1)
    expect(calendar.events.every(item => item.dateStart! >= calendar.firstDay! && item.dateStart! <= calendar.lastDay!)).toBe(true)
    expect(calendar.events.some(item => /\bFTE\b|12 mo|paid holiday|pre-planning|post planning|Memorial/i.test(item.name))).toBe(false)
  })

  it('uses the written calendar for exact report-card and school-scoped graduation dates', () => {
    expect(calendar.events.filter(item => hasEventType(item, 'REPORT_CARD')).map(item => item.dateStart)).toEqual(['2026-10-16', '2027-01-15', '2027-04-09'])
    for (const event of calendar.events.filter(item => hasEventType(item, 'REPORT_CARD'))) {
      expect(event.sourceId).toBe('holmes-2026-2027-written-calendar')
      expect(event.dateEnd).toBeNull()
    }
    const ceremonies = calendar.events.filter(item => /Graduation$/.test(item.name))
    expect(ceremonies.map(item => [item.dateStart, item.name])).toEqual([
      ['2027-05-14', 'Ponce de Leon High School Graduation'],
      ['2027-05-17', 'Poplar Springs High School Graduation'],
      ['2027-05-18', 'Bethlehem High School Graduation'],
      ['2027-05-20', 'Holmes County High School Graduation'],
    ])
    for (const event of ceremonies) {
      expect(event.schoolStatus).toBe('not-applicable')
      expect(event.participantScope).toContain('graduating class')
      expect(event.sourceId).toBe('holmes-2026-2027-written-calendar')
      expect(event.countsAsStudentAttendanceDay).toBeUndefined()
      expect(hasEventType(event, 'LAST_DAY')).toBe(false)
    }
  })

  it('publishes only verified school-scoped regular clocks and independent parent FAQs', () => {
    const rows = calendar.schoolHours as CalendarSchoolHours[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ scope: 'Poplar Springs School - 2026-2027', regularHours: '8:00 a.m.-2:38 p.m. Central Time', sourceId: 'holmes-poplar-bells', effectiveThrough: null })
    expect(rows[0]!.note).toContain('7:30 a.m.')
    expect(rows[0]!.earlyReleaseTime).toBeUndefined()
    expect(calendar.faqs).toHaveLength(35)
    expect(new Set(calendar.faqs.map(item => item.question)).size).toBe(35)
    expect(calendar.faqs.find(item => item.question === 'Are Holmes County school start times changing for 2026-2027?')?.answer).toContain('April 27, 2026')
    expect(calendar.faqs.find(item => item.question === 'Do Holmes County high school seniors finish classes before graduation?')?.answer).toContain('does not give separate final attendance dates')
  })

  it('exports 25 occurrences with exclusive break endings and one final-day multi-type entry', () => {
    const ics = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
    const entries = ics.split('BEGIN:VEVENT').slice(1)
    expect(entries).toHaveLength(25)
    const entry = (day: string) => entries.find(text => text.includes('UID:' + on(day).id + '@'))!
    expect(entry('2026-10-29')).toContain('DTEND;VALUE=DATE:20261031')
    expect(entry('2026-12-21')).toContain('DTEND;VALUE=DATE:20270105')
    expect(entry('2027-03-22')).toContain('DTEND;VALUE=DATE:20270327')
    expect(entry('2027-05-14')).toContain('SUMMARY:Ponce de Leon High School Graduation')
    expect(entry('2027-05-14')).toContain('Ceremony date for this school’s graduating class')
    expect(entry('2027-05-27')).toContain('CATEGORIES:LAST_DAY,EARLY_RELEASE,GRADING_PERIOD_END,SEMESTER_END')
    expect(ics).not.toContain('DTSTART;VALUE=DATE:20270528')
    expect(ics).not.toContain('DTSTART;VALUE=DATE:20270531')
  })
})
