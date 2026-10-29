import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { DistrictRecord } from '../../shared/types/content'
import data from '../../server/data/districts/records/jackson-county-school-district.json'
import { splitCalendarDetailEvents } from '../../shared/utils/calendarDetailSections'
import { selectCalendarFaqs } from '../../shared/utils/calendarFaqSelection'
import { hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore Dependency-free content audit module.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const record = data as unknown as DistrictRecord
const calendar = record.schoolYears['2026-2027']!
const event = (key: string) => calendar.events.find(item => item.id === 'jackson-2026-2027-' + key)!
function weekdays(start: string, end: string) {
  const dates: string[] = []
  for (const day = new Date(start+'T12:00:00Z'); day <= new Date(end+'T12:00:00Z'); day.setUTCDate(day.getUTCDate()+1)) {
    if (![0,6].includes(day.getUTCDay())) dates.push(day.toISOString().slice(0,10))
  }
  return dates
}

describe('Jackson County Florida 2026-2027 calendar', () => {
  it('confirms the official PDF matches the supplied document and resolves the earlier download limitation', () => {
    expect(record.district).toMatchObject({ id:'FL-32', districtNumber:'32', timeZone:'America/Chicago', name:'Jackson County School District' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027'])
    expect(calendar.approvedAt).toBe('2026-01-20')
    expect(calendar.sources[0]).toMatchObject({ type:'official-pdf', url:'https://files.smartsites.parentsquare.com/12676/2026-2027instructionalcalendar.pdf', contentHash:'sha256:86f9fb3cca888daffa66a996ebdebc10956bf923d516b07d7ec3816029275c4a', publishedAt:null })
    expect(calendar.actions.officialPdfUrl).toBe(calendar.sources[0]?.url)
    expect(calendar.actions.officialCalendarUrl).toBe('https://www.jcsb.org/district')
    const identity = calendar.sourceDiscrepancies?.find(item => item.field === 'currentPdfIdentity')
    expect(identity?.resolution).toBe('resolved')
    expect(identity?.effect).toContain('143,451 bytes')
    expect(identity?.effect).toContain('identical to the supplied')
    expect(auditRecords([{ filename:record.district.slug+'.json', record }])).toEqual([])
  })

  it('includes only student-related events and does not turn May teacher days into attendance', () => {
    expect(calendar.events).toHaveLength(21)
    expect(new Set(calendar.events.map(item => item.id)).size).toBe(21)
    expect(calendar.firstDay).toBe('2026-08-12')
    expect(calendar.lastDay).toBe('2027-05-26')
    expect(calendar.events.some(item => /FTE|Board Meeting|Pre-Service|Last Teacher Day/.test(item.name))).toBe(false)
    expect(calendar.events.every(item => item.dateStart! >= calendar.firstDay && (item.dateEnd || item.dateStart)! <= calendar.lastDay)).toBe(true)
    expect(calendar.events.some(item => item.dateStart === '2027-05-27' || item.dateStart === '2027-05-28')).toBe(false)
    expect(calendar.schoolHours).toEqual([])
  })

  it('keeps all five shortened attendance dates, including Veterans Day and the last day', () => {
    const early = calendar.events.filter(item => hasEventType(item,'EARLY_RELEASE'))
    expect(early.map(item => item.dateStart)).toEqual(['2026-10-15','2026-11-11','2026-12-18','2027-03-19','2027-05-26'])
    expect(early.every(item => item.schoolStatus === 'early-dismissal' && item.countsAsStudentAttendanceDay === true)).toBe(true)
    expect(calendar.confirmedNoSchoolDayEventIds).not.toContain(event('veterans-early-release').id)
    expect(event('last-day').eventTypes).toEqual(['LAST_DAY','EARLY_RELEASE','GRADING_PERIOD_END','SEMESTER_END'])
    expect(event('semester-1-end').eventTypes).toEqual(['EARLY_RELEASE','GRADING_PERIOD_END','SEMESTER_END'])
    expect(calendar.events.filter(item => item.dateStart === '2027-05-26')).toHaveLength(1)
    for (const key of ['quarter-1-end','quarter-3-end']) {
      expect(event(key).countsAsStudentAttendanceDay).toBe(true)
      expect(hasEventType(event(key),'EARLY_RELEASE')).toBe(false)
    }
    expect(calendar.editorialSummary.paragraphs.some(p => ['October 15', 'November 11', 'December 18', 'March 19', 'May 26'].every(date => p.includes(date)))).toBe(true)
    expect(splitCalendarDetailEvents(calendar.events).earlyRelease).toHaveLength(5)
  })

  it('joins only the verified October weekend and keeps winter closures separate', () => {
    expect(event('fall-break')).toMatchObject({ dateStart:'2026-10-16', dateEnd:'2026-10-19', dateBasis:'derived' })
    expect(weekdays(event('fall-break').dateStart!,event('fall-break').dateEnd!)).toEqual(['2026-10-16','2026-10-19'])
    expect(calendar.breaks.find(item => item.name === 'Fall break weekend')).toMatchObject({ schoolWeekdaysOff:2, nextStudentAttendanceDate:'2026-10-20', nextStudentAttendanceDateBasis:'official' })
    expect(event('christmas')).toMatchObject({ dateStart:'2026-12-21',dateEnd:'2026-12-31',dateBasis:'official' })
    expect(['new-year','january-workday','january-inservice'].map(key => event(key).dateStart)).toEqual(['2027-01-01','2027-01-04','2027-01-05'])
    expect(event('winter-return')).toMatchObject({ dateStart:'2027-01-06', dateBasis:'official' })
    expect(calendar.breaks.find(item => item.name === 'Winter time off')).toMatchObject({ dateStart:'2026-12-19',dateEnd:'2027-01-05',schoolWeekdaysOff:12 })
    expect(event('spring-break')).toMatchObject({ dateStart:'2027-03-22',dateEnd:'2027-03-26' })
    expect(event('april-inservice').dateStart).toBe('2027-04-12')
    expect(calendar.breaks.find(item => item.name === 'Spring break')?.nextStudentAttendanceDate).toBe('2027-03-29')
  })

  it('applies the later October closure without misrepresenting original term totals', () => {
    expect(event('october-weather-closure')).toMatchObject({ dateStart:'2026-10-09', sourceId:'jackson-october-9-closure', schoolStatus:'schools-closed', countsAsStudentAttendanceDay:false })
    expect(event('quarter-1-end')).toMatchObject({ dateStart:'2026-10-12', schoolStatus:'schools-open' })
    const closed = new Set(calendar.confirmedNoSchoolDayEventIds!.flatMap(id => {
      const e = calendar.events.find(item => item.id === id)!
      return weekdays(e.dateStart!,e.dateEnd || e.dateStart!)
    }))
    expect(weekdays(calendar.firstDay,calendar.lastDay)).toHaveLength(206)
    expect(closed.size).toBe(29)
    expect(calendar.statistics.find(item => item.id === 'student-attendance-days')).toMatchObject({ value:'177 days', basis:'derived' })
    expect(calendar.studentDayStatisticExplanation).toContain('85- and 93-day semesters')
    expect(calendar.studentDayStatisticExplanation).toContain('178 attendance weekdays')
    expect(calendar.revisions[0]?.eventId).toBe(event('october-weather-closure').id)
    expect(calendar.conditionalNoSchoolDayEventIds).toEqual([])
    expect(calendar.events.some(item => hasEventType(item,'MAKEUP_DAY'))).toBe(false)
    expect(calculateCalendarStatistics(calendar,{ preserveStoredBreakWording:true })).toEqual(calendar.statistics)
  })

  it('provides ten distinct FAQs, eight visible answers and named Hero descriptions', () => {
    expect(calendar.faqs).toHaveLength(10)
    expect(new Set(calendar.faqs.map(item => item.question.toLowerCase())).size).toBe(10)
    expect(selectCalendarFaqs(calendar.faqs)).toHaveLength(8)
    for (const description of [calendar.hero.mobileDescription, calendar.hero.desktopDescription]) expect(description).toContain(record.district.name)
    expect(calendar.faqs.find(item => item.question.includes('Veterans Day'))?.answer).toMatch(/^Yes\./)
  })

  it('exports multi-day breaks with exclusive end dates and keeps the final day unique', () => {
    const ics = readFileSync('public/ics/jackson-county-school-district-2026-2027.ics','utf8').replace(/\r?\n[ \t]/g,'')
    const entries = ics.split('BEGIN:VEVENT').slice(1)
    expect(entries).toHaveLength(21)
    expect(entries.find(entry => entry.includes('UID:'+event('fall-break').id+'@'))).toContain('DTEND;VALUE=DATE:20261020')
    expect(entries.find(entry => entry.includes('UID:'+event('christmas').id+'@'))).toContain('DTEND;VALUE=DATE:20270101')
    expect(entries.find(entry => entry.includes('UID:'+event('spring-break').id+'@'))).toContain('DTEND;VALUE=DATE:20270327')
    expect(entries.filter(entry => entry.includes('DTSTART;VALUE=DATE:20270526'))).toHaveLength(1)
  })
})
