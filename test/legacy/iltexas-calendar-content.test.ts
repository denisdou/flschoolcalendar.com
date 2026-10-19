import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import CalendarEventsTable from '../../app/components/calendar/CalendarEventsTable.vue'
import MonthlyCalendar from '../../app/components/calendar/MonthlyCalendar.vue'
import CalendarBreakCountdown from '../../app/components/calendar/CalendarBreakCountdown.vue'
import CalendarPageHero from '../../app/components/calendar/CalendarPageHero.vue'
import CalendarNotes from '../../app/components/calendar/CalendarNotes.vue'
import CalendarYearStatistics from '../../app/components/calendar/CalendarYearStatistics.vue'
import { buildDistrictCalendarSchema } from '../../shared/utils/calendarSchema'
import { conditionalAttendanceLabel, isConditionalAttendance } from '../../shared/utils/calendarAttendance.mjs'
import type { DistrictRecord } from '../../shared/types/content'
import { buildDistrictCatalog } from '../../shared/utils/districts'
import rawRecord from '../fixtures/districts/international-leadership-of-texas.json'
// @ts-ignore Shared offline content validator.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Shared offline statistics generator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'
// @ts-ignore Shared taxonomy helper.
import { hasEventType } from '../../shared/utils/eventTypes.mjs'

const record = rawRecord as unknown as DistrictRecord
const days = (start: string, end = start) => {
  const values: string[] = []
  for (const date = new Date(start + 'T00:00:00Z'); date <= new Date(end + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() + 1)) values.push(date.toISOString().slice(0, 10))
  return values
}
const weekday = (date: string) => new Date(date + 'T00:00:00Z').getUTCDay() % 6 !== 0

describe('ILTexas regional calendar and official student scope', () => {
  afterEach(() => vi.useRealTimers())
  it('publishes two regional views of only the supplied year', () => {
    expect(record.district).toMatchObject({ id: '057848', shortName: 'ILTexas', countySlug: 'dallas-county', regionSlug: 'region-10' })
    expect(Object.keys(record.schoolYears)).toEqual(['2026-2027', '2026-2027-houston'])
    expect(auditRecords([{ filename: 'international-leadership-of-texas.json', record }])).toEqual([])
    const pages = buildDistrictCatalog([record]).districts[0]!.calendarPages
    expect(pages.map(page => page.href).sort()).toEqual(['/international-leadership-of-texas/2026-2027-houston/', '/international-leadership-of-texas/2026-2027/'])
    expect(pages.every(page => page.lastDayConditional)).toBe(true)
  })

  for (const [key, springStart, springEnd] of [['2026-2027', '2027-03-15', '2027-03-19'], ['2026-2027-houston', '2027-03-08', '2027-03-12']]) {
    const calendar = record.schoolYears[key]!
    const events = calendar.events
    const event = (suffix: string) => events.find(event => event.id.endsWith('-' + suffix))!
    const closed = new Set(events.filter(event => calendar.confirmedNoSchoolDayEventIds!.includes(event.id)).flatMap(event => days(event.dateStart!, event.dateEnd || event.dateStart!)).filter(weekday))

    describe(key!, () => {
      it('retains the printed April approval without inventing a publication date', () => {
        expect(calendar.approvedAt).toBe('2026-04-22')
        expect(calendar.publishedAt).toBeNull()
        expect(calendar.lastOfficialRevisionAt).toBeNull()
        expect(calendar.sources[0]).toMatchObject({ printedBoardApprovalDate: '2026-04-22', retrievedAt: '2026-10-12', contentHash: 'daee48b8eac1e1c3de1c3eb851cd6ccb39ee3cacca64e1bed3b56467c58a0b3a' })
        expect(calendar.seo.title.length).toBeLessThanOrEqual(60)
        expect(calendar.seo.description.length).toBeLessThanOrEqual(160)
      })

      it('uses its own regional Spring Break without treating both weeks as holidays', () => {
        expect(event('spring-break')).toMatchObject({ dateStart: springStart, dateEnd: springEnd, dateBasis: 'official', schoolStatus: 'no-classes' })
        expect(event('spring-break').note).toContain('Subject to change')
        expect(closed.has(springStart!)).toBe(true)
        expect(closed.has(key === '2026-2027' ? '2027-03-08' : '2027-03-15')).toBe(false)
        expect(calendar.faqs[0]!.question).toContain('regional ILTexas calendar')
        expect(calendar.faqs.find(faq => faq.question.includes('Liberty-area'))!.answer).toContain('does not specify which schedule applies to Liberty-area campuses')
      })

      it('preserves all six grading starts/ends and combines same-day meanings', () => {
        expect(events.filter(event => hasEventType(event, 'GRADING_PERIOD_START')).map(event => event.dateStart)).toEqual(['2026-08-13', '2026-09-22', '2026-11-02', '2027-01-07', '2027-02-23', '2027-04-19'])
        expect(events.filter(event => hasEventType(event, 'GRADING_PERIOD_END')).map(event => event.dateStart)).toEqual(['2026-09-18', '2026-10-30', '2026-12-17', '2027-02-19', '2027-04-16', '2027-05-26'])
        expect(event('last-day')).toMatchObject({ dateStart: '2027-05-26', isFinalStudentDate: true, finalStudentDateBasis: 'official' })
        expect(hasEventType(event('last-day'), 'SEMESTER_END')).toBe(true)
        expect(events.filter(event => event.dateStart === '2027-05-26')).toHaveLength(1)
        expect(events.some(event => hasEventType(event, 'EARLY_RELEASE'))).toBe(false)
        const table = mount(CalendarEventsTable, { props: { events: [event('last-day')], districtName: 'ILTexas', schoolYear: '2026-2027' } })
        expect(table.findAll('tbody tr')).toHaveLength(1)
        expect(table.text()).toContain('Last Day of School')
        table.unmount()
      })

      it('does not infer Veterans Day or Presidents’ Day closures from familiar holiday names', () => {
        expect(event('veterans-day')).toMatchObject({ eventType: 'SCHOOL_MILESTONE', schoolStatus: 'schools-open', schoolStatusBasis: 'derived' })
        expect(closed.has('2026-11-11')).toBe(false)
        expect(closed.has('2027-02-15')).toBe(false)
        expect(closed.has('2027-02-22')).toBe(true)
        expect(calendar.faqs.find(faq => faq.question.includes('off on Veterans'))!.answer).toMatch(/^No\./)
        expect(calendar.faqs.find(faq => faq.question.includes('school on Presidents'))!.answer).toMatch(/^Yes\./)
        expect(calendar.faqs.find(faq => faq.question.includes('off for Martin'))!.answer).toMatch(/^Yes\./)
      })

      it('keeps the official Winter Break and deduplicates its workday overlap', () => {
        expect(event('winter-break')).toMatchObject({ dateStart: '2026-12-18', dateEnd: '2027-01-06', eventType: 'WINTER_BREAK' })
        expect(['2027-01-04', '2027-01-05', '2027-01-06'].every(date => closed.has(date))).toBe(true)
        expect(event('semester-2-start').dateStart).toBe('2027-01-07')
        const winter = calendar.breaks.find(breakItem => breakItem.name === 'Winter Break')!
        expect(winter).toMatchObject({ schoolWeekdaysOff: 14, nextStudentAttendanceDate: '2027-01-07', nextStudentAttendanceDateBasis: 'official' })
      })

      it('keeps weather activation conditional even after the listed last day', () => {
        expect(calendar.conditionalNoSchoolDayEventIds).toEqual([event('weather-day-1').id, event('weather-day-2').id])
        for (const suffix of ['weather-day-1', 'weather-day-2']) {
          expect(event(suffix)).toMatchObject({ schoolStatus: 'no-classes', scheduledAsNoSchool: true, mayBecomeAttendanceDay: true, mayBecomeAttendanceDayBasis: 'derived', countsAsStudentAttendanceDayUnderPublishedSchedule: false })
          expect(event(suffix).countsAsStudentAttendanceDay).toBeUndefined()
          expect(calendar.confirmedNoSchoolDayEventIds).not.toContain(event(suffix).id)
        }
        expect(event('weather-day-2').dateStart).toBe('2027-05-27')
        expect(hasEventType(event('weather-day-2'), 'WEATHER_DAY')).toBe(true)
        expect(calendar.lastDayCondition).toContain('May 27')
      })

      it('reconciles 170 instructional days without publishing an overlapping subset', () => {
        const inYearClosed = [...closed].filter(date => date >= calendar.firstDay! && date <= calendar.lastDay!)
        expect(inYearClosed).toHaveLength(34)
        expect(days(calendar.firstDay!, calendar.lastDay!).filter(weekday).length - inYearClosed.length - 1).toBe(170)
        expect(calendar.statistics).toEqual(calculateCalendarStatistics(calendar))
        expect(calendar.statistics.find(stat => stat.id === 'student-attendance-days')).toMatchObject({ value: '170 days', basis: 'official' })
        expect(calendar.publishStandaloneNoSchoolStatistic).toBe(false)
        expect(calendar.statistics.some(stat => stat.id === 'student-no-school-days')).toBe(false)
        expect(calendar.standaloneNoSchoolStatisticLabel).toBeUndefined()
        expect(calendar.standaloneNoSchoolStatisticExplanation).toBeUndefined()
        expect(calendar.statistics.find(stat => stat.id === 'total-no-school-weekdays')!.value).toBe('34 weekdays')
        expect(calendar.statistics.find(stat => stat.id === 'longest-no-school-stretch')!.value).toBe('20 consecutive days')
      })

      it('limits summer events to selected students and continuous marked weekdays', () => {
        const summer = events.filter(event => event.eventType === 'SUMMER_PROGRAM')
        expect(summer.map(event => [event.dateStart, event.dateEnd])).toEqual([['2027-06-01', '2027-06-04'], ['2027-06-07', '2027-06-11'], ['2027-06-14', '2027-06-15']])
        expect(summer.flatMap(event => days(event.dateStart!, event.dateEnd!))).toHaveLength(11)
        expect(summer.every(event => days(event.dateStart!, event.dateEnd!).every(weekday))).toBe(true)
        expect(summer.every(event => event.dateBasis === 'derived' && event.schoolStatus === 'program-specific' && event.participantScopeBasis === 'official' && event.occursOnRegularInstructionalDay === false)).toBe(true)
        expect(calendar.faqs.find(faq => faq.question.includes('every ILTexas student'))!.answer).toMatch(/^No\./)
        expect(events.some(event => /Teacher Orientation|New Teacher Induction|Charter Offices|Teacher Prep\/PD/.test(event.name))).toBe(false)
      })

      it('keeps 33 independent FAQ intents and avoids unsupported exam or graduation claims', () => {
        expect(calendar.faqs).toHaveLength(33)
        expect(new Set(calendar.faqs.map(faq => faq.question)).size).toBe(33)
        expect(events).toHaveLength(32)
        expect(new Set(events.map(event => event.id)).size).toBe(32)
        expect(events.map(event => event.dateStart)).toEqual(events.map(event => event.dateStart).toSorted())
        expect(event('senior-exams-end')).toMatchObject({ dateStart: '2027-05-14', gradeScope: 'Seniors', schoolStatus: 'program-specific' })
        expect(calendar.faqs.find(faq => faq.question.includes('graduation ceremonies'))!.answer).toContain('does not list')
        expect(JSON.stringify([calendar.faqs, calendar.hero, calendar.editorialSummary])).not.toMatch(/STAAR|TELPAS|comprehensive|stay informed|source was supplied|reviewed calendar page/i)
        expect(calendar.faqs.some(faq => faq.question.includes('back-to-school information'))).toBe(false)
        expect(calendar.faqs.find(faq => faq.question.includes('two weeks'))!.answer).toMatch(/^No\./)
        expect(calendar.faqs.find(faq => faq.question.includes('Data Day mean'))!.answer).toContain('no regular classes')
        expect(calendar.faqs.find(faq => faq.question.includes('start and dismissal times'))!.answer).toContain('does not list daily start or dismissal times')
        expect(calendar.faqs.find(faq => faq.question.includes('start and dismissal times'))!.answer).not.toMatch(/grade-level|half-day/)
        expect(calendar.faqs.find(faq => faq.question.includes('Election Day'))!.answer).toMatch(/^Yes\./)
        expect(calendar.faqs.find(faq => faq.question.includes('Martin Luther'))!.answer).toContain('is labeled a Student/Teacher Holiday')
        expect(calendar.faqs.find(faq => faq.question.includes('early-release days'))!.answer).not.toContain('bell schedule')
        expect(calendar.editorialSummary.paragraphs[0]).toContain('International Leadership of Texas (ILTexas)')
      })

      it('uses parent-facing regional and conditional-date answers without overstating official labels', () => {
        const liberty = calendar.faqs.find(faq => faq.question.includes('Liberty-area'))!.answer
        expect(liberty).toContain('Houston-area schools as March 8–12, 2027')
        expect(liberty).toContain('DFW and Brazos County schools as March 15–19')
        expect(liberty).not.toContain('navigation')
        const goodFriday = calendar.faqs.find(faq => faq.question.includes('Good Friday'))!.answer
        expect(goodFriday).toMatch(/^No regular classes are scheduled/)
        expect(goodFriday).toContain('Inclement Weather Day #1, not a Good Friday holiday')
        expect(goodFriday).toContain('may be used as a make-up day')
        const may27 = calendar.faqs.find(faq => faq.question.includes('classes on May 27'))!.answer
        expect(may27).toContain('Cycle 6 Data Day / Inclement Weather Day #2')
        expect(may27).toContain('could become a school day')
        expect(may27).not.toContain('scheduled as a student holiday')
        if (key === '2026-2027') {
          expect(calendar.hero!.mobileDescription).toContain('DFW and Brazos County schools have Spring Break March 15–19, 2027')
          expect(calendar.editorialSummary.paragraphs[2]).toContain('Summer School is scheduled for June 1–15, 2027, for selected students only.')
          expect(calendar.editorialSummary.paragraphs[2]).not.toContain('does not extend the regular year')
        } else {
          expect(calendar.editorialSummary.heading).toBe('Houston Spring Break and key school dates')
          expect(calendar.editorialSummary.highlights[2]).toBe('Last day of school: May 26, subject to weather-related changes')
          expect(calendar.editorialSummary.paragraphs[2]).toContain('May 27 reserved as a Cycle 6 Data Day and possible weather make-up day')
        }
      })

      it('uses exact regional January labels without assigning DFW staff roles to Brazos County', () => {
        const houston = key === '2026-2027-houston'
        for (const [suffix, label] of [
          ['january-4-student-holiday', houston ? 'Houston Campus Data/PD Day' : 'DFW Area-wide PD Conference'],
          ['january-5-student-holiday', houston ? 'Houston Area-wide PD Conference' : 'DFW Campus Data/PD Day'],
          ['january-6-workday', 'Charterwide Teacher Work Day'],
        ]) {
          expect(event(suffix!)).toMatchObject({ name: label, officialLabel: label, nameBasis: 'official', coveredByBreakEventId: event('winter-break').id, schoolStatusLabel: 'Within Winter Break' })
        }
        const answer = calendar.faqs.find(faq => faq.question.includes('January 4–6'))!.answer
        expect(answer).toContain(houston ? 'Houston\'s Campus Data/PD Day is January 4' : 'does not assign those staff activities to Brazos County')
        for (const suffix of ['january-4-student-holiday', 'january-5-student-holiday']) {
          expect(event(suffix)).toMatchObject({ participantScope: houston ? 'Houston staff' : 'DFW staff', participantScopeBasis: 'derived', participantScopeSourceId: calendar.sources[0]!.id })
        }
      })

      it('shows both weather occurrences as conditional rather than unqualified no-school badges', () => {
        const weather = [event('weather-day-1'), event('weather-day-2')]
        expect(weather.every(isConditionalAttendance)).toBe(true)
        expect(conditionalAttendanceLabel(weather[1]!)).toBe('Reserved weather day — schedule may change')
        const table = mount(CalendarEventsTable, { props: { events: weather, districtName: 'ILTexas', schoolYear: '2026-2027' } })
        expect(table.findAll('.badge--conditional')).toHaveLength(2)
        expect(table.findAll('.badge--closed')).toHaveLength(0)
        expect(table.findAll('.badge').every(badge => badge.text() === 'Reserved weather day — schedule may change')).toBe(true)
        table.unmount()
      })

      it('keeps weather dates out of the guaranteed-break countdown', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2027-03-26T18:00:00Z'))
        const countdown = mount(CalendarBreakCountdown, { props: { events } })
        await countdown.vm.$nextTick()
        expect(countdown.find('time').attributes('datetime')).toBe('2027-04-30')
        expect(countdown.text()).not.toContain('No school today')
        expect(countdown.text()).not.toContain('Inclement Weather Day')
        countdown.unmount()
        vi.setSystemTime(new Date('2027-05-27T18:00:00Z'))
        const end = mount(CalendarBreakCountdown, { props: { events } })
        await end.vm.$nextTick()
        expect(end.text()).toContain('No more no-school days or breaks')
        expect(end.text()).not.toContain('No school today')
        end.unmount()
      })

      it('distinguishes conditional monthly cells and omits redundant January holiday list entries', () => {
        const monthly = mount(MonthlyCalendar, { props: { events, districtName: 'ILTexas', firstDay: calendar.firstDay, lastDay: calendar.lastDay } })
        for (const date of ['2027-03-26', '2027-05-27']) {
          const cell = monthly.find(`time[datetime="${date}"]`).element.closest('td')!
          expect(cell.classList.contains('month-day--conditional')).toBe(true)
          expect(cell.classList.contains('month-day--holiday')).toBe(false)
          expect(cell.classList.contains('month-day--school-day')).toBe(false)
          expect(cell.textContent).toContain('Reserved weather day — schedule may change')
          expect(cell.textContent).not.toContain('schedule may change; attendance may change')
        }
        expect(monthly.findAll('.month-event--conditional')).toHaveLength(2)
        const list = monthly.findAll('.month-event-list').map(list => list.text()).join(' ')
        expect(list).not.toContain(event('january-4-student-holiday').name)
        monthly.unmount()
        const table = mount(CalendarEventsTable, { props: { events: [event('winter-break'), event('january-4-student-holiday'), event('january-5-student-holiday'), event('january-6-workday')], districtName: 'ILTexas', schoolYear: '2026-2027' } })
        expect(table.findAll('tbody tr')).toHaveLength(1)
        expect(table.text()).toContain('Winter Break')
        table.unmount()
      })

      it('keeps the existing region switch beside the Hero and uses separate canonical identities', () => {
        const hero = mount(CalendarPageHero, {
          props: { district: record.district, calendar, calendars: Object.values(record.schoolYears) },
          global: { stubs: { StatusBadge: true, CalendarQuickLook: true, CalendarActions: true, NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
        })
        expect(hero.find('.school-year-nav').text()).toContain('DFW & Brazos County')
        expect(hero.find('.school-year-nav').text()).toContain('Houston')
        expect(hero.find('.school-year-nav a').attributes('href')).toContain(key === '2026-2027' ? '2026-2027-houston/' : '2026-2027/')
        expect(hero.find('h1').text()).toContain('School Calendar')
        hero.unmount()
        const path = `/international-leadership-of-texas/${key}/`
        const schema = buildDistrictCalendarSchema({ siteUrl: 'https://flschoolcalendar.com', path, district: record.district, calendar, discovery: record.calendarDiscovery })
        expect(JSON.stringify(schema)).toContain(`https://flschoolcalendar.com${path}#webpage`)
      })

      it('does not disguise a Summer School note as a comparison insight', () => {
        const notes = mount(CalendarNotes, { props: { district: record.district, calendar }, global: { stubs: { CalendarYearStatistics: true, CalendarPlanningNotice: true } } })
        expect(calendar.comparativeInsights).toEqual([])
        expect(notes.find('.calendar-note-insight-list').exists()).toBe(false)
        notes.unmount()
        expect(events.filter(event => event.eventType === 'SUMMER_PROGRAM')).toHaveLength(3)
        expect(calendar.faqs.find(faq => faq.question.startsWith('When is ILTexas Summer School'))!.answer).toContain('June 1–15, 2027, for selected students')
      })

      it('keeps the subset hidden after regeneration and defends against stale display data', () => {
        expect(calculateCalendarStatistics(structuredClone(calendar)).some((stat: { id: string }) => stat.id === 'student-no-school-days')).toBe(false)
        const optIn = structuredClone(calendar)
        delete optIn.publishStandaloneNoSchoolStatistic
        const legacySubset = calculateCalendarStatistics(optIn).find((stat: { id: string }) => stat.id === 'student-no-school-days')
        expect(legacySubset.value).toBe('8 days')
        const stale = structuredClone(calendar)
        stale.statistics.push(legacySubset)
        const card = mount(CalendarYearStatistics, { props: { calendar: stale } })
        expect(card.findAll('dt').map(label => label.text())).not.toContain(legacySubset.label)
        expect(card.text()).not.toContain('8 days')
        expect(card.text()).toContain('170 days')
        card.unmount()
      })

      it('never lets an unconditional custom label override a conditional attendance flag', () => {
        const misleading = { ...event('weather-day-2'), schoolStatusLabel: 'No school' }
        expect(conditionalAttendanceLabel(misleading)).toBe('Weather-dependent')
        const table = mount(CalendarEventsTable, { props: { events: [misleading], districtName: 'ILTexas', schoolYear: '2026-2027' } })
        expect(table.find('.badge').text()).toBe('Weather-dependent')
        expect(table.find('.badge--closed').exists()).toBe(false)
        table.unmount()
      })

      it('exports complete date ranges and classifications without treating weekends as summer sessions', () => {
        const ics = readFileSync(`test/fixtures/ics/international-leadership-of-texas-${key}.ics`, 'utf8')
        expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(32)
        expect(ics).toContain('DTSTART;VALUE=DATE:20261218')
        expect(ics).toContain('DTEND;VALUE=DATE:20270107')
        expect(ics).toContain('CATEGORIES:LAST_DAY,GRADING_PERIOD_END,SEMESTER_END')
        expect(ics).toContain('DTSTART;VALUE=DATE:20270601')
        expect(ics).toContain('DTEND;VALUE=DATE:20270605')
        expect(ics).not.toContain('DTSTART;VALUE=DATE:20270621')
      })
    })
  }

  it('rejects an empty counting explanation rather than silently accepting bad configuration', () => {
    const invalid = structuredClone(record)
    invalid.schoolYears['2026-2027']!.standaloneNoSchoolStatisticExplanation = ''
    expect(auditRecords([{ filename: 'international-leadership-of-texas.json', record: invalid }]).some((issue: { code: string }) => issue.code === 'INVALID_STANDALONE_NO_SCHOOL_STATISTIC_EXPLANATION')).toBe(true)
  })

  it('rejects invalid break-supplement references', () => {
    const invalid = structuredClone(record)
    const calendar = invalid.schoolYears['2026-2027']!
    const child = calendar.events.find(event => event.coveredByBreakEventId)!
    child.coveredByBreakEventId = 'missing-break'
    expect(auditRecords([{ filename: 'international-leadership-of-texas.json', record: invalid }]).some((issue: { code: string }) => issue.code === 'INVALID_COVERED_BREAK_EVENT')).toBe(true)
    child.coveredByBreakEventId = calendar.events.find(event => event.eventType === 'SPRING_BREAK')!.id
    expect(auditRecords([{ filename: 'international-leadership-of-texas.json', record: invalid }]).some((issue: { code: string }) => issue.code === 'INVALID_COVERED_BREAK_EVENT')).toBe(true)
  })

  it('validates subset publication settings and rejects a stale hidden metric', () => {
    const invalid = structuredClone(record)
    const calendar = invalid.schoolYears['2026-2027']!
    Object.assign(calendar, { publishStandaloneNoSchoolStatistic: 'false' })
    expect(auditRecords([{ filename: 'international-leadership-of-texas.json', record: invalid }]).some((issue: { code: string }) => issue.code === 'INVALID_STANDALONE_NO_SCHOOL_STATISTIC_VISIBILITY')).toBe(true)
    calendar.publishStandaloneNoSchoolStatistic = false
    calendar.statistics.push({ id: 'student-no-school-days', label: 'Overlapping subset', value: '8 days', basis: 'derived', explanation: 'Includes dates already inside Winter Break.' })
    expect(auditRecords([{ filename: 'international-leadership-of-texas.json', record: invalid }]).some((issue: { code: string }) => issue.code === 'HIDDEN_STANDALONE_STATISTIC_STORED')).toBe(true)
  })
})
