import { describe, expect, it } from 'vitest'
// @ts-ignore The production content checker is intentionally a dependency-free Node module.
import { auditRecords, loadRecords } from '../../scripts/check-content-quality.mjs'
import ideaRecord from '../fixtures/districts/idea-public-schools.json'
import saisdRecord from '../fixtures/districts/san-antonio-isd.json'

function record(slug: string) {
  return {
    filename: `${slug}.json`,
    record: {
      district: { name: `${slug} ISD`, shortName: `${slug} ISD`, slug, county: 'Example County' },
      calendarDiscovery: {
        officialWebsiteUrl: 'https://example.org',
        calendarPageUrl: 'https://example.org/calendar',
        lastCheckedAt: '2026-09-30',
      },
      schoolYears: {
        '2026-2027': {
          schoolYear: '2026-2027',
          status: 'official',
          indexable: false,
          firstDay: '2026-08-17',
          lastDay: '2027-05-27',
          seo: { title: 'Example calendar', description: 'Example calendar description' },
          hero: {
            heading: 'Example calendar',
            mobileDescription: 'Example calendar summary.',
            desktopDescription: 'Example district calendar summary with dates and planning details.',
          },
          editorialSummary: {
            heading: 'What families should know',
            paragraphs: ['This is a district-specific summary of the published school calendar and its dates.'],
            highlights: ['First day', 'Breaks', 'Last day'],
          },
          keyDates: [],
          actions: {},
          highlights: [],
          statistics: [],
          events: [],
          breaks: [],
          noSchoolDayEventIds: [],
          revisions: [],
          sources: [],
          relatedResources: [],
          faqs: [
            { question: 'When is the first day?', answer: 'The first student day is August 17, 2026, according to the district calendar.' },
          ],
          about: {
            dataSource: 'The dates come from the district calendar page.',
            processing: 'The published calendar was reviewed for student-facing dates.',
            updates: 'The official district calendar should be checked for later revisions.',
            disclaimer: 'Confirm schedule changes with the district.',
          },
        },
      },
    },
  }
}

describe('district content quality gate', () => {
  it('rejects missing and duplicate canonical break components', () => {
    const item = { filename: 'san-antonio-isd.json', record: structuredClone(saisdRecord) }
    const span = item.record.schoolYears['2026-2027'].breaks[0]!
    span.componentEventIds = ['missing-event']
    expect(auditRecords([item]).some(issue => issue.code === 'INVALID_BREAK_COMPONENT_ID')).toBe(true)
    span.componentEventIds = ['saisd-2026-october-pd', 'saisd-2026-october-pd']
    expect(auditRecords([item]).some(issue => issue.code === 'INVALID_BREAK_COMPONENT_ID')).toBe(true)
  })

  it('rejects attendance milestones and no-school events outside a break', () => {
    const item = { filename: 'san-antonio-isd.json', record: structuredClone(saisdRecord) }
    const span = item.record.schoolYears['2026-2027'].breaks[0]!
    item.record.schoolYears['2026-2027'].events.find(event => event.id === 'saisd-2026-first-grading-period-end')!.dateStart = '2026-10-10'
    span.componentEventIds = ['saisd-2026-first-grading-period-end']
    expect(auditRecords([item]).some(issue => issue.code === 'INVALID_BREAK_COMPONENT_EVENT')).toBe(true)
    span.componentEventIds = ['saisd-2026-labor-day']
    expect(auditRecords([item]).some(issue => issue.code === 'INVALID_BREAK_COMPONENT_EVENT')).toBe(true)
  })

  it('blocks a derived attendance total while official attendance dates are unresolved', () => {
    const item = record('alpha')
    Object.assign(item.record.schoolYears['2026-2027'], {
      attendanceUncertaintyDates: ['2027-01-05'],
      statistics: [{ id: 'student-attendance-days', label: 'Student attendance days', value: '180 days', basis: 'derived', explanation: 'Calculated from the first and last student dates.' }],
    })

    expect(auditRecords([item]).some(issue => issue.code === 'UNRESOLVED_ATTENDANCE_TOTAL')).toBe(true)
  })

  it('rejects duplicate and out-of-year unresolved attendance dates', () => {
    const item = record('alpha')
    Object.assign(item.record.schoolYears['2026-2027'], {
      attendanceUncertaintyDates: ['2027-01-05', '2027-01-05', '2027-07-01'],
    })
    const issues = auditRecords([item])
    expect(issues.some(issue => issue.code === 'DUPLICATE_ATTENDANCE_UNCERTAINTY')).toBe(true)
    expect(issues.some(issue => issue.code === 'ATTENDANCE_UNCERTAINTY_OUTSIDE_YEAR')).toBe(true)
  })

  it('has no publication-blocking errors in the complete record set', () => {
    const loaded = loadRecords()
    const errors = [...loaded.issues, ...auditRecords(loaded.records)]
      .filter(issue => issue.severity === 'error')

    expect(errors).toEqual([])
  })

  it('flags a FAQ answer that only returns a bare date', () => {
    const item = record('alpha')
    const calendar = Object.values(item.record.schoolYears)[0] as { faqs: Array<{ answer: string }> }
    calendar.faqs[0]!.answer = 'August 1.'

    const issues = auditRecords([item])

    expect(issues.some(issue => issue.code === 'THIN_FAQ_ANSWER')).toBe(true)
  })

  it('flags a no-school-day reference that does not resolve to a canonical event', () => {
    const item = record('alpha')
    const calendar = Object.values(item.record.schoolYears)[0] as { noSchoolDayEventIds: string[] }
    calendar.noSchoolDayEventIds = ['missing-event']

    const issues = auditRecords([item])

    expect(issues.some(issue => issue.code === 'ORPHAN_NO_SCHOOL_DAY_ID')).toBe(true)
  })

  it('rejects an invalid event taxonomy provenance value', () => {
    const item = record('alpha')
    const calendar = Object.values(item.record.schoolYears)[0] as { events: unknown[] }
    calendar.events = [{
      id: 'alpha-break',
      dateStart: '2026-12-21',
      dateEnd: '2027-01-01',
      eventType: 'WINTER_BREAK',
      eventTypeBasis: 'guessed',
      name: 'Winter Break',
      schoolStatus: 'no-classes',
      sourceId: 'alpha-source',
      note: null,
      basis: 'official',
    }]
    Object.assign(Object.values(item.record.schoolYears)[0], {
      sources: [{ id: 'alpha-source', label: 'Calendar', type: 'official-pdf', url: 'https://example.org/calendar.pdf' }],
    })

    const issues = auditRecords([item])

    expect(issues.some(issue => issue.code === 'INVALID_EVENT_TYPE_BASIS')).toBe(true)
  })

  it('flags cross-district FAQ and source-copy boilerplate', () => {
    const items = [record('alpha'), record('beta')]
    const genericFaqs = [
      ['When is the first day?', 'The published calendar identifies the first student attendance day for this school year.'],
      ['When is winter break?', 'The published calendar provides the complete winter recess dates and student return date.'],
      ['When is spring break?', 'The published calendar provides the complete spring recess dates and student return date.'],
      ['Where is the official PDF?', 'The official district calendar page provides the source document used for these dates.'],
      ['Can dates change?', 'Families should check district announcements before making plans because published dates may change.'],
    ].map(([question, answer]) => ({ question, answer }))
    const genericAbout = {
      dataSource: 'Dates come from the published school-year calendar supplied by the district calendar page for families.',
      processing: 'The source document was checked line by line. Student dates were recorded, multi-day ranges were checked for continuity, and unrelated employee entries were excluded from the family calendar.',
      updates: 'Families should review the linked district calendar page for later revisions, schedule details, and newly released school years before making plans.',
      disclaimer: 'This independent reference is not operated by the district. Confirm changes, bell times, and campus-specific events with the district or the student’s school.',
    }

    for (const item of items) {
      const [schoolYear, calendar] = Object.entries(item.record.schoolYears)[0]!
      item.record.schoolYears = { [schoolYear]: calendar }
      calendar.faqs = structuredClone(genericFaqs)
      calendar.about = structuredClone(genericAbout)
    }

    const issues = auditRecords(items)

    expect(issues.some(issue => issue.code === 'FAQ_ANSWER_BOILERPLATE')).toBe(true)
    expect(issues.some(issue => issue.code === 'ABOUT_BOILERPLATE')).toBe(true)
  })
})

describe('IDEA regional calendar regressions', () => {
  const ideaCalendars = Object.values(ideaRecord.schoolYears)

  it('keeps regional holidays atomic and regional page summaries distinct', () => {
    expect(new Set(ideaCalendars.map(calendar => calendar.seo.description)).size).toBe(8)
    expect(new Set(ideaCalendars.map(calendar => calendar.hero.mobileDescription)).size).toBe(8)
    expect(JSON.stringify(ideaRecord.schoolYears)).not.toMatch(/districtwide holiday|networkwide/i)

    const austin = ideaRecord.schoolYears['2026-2027-austin']
    expect(austin.events.find(event => event.id === 'idea-austin-2026-10-09-05')).toMatchObject({
      dateStart: '2026-10-09', dateEnd: null, eventType: 'HOLIDAY', basis: 'official',
    })
    expect(austin.events.find(event => event.id === 'idea-austin-2026-10-12-05b')).toMatchObject({
      dateStart: '2026-10-12', dateEnd: null, eventType: 'HOLIDAY', basis: 'official',
    })
  })

  it('preserves El Paso intersession as attendance-unknown', () => {
    const elPaso = ideaRecord.schoolYears['2026-2027-el-paso']
    const intersession = elPaso.events.find(event => event.id === 'idea-el-paso-2026-10-12-17')

    expect(intersession).toMatchObject({
      dateStart: '2026-10-12',
      dateEnd: '2026-10-16',
      eventType: 'INTERSESSION',
      eventTypeBasis: 'official',
      schoolStatus: 'unknown',
      schoolStatusReason: 'source-does-not-state',
      basis: 'official',
    })
    expect(intersession).not.toHaveProperty('countsAsStudentAttendanceDay')
    expect(intersession).not.toHaveProperty('scheduleType')
    expect(elPaso.attendanceUncertaintyDates).toEqual([
      '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16',
    ])
    expect(elPaso.statistics.some(statistic => statistic.id === 'student-attendance-days')).toBe(false)
  })

  it('keeps FAQ source processing out of parent-facing questions', () => {
    for (const calendar of ideaCalendars) {
      const questions = calendar.faqs.map(faq => faq.question)
      expect(questions.some(question => /return after winter break/i.test(question))).toBe(true)
      expect(questions.some(question => /return after spring break/i.test(question))).toBe(true)
      expect(questions.some(question => /include Spanish/i.test(question))).toBe(true)
      expect(questions.some(question => /grading periods end/i.test(question))).toBe(true)
      expect(questions.some(question => /pre-service teacher workdays|extracted copies/i.test(question))).toBe(false)

      const eventIds = new Set(calendar.events.map(event => event.id))
      expect(calendar.noSchoolDayEventIds.every(id => eventIds.has(id))).toBe(true)
    }
  })

  it('separates official IDEA Holiday labels from derived break taxonomy', () => {
    for (const calendar of ideaCalendars) {
      const breaks = calendar.events.filter(event => [
        'THANKSGIVING_BREAK', 'WINTER_BREAK', 'SPRING_BREAK',
      ].includes(event.eventType))

      expect(breaks).toHaveLength(3)
      for (const event of breaks) {
        expect(event).toMatchObject({
          name: 'IDEA Holiday',
          officialLabel: 'IDEA Holiday',
          nameBasis: 'official',
          dateBasis: 'official',
          displayNameBasis: 'derived',
          eventTypeBasis: 'derived',
        })
      }
    }
  })
})
