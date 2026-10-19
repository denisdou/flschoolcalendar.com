import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DistrictRecord } from '../../shared/types/content'
import recordJson from '../../server/data/districts/records/dixie-county-school-district.json'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = recordJson as DistrictRecord
const calendar = record.schoolYears['2026-2027']!
const event = (key: string) => calendar.events.find(item => item.id === 'dixie-2026-2027-' + key)!

function weekdays(start: string, end: string) {
  const dates: string[] = []
  for (const cursor = new Date(start + 'T00:00:00Z'); cursor <= new Date(end + 'T00:00:00Z'); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (![0, 6].includes(cursor.getUTCDay())) dates.push(cursor.toISOString().slice(0, 10))
  }
  return dates
}

function noClassDates(ids = calendar.confirmedNoSchoolDayEventIds!) {
  return new Set(ids.flatMap(id => {
    const item = calendar.events.find(item => item.id === id)!
    return weekdays(item.dateStart!, item.dateEnd || item.dateStart!)
  }))
}

describe('Dixie Florida 2026-2027 calendar interpretation', () => {
  it('uses district 15 and the approved June revision without claiming a live byte match', () => {
    expect(record.district).toMatchObject({ id: 'FL-15', districtNumber: '15', timeZone: 'America/New_York', name: 'Dixie District Schools' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027'])
    expect(calendar.approvedAt).toBe('2026-06-25')
    expect(calendar.sourceDocumentUpdatedAt).toBe('2026-06-25')
    expect(calendar.sources[0]).toMatchObject({ contentHash: 'sha256:e49df1e1da13be1a3ce6d180098775a3c03c1f204bc53417d00bdaae234916db', publishedAt: null, printedRevisionDate: '2026-06-25' })
    expect(calendar.about.updates).toContain('current remote bytes were not independently compared')
  })

  it('counts the yellow first and last days as early release alongside the two pink dates', () => {
    const shortened = calendar.events.filter(item => hasEventType(item, 'EARLY_RELEASE'))
    expect(shortened.map(item => item.dateStart)).toEqual(['2026-08-10', '2026-10-16', '2026-12-18', '2027-05-28'])
    expect(shortened.every(item => item.schoolStatus === 'early-dismissal' && item.countsAsStudentAttendanceDay)).toBe(true)
    expect(event('first-day').eventTypes).toEqual(['FIRST_DAY', 'EARLY_RELEASE'])
    expect(event('last-day').eventTypes).toEqual(['LAST_DAY', 'EARLY_RELEASE', 'GRADING_PERIOD_END'])
    expect(calendar.events.filter(item => item.dateStart === calendar.lastDay)).toHaveLength(1)
    expect(hasEventType(event('term-1-end'), 'EARLY_RELEASE')).toBe(false)
    expect(hasEventType(event('term-3-end'), 'EARLY_RELEASE')).toBe(false)
    expect(calendar.schoolHours).toEqual([])
    expect(shortened.every(item => !item.timeSourceId)).toBe(true)
  })

  it('keeps January 4 inside Christmas break with an explicit January 5 return', () => {
    expect(event('christmas-break')).toMatchObject({ dateStart: '2026-12-19', dateEnd: '2027-01-04' })
    expect(calendar.events.some(item => item.dateStart === '2027-01-04')).toBe(false)
    expect(event('winter-return')).toMatchObject({ dateStart: '2027-01-05', schoolStatus: 'schools-open', dateBasis: 'official' })
    expect(calendar.breaks.find(item => item.name === 'Christmas Break')).toMatchObject({ nextStudentAttendanceDate: '2027-01-05', nextStudentAttendanceDateBasis: 'official', schoolWeekdaysOff: 11 })
  })

  it('does not connect the fair, Good Friday and April spring break across class days', () => {
    expect(event('suwannee-river-fair')).toMatchObject({ dateStart: '2027-03-15', dateEnd: '2027-03-17', eventTypeBasis: 'derived' })
    expect(event('good-friday')).toMatchObject({ dateStart: '2027-03-26', dateEnd: null })
    expect(event('spring-break')).toMatchObject({ dateStart: '2027-04-10', dateEnd: '2027-04-18' })
    for (const [start, end] of [['2027-03-18', '2027-03-25'], ['2027-03-29', '2027-04-09']]) {
      for (const date of weekdays(start!, end!)) expect(noClassDates().has(date)).toBe(false)
    }
    for (const span of calendar.breaks) {
      expect([...noClassDates(span.componentEventIds!)].sort()).toEqual(weekdays(span.dateStart, span.dateEnd))
      expect(weekdays(span.dateStart, span.dateEnd)).toHaveLength(span.schoolWeekdaysOff!)
      expect(noClassDates().has(span.nextStudentAttendanceDate!)).toBe(false)
    }
    expect(calendar.breaks.find(item => item.name === 'February long weekend')).toMatchObject({ dateStart: '2027-02-12', dateEnd: '2027-02-15', basis: 'derived', schoolWeekdaysOff: 2, nextStudentAttendanceDate: '2027-02-16' })
  })

  it('derives 179 attendance days without substituting a standard annual total', () => {
    const dates = weekdays(calendar.firstDay!, calendar.lastDay!)
    expect(dates).toHaveLength(210)
    expect(noClassDates().size).toBe(31)
    expect(dates.filter(date => !noClassDates().has(date))).toHaveLength(179)
    expect(calendar.conditionalNoSchoolDayEventIds).toEqual([])
    expect(calendar.events.some(item => item.mayBecomeAttendanceDay || hasEventType(item, 'MAKEUP_DAY'))).toBe(false)
    expect(calendar.highlights.some(item => item.label === 'Student days' && item.basis === 'official')).toBe(false)
    expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
    expect(calendar.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value: '179 days', basis: 'derived' })
    expect(calendar.statistics.find(item => item.id === 'longest-no-school-stretch')?.value).toBe('17 consecutive days')
  })

  it('retains reporting and graduation dates while excluding employee work and extra attendance assumptions', () => {
    expect(calendar.events.filter(item => hasEventType(item, 'PROGRESS_REPORT')).map(item => item.dateStart)).toEqual(['2026-09-10', '2026-11-16', '2027-02-10', '2027-04-29'])
    expect(calendar.events.filter(item => hasEventType(item, 'REPORT_CARD')).map(item => item.dateStart)).toEqual(['2026-10-19', '2027-01-11', '2027-03-29', '2027-06-07'])
    expect(event('final-report-cards').schoolStatus).toBe('not-applicable')
    expect(event('final-report-cards').countsAsStudentAttendanceDay).toBeUndefined()
    expect(event('graduation')).toMatchObject({ dateStart: '2027-05-21', schoolStatus: 'not-applicable', gradeScope: 'Graduating students at Dixie County Middle-High School' })
    expect(calendar.events.filter(item => hasEventType(item, 'LAST_DAY'))).toEqual([event('last-day')])
    expect(calendar.events.some(item => item.schoolStatus === 'staff-only' || ['2026-08-03', '2027-05-31', '2027-06-01'].includes(item.dateStart!))).toBe(false)
    const ics = readFileSync('public' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r?\n[ \t]/g, '')
    const entries = ics.split('BEGIN:VEVENT').slice(1)
    const find = (key: string) => entries.find(item => item.includes('UID:' + event(key).id + '@'))!
    expect(entries).toHaveLength(27)
    expect(find('christmas-break')).toContain('DTEND;VALUE=DATE:20270105')
    expect(find('suwannee-river-fair')).toContain('DTEND;VALUE=DATE:20270318')
    expect(find('spring-break')).toContain('DTEND;VALUE=DATE:20270419')
    expect(find('last-day')).toContain('CATEGORIES:LAST_DAY,EARLY_RELEASE,GRADING_PERIOD_END')
    expect(find('final-report-cards')).toContain('DTSTART;VALUE=DATE:20270607')
  })
})
