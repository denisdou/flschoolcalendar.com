import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { mount } from '@vue/test-utils'
import CalendarQuickLook from '../../app/components/calendar/CalendarQuickLook.vue'
import CalendarEventsTable from '../../app/components/calendar/CalendarEventsTable.vue'
import record from '../fixtures/districts/richardson-isd.json'
import type { CalendarEvent, KeyDate } from '../../shared/types/content'
import { getEventTypes, hasEventType } from '../../shared/utils/eventTypes.mjs'
// @ts-ignore Shared offline content gate.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Shared offline statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const regular = record.schoolYears['2026-2027']
const adsy = record.schoolYears['2026-2027-adsy']
const calendars = [regular, adsy]

describe('Richardson ISD regular and ADSY calendar evidence', () => {
  it('passes the content gate with separate campus-scoped start dates', () => {
    expect(auditRecords([{ filename: 'richardson-isd.json', record }])).toEqual([])
    expect(regular.firstDay).toBe('2026-08-12')
    expect(adsy.firstDay).toBe('2026-08-11')
    expect(regular.seo.description.startsWith('Most Richardson ISD students')).toBe(true)
    expect(adsy.campusScope).toHaveLength(3)
    for (const y of calendars) {
      expect(y.events).toHaveLength(25)
      expect(new Set(y.events.map(e => e.id)).size).toBe(25)
      expect(y.lastDay).toBe('2027-05-26')
    }
  })

  it('preserves all four grading ends independently, including May 26 early release', () => {
    for (const y of calendars) {
      expect(y.events.filter(e => e.eventType === 'GRADING_PERIOD_END').map(e => e.dateStart)).toEqual([
        '2026-10-07', '2026-12-18', '2027-03-12', '2027-05-26',
      ])
      expect(y.events.filter(e => e.eventType === 'EARLY_RELEASE').map(e => e.dateStart)).toEqual([
        '2026-08-26', '2026-09-23', '2026-12-18', '2027-02-03', '2027-05-05', '2027-05-26',
      ])
      expect(y.events.find(e => e.eventType === 'LAST_DAY')).toMatchObject({
        dateStart: '2027-05-26', schoolStatus: 'early-dismissal',
      })
      expect(y.events.filter(e => e.dateStart === '2027-05-26').map(e => e.eventType).sort()).toEqual([
        'EARLY_RELEASE', 'GRADING_PERIOD_END', 'LAST_DAY',
      ])
      expect(y.events.find(e => e.eventType === 'LAST_DAY')?.name).toBe('Last Day of School')
      expect(y.events.find(e => e.eventType === 'LAST_DAY')).toMatchObject({
        sourceId: 'richardson-calendar-approval', schoolStatusBasis: 'official',
        attendanceStatusBasisSourceId: y.actions.officialPdfUrl.includes('ADSY')
          ? 'richardson-2026-2027-adsy-calendar-pdf' : 'richardson-2026-2027-calendar-pdf',
      })
    }
  })

  it('keeps source event ranges distinct from derived family break windows', () => {
    for (const y of calendars) {
      expect(y.events.find(e => e.eventType === 'WINTER_BREAK')).toMatchObject({
        dateStart: '2026-12-21', dateEnd: '2027-01-04', basis: 'official',
      })
      expect(y.events.find(e => e.dateStart === '2027-01-05')).toMatchObject({
        eventType: 'NON_STUDENT_DAY', basis: 'official',
      })
      expect(y.events.find(e => e.eventType === 'THANKSGIVING_BREAK')).toMatchObject({
        dateStart: '2026-11-26', dateEnd: '2026-11-27', basis: 'official',
      })
      expect(y.events.find(e => e.dateStart === '2026-11-23')).toMatchObject({
        dateEnd: '2026-11-25', eventType: 'NON_STUDENT_DAY', basis: 'official',
      })
      expect(y.breaks.find(b => b.dateStart === '2026-12-21')?.dateEnd).toBe('2027-01-05')
      expect(y.breaks.find(b => b.dateStart === '2026-11-23')?.dateEnd).toBe('2026-11-27')
      expect(y.keyDates.filter(k => k.basis === 'derived')).toEqual([
        { label: 'Thanksgiving-week break', dateStart: '2026-11-23', dateEnd: '2026-11-27', eventType: 'STUDENT_BREAK', basis: 'derived' },
        { label: 'Winter no-class period', dateStart: '2026-12-21', dateEnd: '2027-01-05', eventType: 'STUDENT_BREAK', basis: 'derived' },
      ])
      expect(y.noSchoolDayEventIds.every(id => y.events.some(e => e.id === id))).toBe(true)
    }
  })

  it('does not flatten conditional make-up days into permanent attendance booleans', () => {
    for (const y of calendars) {
      const makeup = y.events.filter(e => e.eventType === 'MAKEUP_DAY') as CalendarEvent[]
      expect(makeup.map(e => e.dateStart)).toEqual(['2027-03-26', '2027-04-23'])
      for (const e of makeup) {
        expect(e.countsAsStudentAttendanceDay).toBeUndefined()
        expect(e).toMatchObject({
          schoolStatus: 'conditional-attendance',
          countsAsStudentAttendanceDayUnderPublishedSchedule: false,
          countsAsStudentAttendanceDayUnderPublishedScheduleBasis: 'derived',
          mayBecomeAttendanceDay: true, mayBecomeAttendanceDayBasis: 'derived',
          note: 'Used only if needed and subject to change.', noteBasis: 'official',
        })
      }
    }
  })

  it('renders derived STUDENT_BREAK ranges without relabeling them as official seasonal breaks', () => {
    const dates = regular.keyDates.filter(k => k.eventType === 'STUDENT_BREAK') as KeyDate[]
    const quickLook = mount(CalendarQuickLook, { props: { dates } })
    for (const date of dates) {
      expect(quickLook.text()).toContain(date.label)
      expect(quickLook.find(`time[datetime="${date.dateStart}"]`).exists()).toBe(true)
    }
    quickLook.unmount()
    const events: CalendarEvent[] = dates.map((date, i) => ({
      id: `derived-break-${i}`, dateStart: date.dateStart, dateEnd: date.dateEnd,
      eventType: date.eventType, name: date.label, basis: 'derived',
      schoolStatus: 'no-classes', sourceId: regular.sources[0]!.id, note: null,
    }))
    for (const event of events) {
      expect(getEventTypes(event)).toEqual(['STUDENT_BREAK'])
      expect(hasEventType(event, 'WINTER_BREAK')).toBe(false)
      expect(hasEventType(event, 'THANKSGIVING_BREAK')).toBe(false)
    }
    const table = mount(CalendarEventsTable, { props: {
      events, districtName: 'Richardson ISD', schoolYear: '2026-2027',
    } })
    expect(table.findAll('tbody tr')).toHaveLength(2)
    for (const date of dates) expect(table.text()).toContain(date.label)
    expect(table.text()).toContain('No school')
    table.unmount()
  })

  it('uses the three current campus notices for ADSY hours and meals rather than the old proposal', () => {
    const first = adsy.events[0] as CalendarEvent
    expect(first.sourceId).toBe('richardson-2026-2027-adsy-calendar-pdf')
    expect(first.noteSourceIds).toHaveLength(3)
    expect(first.note).toContain('7:50–11:50 a.m.')
    expect(first.note).toContain('9 a.m.')
    expect(first.note).toContain('sack lunch')
    for (const id of first.noteSourceIds!) {
      expect(adsy.sources.find(s => s.id === id)?.url).toMatch(/^https:\/\/schools\.risd\.org\//)
    }
    expect(first.timeSourceId).toBeUndefined()
    expect(first.scheduleTypeSourceId).toBeUndefined()
    expect(first.scheduleSourceId).toBeUndefined()
    expect(first.scheduleSourceIds).toEqual(first.noteSourceIds)
    expect(adsy.schoolHours.some(h => h.scope.includes('August 11') && h.regularHours.includes('Check'))).toBe(false)
    expect(JSON.stringify(adsy)).not.toMatch(/rather than a full instructional day|confirm exact hours|grading-period boundary/)
  })

  it('validates every campus schedule source rather than accepting an unverified aggregate scope', () => {
    const badRecord = structuredClone(record)
    const first = badRecord.schoolYears['2026-2027-adsy'].events[0] as CalendarEvent
    first.scheduleSourceIds = ['unknown-campus-source']
    expect(auditRecords([{ filename: 'richardson-isd.json', record: badRecord }])
      .some((issue: { code: string }) => issue.code === 'UNKNOWN_SCHEDULE_SOURCE_ID')).toBe(true)
    first.scheduleSourceIds = []
    expect(auditRecords([{ filename: 'richardson-isd.json', record: badRecord }])
      .some((issue: { code: string }) => issue.code === 'INVALID_SCHEDULE_SOURCE_IDS')).toBe(true)
  })

  it('answers independent winter, November and ADSY search intents without inventing a future route', () => {
    expect(regular.faqs).toHaveLength(22)
    expect(adsy.faqs).toHaveLength(16)
    expect(regular.faqs.find(f => f.question.includes('winter break in 2026-2027'))?.answer).toContain('January 4')
    expect(regular.faqs.find(f => f.question.includes('November 2–3'))?.answer).toContain('November 4')
    expect(regular.faqs.find(f => f.question === 'What is ADSY in Richardson ISD?')?.answer).toContain('Additional Days School Year')
    expect(adsy.faqs.find(f => f.question.includes('August 11 hours'))?.answer).toContain('11:50 a.m.')
    expect(adsy.faqs.find(f => f.question.includes('When is Winter Break'))?.answer).toContain('January 4')
    expect(regular.faqs.find(f => f.question.includes('second semester'))?.answer).toContain('January 6, 2027')
    expect(regular.faqs.find(f => f.question.includes('Labor Day 2026'))?.answer).toContain('September 7')
    expect(regular.faqs.find(f => f.question.includes('Martin Luther King Jr. Day 2027'))?.answer).toContain('January 18')
    expect(regular.faqs.some(f => f.question.includes('published its 2027-2028'))).toBe(true)
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027', '2026-2027-adsy'])
  })

  it('recomputes baseline statistics without counting grading milestones as extra days', () => {
    for (const [i,y] of calendars.entries()) {
      expect(y.statistics).toEqual(calculateCalendarStatistics(y))
      expect(y.statistics.find(s => s.id === 'student-attendance-days')?.value).toBe(i ? '175 days' : '174 days')
      expect(y.statistics.find(s => s.id === 'total-no-school-weekdays')?.value).toBe('30 weekdays')
      expect(y.statistics.find(s => s.id === 'student-no-school-days')?.value).toBe('7 days')
      expect(y.statistics.find(s => s.id === 'student-no-school-days')?.explanation).toBe(
        'Counts weekdays represented by NON_STUDENT_DAY events, including staff professional-learning and exchange days. Named holidays and official school breaks are excluded.',
      )
      expect(y.statistics.find(s => s.id === 'early-release-days')?.value).toBe('6 dates')
    }
  })

  it('exports all four grading ends and current ADSY hours with campus source links', () => {
    execFileSync(process.execPath, ['scripts/generate-ics.mjs'], { cwd: process.cwd() })
    for (const y of calendars) {
      const text = readFileSync(`test/fixtures${y.actions.staticIcsUrl}`, 'utf8').replace(/\r\n /g, '')
      expect((text.match(/BEGIN:VEVENT/g) || []).length).toBe(25)
      expect((text.match(/CATEGORIES:GRADING_PERIOD_END/g) || []).length).toBe(4)
      expect((text.match(/CATEGORIES:EARLY_RELEASE/g) || []).length).toBe(6)
      const may26 = text.split('BEGIN:VEVENT').filter(e => e.includes('DTSTART;VALUE=DATE:20270526'))
      expect(may26).toHaveLength(3)
      expect(may26.some(e => e.includes('CATEGORIES:EARLY_RELEASE'))).toBe(true)
      expect(text).toContain('SUMMARY:Fourth Grading Period Ends')
      expect(text).toContain('Used only if needed and subject to change.')
      const last = may26.find(e => e.includes('CATEGORIES:LAST_DAY'))!
      expect(last).toContain('Source: https://web.risd.org/home/26-27-27-28-calendar/')
      expect(last).toContain('Attendance status source: ' + y.actions.officialPdfUrl)
      if (y === adsy) {
        expect(text).toContain('7:50–11:50 a.m.')
        expect(text).toContain('Schedule sources: ')
        for (const source of adsy.sources.filter(s => s.id.endsWith('back-to-school'))) expect(text).toContain(source.url)
        expect(text).not.toContain('welcome and engagement activities rather than')
      }
    }
  })

  it('uses the official professional-learning name and preserves the January 5 distinction in the hero', () => {
    for (const y of calendars) {
      for (const e of y.events.filter(e => e.id.includes('november-no-school') || e.id.includes('february-15'))) {
        expect(e).toMatchObject({
          name: 'Student Holiday / Staff Professional Learning Day', nameBasis: 'official',
          officialLabel: 'Student Holiday/Staff Professional Learning Day',
        })
      }
    }
    expect(regular.hero.mobileDescription).toContain('Winter Break and the January 5 student holiday')
    expect(regular.hero.desktopDescription).toContain('return January 6 after Winter Break and the January 5 student holiday')
    expect(adsy.seo.title).toBe('Richardson ISD ADSY Calendar 2026-27: Aug. 11 & Key Dates')
    expect(adsy.hero.desktopDescription).toContain('last day on May 26')
    expect(adsy.hero.mobileDescription).toContain('four hours of instruction from 7:50 to 11:50 a.m.')
    expect(adsy.editorialSummary.paragraphs[2]).toContain('breakfast for all students')
    expect(adsy.editorialSummary.paragraphs[1]).toContain('return January 6 after Winter Break and the January 5 student holiday')
    expect(regular.seo.description).toContain('Aug. 12, 2026, and finish May 26, 2027')
    expect(regular.editorialSummary.heading).toBe('Richardson ISD 2026-27 calendar highlights')
  })
})
