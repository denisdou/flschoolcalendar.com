import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import CalendarEventsTable from '../../app/components/calendar/CalendarEventsTable.vue'
import MonthlyCalendar from '../../app/components/calendar/MonthlyCalendar.vue'
import DistrictCalendarHub from '../../app/components/district/DistrictCalendarHub.vue'
import record from '../fixtures/districts/round-rock-isd.json'
import type { CalendarEvent, DistrictRecord } from '../../shared/types/content'
import { buildDistrictCalendarSchema, buildDistrictHubSchema } from '../../shared/utils/calendarSchema'
import { buildDistrictCatalog } from '../../shared/utils/districts'
// @ts-ignore Dependency-free offline content validator.
import { auditRecords } from '../../scripts/check-content-quality.mjs'
// @ts-ignore Dependency-free statistics calculator.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'

const previousClosures = {
  '2026-2027': [
    ['2026-09-07', '2026-09-07'], ['2026-09-21', '2026-09-21'],
    ['2026-10-09', '2026-10-12'], ['2026-10-19', '2026-10-19'],
    ['2026-11-23', '2026-11-27'], ['2026-12-18', '2027-01-04'],
    ['2027-01-18', '2027-01-18'], ['2027-02-12', '2027-02-15'],
    ['2027-03-10', '2027-03-10'], ['2027-03-15', '2027-03-19'],
    ['2027-03-26', '2027-03-26'],
  ],
  '2027-2028': [
    ['2027-09-06', '2027-09-06'], ['2027-09-20', '2027-09-20'],
    ['2027-10-08', '2027-10-11'], ['2027-11-01', '2027-11-01'],
    ['2027-11-22', '2027-11-26'], ['2027-12-17', '2028-01-03'],
    ['2028-01-17', '2028-01-17'], ['2028-02-18', '2028-02-21'],
    ['2028-03-13', '2028-03-20'], ['2028-04-14', '2028-04-14'],
  ],
}

function weekdays(start: string, end: string) {
  const result: string[] = []
  for (const date = new Date(start + 'T00:00:00Z'); date.toISOString().slice(0, 10) <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) result.push(date.toISOString().slice(0, 10))
  }
  return result
}

describe('Round Rock ISD official atoms and family-planning breaks', () => {
  it('passes the content gate and pins current revisions rather than an older draft', () => {
    expect(auditRecords([{ filename: 'round-rock-isd.json', record }])).toEqual([])
    expect(record.calendarDiscovery.crawlerNotes).toContain('older Draft B')
    expect(record.calendarDiscovery.lastCheckedAt).toBe('2026-10-06')
    expect(record.schoolYears['2026-2027'].lastOfficialRevisionAt).toBe('2026-02-04')
    expect(record.schoolYears['2027-2028'].lastOfficialRevisionAt).toBe('2026-08-13')
  })

  for (const year of ['2026-2027', '2027-2028'] as const) {
    const calendar = record.schoolYears[year]
    const events = calendar.events as CalendarEvent[]
    const event = (id: string) => events.find(item => item.id === id)!
    const currentYear = year === '2026-2027'
    const prefix = currentYear ? '2026' : '2027'
    const springYear = currentYear ? '2027' : '2028'
    const expectedClosures = [...new Set(previousClosures[year].flatMap(([start, end]) => weekdays(start!, end!)))].toSorted()

    describe(year, () => {
      it('preserves exactly the same 32 closed weekdays and 170 attendance days', () => {
        expect(events).toHaveLength(currentYear ? 25 : 24)
        expect(new Set(events.map(item => item.id)).size).toBe(events.length)
        expect(events.map(item => item.dateStart)).toEqual(events.map(item => item.dateStart).toSorted())
        const closures = [...new Set(events.filter(item => calendar.noSchoolDayEventIds.includes(item.id))
          .flatMap(item => weekdays(item.dateStart!, item.dateEnd || item.dateStart!)))].toSorted()
        expect(closures).toEqual(expectedClosures)
        expect(closures).toHaveLength(32)
        expect(calculateCalendarStatistics(calendar)).toEqual(calendar.statistics)
        expect(calendar.statistics.map(item => item.value)).toEqual(['170 days', '32 weekdays', '7 days', '18 consecutive days', '7', '3 breaks'])
        expect(calendar.statistics[0]!.basis).toBe(currentYear ? 'official' : 'derived')
      })

      it('keeps closure dates separate from classification, normalized names and editorial notes', () => {
        const sources = new Set(calendar.sources.map(item => item.id))
        for (const item of events) {
          expect(item).not.toHaveProperty('basis')
          expect(item).toMatchObject({ dateBasis: 'official', nameBasis: 'derived', eventTypeBasis: 'derived', schoolStatusBasis: 'derived' })
          expect(sources.has(item.sourceId)).toBe(true)
          if (item.note) {
            expect(item.noteBasis).toBe('derived')
            expect(item.noteSourceIds).toEqual([item.sourceId])
          }
          else {
            expect(item).not.toHaveProperty('noteBasis')
            expect(item).not.toHaveProperty('noteSourceIds')
          }
          for (const basis of Object.values(item.eventTypesBasis || {})) expect(basis).toBe('derived')
          if (item.id.includes('nine-weeks') && !item.id.includes('second-nine-weeks-end')) expect(item).not.toHaveProperty('officialLabel')
          else expect(item.officialLabel).toBeTruthy()
        }
        for (const item of calendar.keyDates) {
          expect(item).not.toHaveProperty('basis')
          expect(item).toMatchObject({ labelBasis: 'derived', eventTypeBasis: 'derived' })
        }
        expect(calendar.about.processing).toContain('attendance-status mappings')
        expect(calendar.about.processing).toContain('Grid legends are not event-specific official labels')
      })

      it('separates October and February staff days from student-and-staff holidays', () => {
        const octoberFriday = event(`round-rock-${prefix}-october-${currentYear ? '9' : '8'}-student-holiday`)
        const octoberMonday = event(`round-rock-${prefix}-october-${currentYear ? '12-student-holiday' : '11-you-day'}`)
        expect(octoberFriday).toMatchObject({ dateEnd: null, eventType: 'NON_STUDENT_DAY', schoolStatus: 'no-students' })
        expect(octoberMonday).toMatchObject({ dateEnd: null, schoolStatus: currentYear ? 'no-students' : 'no-classes' })
        expect(event(`round-rock-${springYear}-february-${currentYear ? '12' : '18'}-student-holiday`)).toMatchObject({ eventType: 'NON_STUDENT_DAY', schoolStatus: 'no-students', dateEnd: null })
        expect(event(`round-rock-${springYear}-february-${currentYear ? '15' : '21'}-you-day`)).toMatchObject({ eventType: 'HOLIDAY', schoolStatus: 'no-classes', dateEnd: null })
        expect(events.some(item => item.eventType === 'STUDENT_BREAK' || item.id.endsWith('-student-holidays') || item.id.endsWith('-winter-no-school-period'))).toBe(false)
        expect(calendar.noSchoolDayEventIds.every(id => events.some(item => item.id === id))).toBe(true)
      })

      it('keeps only the official Winter Break range in events and retains the 18-day planning break', () => {
        expect(event(`round-rock-${prefix}-winter-break`)).toMatchObject({
          dateStart: `${prefix}-12-${currentYear ? '21' : '20'}`, dateEnd: `${prefix}-12-31`,
          eventType: 'WINTER_BREAK', officialLabel: 'Student & Staff Holiday/Winter Break', schoolStatus: 'no-classes',
        })
        expect(event(`round-rock-${prefix}-december-${currentYear ? '18' : '17'}-student-holiday`)).toMatchObject({ eventType: 'NON_STUDENT_DAY', schoolStatus: 'no-students', dateEnd: null })
        expect(event(`round-rock-${springYear}-january-${currentYear ? '4' : '3'}-student-holiday`)).toMatchObject({ eventType: 'NON_STUDENT_DAY', schoolStatus: 'no-students', dateEnd: null })
        expect(calendar.breaks.find(item => item.name === 'Winter No-School Period')).toMatchObject({
          dateStart: `${prefix}-12-${currentYear ? '18' : '17'}`, dateEnd: `${springYear}-01-${currentYear ? '04' : '03'}`, schoolWeekdaysOff: 12,
          nextStudentAttendanceDate: `${springYear}-01-${currentYear ? '05' : '04'}`,
        })
        expect(calendar.breaks).toHaveLength(5)
      })

      it('preserves official Spring Break without classifying an extra March holiday as part of it', () => {
        expect(event(`round-rock-${springYear}-spring-break`)).toMatchObject({
          dateStart: `${springYear}-03-${currentYear ? '15' : '13'}`, dateEnd: `${springYear}-03-${currentYear ? '19' : '17'}`, eventType: 'SPRING_BREAK', schoolStatus: 'no-classes',
        })
        expect(events.some(item => item.id === 'round-rock-2028-spring-break-and-student-holiday')).toBe(false)
        if (!currentYear) {
          expect(event('round-rock-2028-march-20-student-holiday')).toMatchObject({ dateStart: '2028-03-20', dateEnd: null, eventType: 'NON_STUDENT_DAY', schoolStatus: 'no-students' })
          expect(calendar.breaks.find(item => item.dateStart === '2028-03-13')).toMatchObject({ dateEnd: '2028-03-20', schoolWeekdaysOff: 6 })
        }
      })

      it('uses parent-facing snippets and FAQs without internal record-production explanations', () => {
        expect(calendar.seo.title).toBe(`Round Rock ISD Calendar ${currentYear ? '2026-27' : '2027-28'}: Holidays, Breaks & Hours`)
        expect(calendar.seo.description).toContain('Fall Break, Winter Break, Spring Break')
        if (!currentYear) expect(calendar.seo.description).toContain('Spring Break, YOU Days, conference days')
        expect(calendar.hero.mobileDescription).not.toContain('several long student-holiday weekends')
        expect(calendar.hero.desktopDescription).not.toContain('district observances')
        expect(calendar.faqs).toHaveLength(currentYear ? 20 : 23)
        expect(calendar.faqs.some(item => item.question.includes('2028-2029'))).toBe(false)
        const prose = JSON.stringify([calendar.faqs, calendar.hero, calendar.editorialSummary.paragraphs])
        expect(prose).not.toMatch(/supplied official files|this record|empty future-year pages|not stored as student events|district observances|sit on either side/)
        expect(calendar.faqs.some(item => /Why are May 28|Are May 26, Memorial Day/.test(item.question))).toBe(false)
      })

      it('covers Fall Break and Thanksgiving week in one FAQ without renaming the official event', () => {
        const matches = calendar.faqs.filter(item => item.question === `When is Round Rock ISD Fall Break in ${prefix}?`)
        expect(matches).toHaveLength(1)
        expect(matches[0]!.answer).toBe(currentYear
          ? 'Round Rock ISD labels November 23–27, 2026, as Fall Break. It falls during Thanksgiving week; students are off all five weekdays and return Monday, November 30.'
          : 'Round Rock ISD labels November 22–26, 2027, as Fall Break. It falls during Thanksgiving week, and students return Monday, November 29.')
        expect(event(`round-rock-${prefix}-fall-break`)).toMatchObject({
          eventType: 'FALL_BREAK', name: 'Fall Break', dateBasis: 'official',
          dateStart: `${prefix}-11-${currentYear ? '23' : '22'}`, dateEnd: `${prefix}-11-${currentYear ? '27' : '26'}`,
        })
        expect(calendar.breaks.find(item => item.name === 'Fall Break')?.nextStudentAttendanceDate).toBe(`${prefix}-11-${currentYear ? '30' : '29'}`)
        expect(events.some(item => item.eventType === 'THANKSGIVING_BREAK')).toBe(false)
        expect(calendar.faqs.filter(item => /Fall Break|Thanksgiving Break/.test(item.question))).toHaveLength(1)
      })

      it('answers both YOU Day dates in one standalone district-specific FAQ', () => {
        const matches = calendar.faqs.filter(item => item.question === `When are Round Rock ISD YOU Days in ${currentYear ? '2026-27' : '2027-28'}?`)
        expect(matches).toHaveLength(1)
        expect(matches[0]!.answer).toBe(currentYear
          ? 'Round Rock ISD lists YOU Day student and staff holidays on October 19, 2026, and February 15, 2027. The February date is also labeled Presidents’ Day.'
          : 'Round Rock ISD lists YOU Day student and staff holidays on October 11, 2027, and February 21, 2028. The October date is also labeled Indigenous Peoples’ Day and Columbus Day; the February date is also Presidents’ Day.')
        const youDays = events.filter(item => /YOU\s*Day/.test(item.officialLabel || ''))
        expect(youDays.map(item => item.dateStart)).toEqual(currentYear
          ? ['2026-10-19', '2027-02-15']
          : ['2027-10-11', '2028-02-21'])
        expect(youDays.every(item => item.schoolStatus === 'no-classes')).toBe(true)
        expect(calendar.faqs.some(item => item.question === 'Is October 19 another day off?')).toBe(false)
      })

      it('keeps calendar-change guidance in the disclaimer rather than a generic FAQ', () => {
        expect(calendar.faqs.some(item => item.question === 'Could these school dates change?')).toBe(false)
        expect(calendar.about.disclaimer).toContain('Families should confirm')
      })

      it('uses a standard Winter Break query and keeps separate holiday and return dates in the answer', () => {
        const faq = calendar.faqs.find(item => item.question === `When is Round Rock ISD Winter Break in ${currentYear ? '2026-27' : '2027-28'}?`)!
        expect(faq.answer).toContain(currentYear ? 'December 21–31, 2026, as Winter Break' : 'Winter Break runs December 20–31, 2027')
        expect(faq.answer).toContain(`December ${currentYear ? '18' : '17'} is a teacher workday`)
        expect(faq.answer).toContain(`January ${currentYear ? '4' : '3'} is a staff-development day`)
        expect(faq.answer).toContain(currentYear ? 'January 1 separately as New Year’s Day' : 'Monday, January 3')
        expect(faq.answer).toContain(`return Tuesday, January ${currentYear ? '5, 2027' : '4, 2028'}`)
        expect(calendar.faqs.some(item => ['What is the full winter no-school period?', 'How long are students out around Winter Break?'].includes(item.question))).toBe(false)
      })

      it('uses the standard last-day search phrase without changing the published answer', () => {
        const faq = calendar.faqs.find(item => item.question === `When is the last day of school for Round Rock ISD in ${currentYear ? '2026-27' : '2027-28'}?`)!
        expect(faq.answer).toBe(currentYear
          ? 'The last day for students is Thursday, May 27, 2027. It also closes the second semester and fourth nine-week grading period.'
          : 'The final student day is Thursday, May 25, 2028. The second semester and fourth nine-week grading period also end that day.')
        expect(calendar.faqs.some(item => ['When is the final day of classes in 2027?', 'When does the 2027-2028 school year finish?'].includes(item.question))).toBe(false)
      })

      it('renders every official closure as a non-school day in the monthly calendar', () => {
        const wrapper = mount(MonthlyCalendar, { props: { districtName: 'Round Rock ISD', events, firstDay: calendar.firstDay, lastDay: calendar.lastDay } })
        try {
          for (const date of expectedClosures) {
            const time = wrapper.find(`.month-calendar table time[datetime="${date}"]`)
            expect(time.exists()).toBe(true)
            expect(time.element.closest('td')!.classList.contains('month-day--school-day')).toBe(false)
          }
          const returnDate = `${springYear}-01-${currentYear ? '05' : '04'}`
          expect(wrapper.find(`.month-calendar table time[datetime="${returnDate}"]`).element.closest('td')!.classList.contains('month-day--school-day')).toBe(true)
        }
        finally { wrapper.unmount() }
      })

      it('groups the last-day grading milestone and student endpoint in one display row', () => {
        const lastDayEvents = events.filter(item => item.dateStart === calendar.lastDay)
        const wrapper = mount(CalendarEventsTable, { props: { events: lastDayEvents, districtName: 'Round Rock ISD', schoolYear: year } })
        try {
          expect(lastDayEvents).toHaveLength(2)
          expect(wrapper.findAll('tbody tr')).toHaveLength(1)
          expect(wrapper.text()).toContain('Fourth Nine Weeks Ends')
          expect(wrapper.text()).toContain('Last Day of School')
          expect(wrapper.text()).not.toContain('Early dismissal')
        }
        finally { wrapper.unmount() }
      })

      it('exports atomic ICS ranges with exclusive end dates rather than composite closure UIDs', () => {
        const ics = readFileSync('test/fixtures' + calendar.actions.staticIcsUrl, 'utf8').replace(/\r\n /g, '')
        const entries = ics.split('BEGIN:VEVENT').slice(1)
        expect(entries).toHaveLength(events.length)
        for (const item of events) {
          const matching = entries.filter(entry => entry.includes(`UID:${item.id}@`))
          expect(matching).toHaveLength(1)
          expect(matching[0]).toContain('DTSTART;VALUE=DATE:' + item.dateStart!.replaceAll('-', ''))
          const exclusiveEnd = new Date((item.dateEnd || item.dateStart) + 'T00:00:00Z')
          exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1)
          expect(matching[0]).toContain('DTEND;VALUE=DATE:' + exclusiveEnd.toISOString().slice(0, 10).replaceAll('-', ''))
        }
        expect(ics).not.toMatch(/UID:round-rock-\d{4}-(?:october-student-holidays|winter-no-school-period|february-student-holidays|spring-break-and-student-holiday)@/)
      })
    })
  }

  it('retains January 1 English/Spanish label differences without inventing an attendance conflict', () => {
    const calendar = record.schoolYears['2026-2027']
    const january = calendar.events.find(item => item.id === 'round-rock-2027-new-years-day')!
    expect(january).toMatchObject({ dateStart: '2027-01-01', dateEnd: null, officialLabel: 'Student & Staff Holiday/New Year’s Day', noteBasis: 'derived', schoolStatus: 'no-classes' })
    expect(january.note).toContain('Spanish calendar calls it a winter holiday')
    expect(january).not.toHaveProperty('sourceConflict')
    expect(calendar.keyDates.find(item => item.label === 'Winter holidays')).toMatchObject({ eventType: 'STUDENT_BREAK', dateStart: '2026-12-21', dateEnd: '2027-01-01', dateBasis: 'derived', labelBasis: 'derived' })
  })

  it('describes religious observances as source labels and compares school years with concrete dates', () => {
    expect(record.schoolYears['2026-2027'].editorialSummary.paragraphs[2]).toContain('that the calendar also labels Eid al-Fitr')
    expect(record.schoolYears['2027-2028'].faqs.find(item => item.question === 'What changed from the prior school year?')!.answer).toContain('starts August 18 instead of August 19 and ends May 25 instead of May 27')
  })

  it('keeps the 2026 hero break label exact and the Eid question non-causal', () => {
    const calendar = record.schoolYears['2026-2027']
    expect(calendar.hero.desktopDescription).toContain('Winter Break December 21–31')
    expect(calendar.hero.desktopDescription).toContain('New Year’s Day and adjacent student holidays')
    expect(calendar.hero.desktopDescription).toContain('from December 18 through January 4')
    expect(calendar.hero.desktopDescription).not.toContain('winter holidays December 21–January 1')
    const eid = calendar.faqs.filter(item => item.question.includes('Eid al-Fitr'))
    expect(eid).toEqual([{
      question: 'What does the Round Rock ISD calendar show for Eid al-Fitr in 2027?',
      answer: 'March 10 is a student holiday and staff-development day; the calendar also identifies the date as Eid al-Fitr.',
    }])
  })

  it('answers the 2027 attendance-day intent with a calculation, not a claimed official total', () => {
    const calendar = record.schoolYears['2027-2028']
    expect(weekdays(calendar.firstDay, calendar.lastDay)).toHaveLength(202)
    expect(calendar.statistics[0]).toMatchObject({ value: '170 days', basis: 'derived' })
    const faq = calendar.faqs.find(item => item.question === 'How many student attendance days are scheduled in 2027-2028?')!
    expect(faq.answer).toContain('does not print an instructional-day total')
    expect(faq.answer).toContain('202 scheduled weekdays')
    expect(faq.answer).toContain('32 published no-school weekdays gives 170 student attendance days')
    expect(faq.answer).not.toContain('lists 170 instructional days')
  })

  it('moves future-calendar intent to the opt-in hub and its schema only', () => {
    expect(record.page.faqs).toHaveLength(1)
    const future = record.page.faqs[0]!
    expect(future.question).toBe('Has Round Rock ISD published its 2028-2029 school calendar yet?')
    expect(future.answer).toContain('As of October 6, 2026')
    expect(future.answer).toContain('Check that page for new releases')
    expect(record.page.relatedResources.some(item => item.href === '/round-rock-isd/' && !item.external)).toBe(true)
    const siteUrl = 'https://flschoolcalendar.com'
    const hub = buildDistrictHubSchema(record as DistrictRecord, siteUrl) as { '@graph': any[] }
    expect(hub['@graph'].find(item => item['@type'] === 'CollectionPage').url).toBe(siteUrl + '/round-rock-isd/')
    expect(hub['@graph'].find(item => item['@type'] === 'FAQPage').mainEntity.map((item: any) => item.name)).toEqual([future.question])
    expect(hub['@graph'].find(item => item['@type'] === 'ItemList').itemListElement.map((item: any) => item.url)).toEqual([
      siteUrl + '/round-rock-isd/2026-2027/', siteUrl + '/round-rock-isd/2027-2028/',
    ])
    for (const calendar of Object.values(record.schoolYears)) {
      const schema = buildDistrictCalendarSchema({ siteUrl, path: `/round-rock-isd/${calendar.schoolYear}/`, district: record.district, calendar: calendar as DistrictRecord['schoolYears'][string], discovery: record.calendarDiscovery }) as { '@graph': any[] }
      expect(JSON.stringify(schema)).not.toContain('Has Round Rock ISD published its 2028-2029 school calendar yet?')
    }
    expect(buildDistrictCatalog([record as DistrictRecord]).districts[0]!.hubHref).toBe('/round-rock-isd/')
    const noHub = structuredClone(record) as DistrictRecord
    delete noHub.page.faqs
    expect(buildDistrictCatalog([noHub]).districts[0]).not.toHaveProperty('hubHref')
  })

  it('renders the hub FAQ once and links to both real school years without a future placeholder', () => {
    const wrapper = mount(DistrictCalendarHub, {
      props: { record: record as DistrictRecord },
      global: { stubs: { PageIntroSection: true, NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
    })
    try {
      expect(wrapper.findAll('.calendar-faq-item')).toHaveLength(1)
      expect(wrapper.text()).toContain(record.page.faqs[0]!.question)
      expect(wrapper.find('a[href="/round-rock-isd/2026-2027/"]').exists()).toBe(true)
      expect(wrapper.find('a[href="/round-rock-isd/2027-2028/"]').exists()).toBe(true)
      expect(wrapper.find('a[href="/round-rock-isd/2028-2029/"]').exists()).toBe(false)
      expect(wrapper.find('a[href="/round-rock-isd/"]').exists()).toBe(false)
    }
    finally { wrapper.unmount() }
  })
})
