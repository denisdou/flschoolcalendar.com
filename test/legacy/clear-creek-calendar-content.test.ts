import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import record from '../fixtures/districts/clear-creek-isd.json'
// @ts-ignore Dependency-free build-time calculator, outside the application bundle.
import { calculateCalendarStatistics } from '../../scripts/lib/calendar-statistics.mjs'
// @ts-ignore Offline checker is intentionally dependency-free JavaScript.
import { auditRecords } from '../../scripts/check-content-quality.mjs'

const calendar = record.schoolYears['2026-2027']
const guideId = 'clear-creek-2026-2027-back-to-school-guide'
const pdfId = 'clear-creek-2026-2027-academic-calendar'

describe('Clear Creek ISD official-source reconciliation', () => {
  it('limits the Transition Day half-day claim to PK and kindergarten', () => {
    const transition = calendar.events.find(event => event.id === 'ccisd-2026-transition-day')
    expect(transition).toMatchObject({
      dateStart: '2026-08-11',
      schoolStatus: 'schools-open',
      gradeScope: 'Pre-K, kindergarten, Grade 6 and Grade 9',
      scheduleSourceId: guideId,
      scheduleType: null,
      scheduleDetails: [{ gradeScope: 'Pre-K and kindergarten', scheduleType: 'HALF_DAY', sourceId: guideId, basis: 'official' }],
      basis: 'official',
    })
    expect(transition).not.toHaveProperty('timeSourceId')
    expect(transition).not.toHaveProperty('scheduleTypeSourceId')
    expect(transition).not.toHaveProperty('scheduleScope')
    expect(transition).not.toHaveProperty('countsAsStudentAttendanceDay')
    expect(transition?.note).toContain('half day for Pre-K and kindergarten')
    expect(transition?.note).toContain('Sixth- and ninth-grade families should follow their campus instructions')
    expect(calendar.hero.mobileDescription).toContain('half day for PK and kindergarten')
    expect(calendar.editorialSummary.paragraphs[0]).toContain('half day for PK and kindergarten')
    expect(calendar.faqs.find(item => item.question.startsWith('Who attends'))?.answer).toContain('does not identify sixth- and ninth-grade Transition Day as a half day')
  })

  it('keeps the PDF first-day label while clarifying all-grade regular schedules', () => {
    expect(calendar.firstDay).toBe('2026-08-12')
    expect(calendar.lastDay).toBe('2027-05-20')
    expect(calendar.events).toHaveLength(23)
    const first = calendar.events.find(event => event.eventType === 'FIRST_DAY')
    expect(first).toMatchObject({
      name: 'First Day for All Other Grades',
      nameSourceId: pdfId,
      gradeScope: 'All grades other than Pre-K, kindergarten, Grade 6 and Grade 9',
      scheduleScope: 'All grades',
      scheduleStatus: 'regular',
      scheduleSourceId: guideId,
      attendanceStatusBasisSourceId: guideId,
    })
    expect(calendar.hero.mobileDescription).toContain('All grades follow the regular schedule August 12')
    expect(calendar.seo.description).not.toContain('starts Aug. 11-12')
    expect(calendar.seo.description).not.toContain('regular classes start')
    expect(calendar.seo.description).toContain('all grades follow regular schedules Aug. 12')
    expect(calendar.editorialSummary.paragraphs[0]).toContain('the first day for grades other than PK, kindergarten, sixth and ninth')
    expect(calendar.seo.title).toBe('Clear Creek ISD 2026-2027 School Calendar & Breaks')
    expect(calendar.seo.description.length).toBeLessThanOrEqual(160)
  })

  it('excludes the two conditional dates only under the published schedule', () => {
    const conditional = calendar.events.filter(event => event.schoolStatus === 'conditional-attendance')
    expect(conditional.map(event => event.dateStart)).toEqual(['2026-10-13', '2027-04-12'])
    for (const event of conditional) {
      expect(event).not.toHaveProperty('countsAsStudentAttendanceDay')
      expect(event).toHaveProperty('countsAsStudentAttendanceDayUnderPublishedSchedule', false)
      expect(calendar.noSchoolDayEventIds).not.toContain(event.id)
    }
  })

  it('records a time-only source conflict without choosing a Science Magnet time', () => {
    const early = calendar.events.filter(event => event.schoolStatus === 'early-dismissal')
    expect(early.map(event => event.dateStart)).toEqual(['2026-12-18', '2027-03-05', '2027-05-20'])
    for (const event of early) {
      expect(event).toMatchObject({
        sourceId: pdfId,
        sourceConflict: true,
        conflictSourceIds: [guideId],
        timeSourceId: guideId,
        conflictField: 'earlyReleaseTime.scienceMagnet',
        noteBasis: 'official',
        countsAsStudentAttendanceDay: true,
      })
      expect(event.note).not.toMatch(/Science Magnet|School Hours|sources disagree/)
      expect(event.note).not.toMatch(/12:10|1:00/)
    }
    expect(calendar.about.processing).toContain('WAVE/Science Magnet at 12:10 PM')
    expect(calendar.about.processing).toContain('Intermediate & Science Magnet at 1:00 PM')
    expect(calendar.about.processing).toContain('not an uncertain attendance date')
    expect(calendar.sources.find(source => source.id === guideId)?.url).toBe('https://www.ccisd.net/backtoschool')
    expect(calendar.sources.every(source => source.retrievedAt === '2026-10-04')).toBe(true)
    const repeatedModules = JSON.stringify([calendar.hero, calendar.editorialSummary, calendar.statistics, calendar.comparativeInsights, calendar.events])
    expect(repeatedModules).not.toMatch(/Science Magnet families|Science Magnet dismissal times need/)
    expect(calendar.highlights.find(item => item.label === 'Early-release schedules')?.note).toContain('Science Magnet families should confirm')
  })

  it('answers dismissal times and ECSE sessions, with only Science Magnet unresolved', () => {
    const answer = calendar.faqs.find(item => item.question === 'What time do Clear Creek ISD students leave on early-release days?')?.answer
    for (const text of [
      'elementary and Pre-K dismissal at 12:15 p.m.', 'intermediate schools at 1:00 p.m.',
      'WAVE Magnet at 12:10 p.m.', 'high schools at 11:30 a.m.',
      'Clear Horizons ECHS at 10:30 a.m.', 'Clear View HS at 10:55 a.m.',
      '7:55-10:00 a.m. for AM students', '10:15 a.m.-12:15 p.m. for PM students',
      'Science Magnet families should confirm with their campus',
      'academic calendar lists 12:10 p.m., while the School Hours table lists 1:00 p.m.',
    ]) expect(answer).toContain(text)
  })

  it('validates regular schedules and grade-scoped half-day evidence', () => {
    const audit = (data: typeof record) => auditRecords([{ filename: 'clear-creek-isd.json', record: data }])
    expect(audit(record)).toEqual([])
    const incomplete = structuredClone(record)
    const first = incomplete.schoolYears['2026-2027'].events.find(event => event.eventType === 'FIRST_DAY')!
    Object.assign(first, { scheduleSourceId: 'missing-source' })
    expect(audit(incomplete).some((issue: { code: string }) => issue.code === 'INCOMPLETE_REGULAR_SCHEDULE')).toBe(true)
    const unscoped = structuredClone(record)
    const transition = unscoped.schoolYears['2026-2027'].events.find(event => event.id === 'ccisd-2026-transition-day')!
    Object.assign(transition, { scheduleDetails: [{ gradeScope: '', scheduleType: 'HALF_DAY', sourceId: 'missing-source', basis: 'unsupported' }] })
    const issues = audit(unscoped)
    expect(issues.some((issue: { path: string }) => issue.path.endsWith('.scheduleDetails[0].gradeScope'))).toBe(true)
    expect(issues.some((issue: { code: string }) => issue.code === 'UNKNOWN_SCHEDULE_SOURCE_ID')).toBe(true)
    expect(issues.some((issue: { code: string }) => issue.code === 'INVALID_SCHEDULE_BASIS')).toBe(true)
  })

  it('requires a source conflict when an affected field is recorded', () => {
    const data = structuredClone(record)
    const early = data.schoolYears['2026-2027'].events.find(event => event.eventType === 'EARLY_RELEASE')!
    Object.assign(early, { sourceConflict: false })
    const issues = auditRecords([{ filename: 'clear-creek-isd.json', record: data }])
    expect(issues.some((issue: { code: string }) => issue.code === 'ORPHAN_CONFLICT_FIELD')).toBe(true)
  })

  it('uses the existing grading-period-start taxonomy and omits repeated notes', () => {
    const starts = calendar.events.filter(event => event.name === 'Grading Period Begins')
    expect(starts.map(event => event.dateStart)).toEqual(['2026-10-14', '2027-03-15'])
    for (const event of starts) {
      expect(event.eventType).toBe('GRADING_PERIOD_START')
      expect(event.note).toBeNull()
    }
    for (const event of calendar.events) {
      if (event.note === null) expect(event).not.toHaveProperty('noteBasis')
    }
  })

  it('keeps parent-facing FAQ intent without staff tails or parsing explanations', () => {
    expect(calendar.faqs).toHaveLength(20)
    expect(calendar.faqs.some(item => /How many student attendance days|Does CCISD mean/.test(item.question))).toBe(false)
    expect(calendar.faqs.some(item => item.question === 'When is Clear Creek ISD winter break in 2026-2027?')).toBe(true)
    expect(calendar.faqs.some(item => item.question === 'When do Clear Creek ISD students return after winter break?')).toBe(true)
    const visible = JSON.stringify([calendar.hero, calendar.editorialSummary, calendar.faqs])
    expect(visible).not.toMatch(/worked out from the calendar|ranges come from|date grid|May 21|May 24-25/)
    expect(new Set(calendar.faqs.map(item => item.question.toLowerCase())).size).toBe(20)
  })

  it('preserves the stored regular-semester figures and derived provenance', () => {
    const stored = calendar.statistics.map(item => [item.id, item.value, item.basis])
    const calculated = calculateCalendarStatistics(calendar).map((item: { id: string; value: string; basis: string }) => [item.id, item.value, item.basis])
    expect(stored).toEqual(calculated)
    expect(calendar.statistics[0]).toMatchObject({ value: '171 days', basis: 'derived' })
    expect(calendar.statistics[0].explanation).toContain('August 11 Transition Day is grade-specific and is not included')
    expect(calendar.statistics).toHaveLength(7)
  })

  it('exports the reconciled notes and conflict sources without stale dismissal times', () => {
    const ics = readFileSync(`test/fixtures${calendar.actions.staticIcsUrl}`, 'utf8').replace(/\r?\n[ \t]/g, '')
    expect(ics).toContain('DTSTAMP:20261004T000000Z')
    expect(ics).toContain('half day for Pre-K and kindergarten')
    expect(ics).toContain('Time source: https://www.ccisd.net/backtoschool')
    expect(ics).toContain('Schedule source: https://www.ccisd.net/backtoschool')
    expect(ics).toContain('Regular schedule: All grades')
    expect(ics).toContain('Pre-K and kindergarten: half day')
    expect(ics).toContain('Conflicting field: earlyReleaseTime.scienceMagnet')
    expect(ics).toContain('Conflicting official source: https://www.ccisd.net/backtoschool')
    expect(ics).not.toMatch(/WAVE\/Science Magnet|12:10 PM|1:00 PM/)
    expect(ics).toContain('CATEGORIES:GRADING_PERIOD_START')
    expect(ics).toContain('DTEND;VALUE=DATE:20261128')
    expect(ics).toContain('DTEND;VALUE=DATE:20270102')
    expect(ics).toContain('School status: If needed\\; attendance may change')
    const transition = ics.split('BEGIN:VEVENT').find(item => item.includes('UID:ccisd-2026-transition-day@'))!
    expect(transition).not.toContain('Time source:')
    expect(transition).not.toContain('modified schedule')
    const first = ics.split('BEGIN:VEVENT').find(item => item.includes('UID:ccisd-2026-first-day@'))!
    expect(first).toContain('SUMMARY:First Day for All Other Grades')
    expect(first).toContain('Regular schedule: All grades')
  })
})
