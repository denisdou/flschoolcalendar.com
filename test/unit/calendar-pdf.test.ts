import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CalendarActions from '../../app/components/calendar/CalendarActions.vue'
import MonthlyCalendar from '../../app/components/calendar/MonthlyCalendar.vue'
import { monthlyCalendarEvents, monthlyCalendarListEvents } from '../../shared/utils/calendarMonthlyEvents.mjs'
import { calendarPdfDownloadUrl, calendarPdfFilename } from '../../shared/utils/calendarPdf'
import { buildDistrictCalendarSchema } from '../../shared/utils/calendarSchema'
import { buildPdfJobs, pdfHash, pdfPalette } from '../../scripts/lib/calendar-pdf-data.mjs'
import { pdfIsCurrent } from '../../scripts/generate-pdfs.mjs'
import type { DistrictRecord } from '../../shared/types/content'

const root = process.cwd()
const records = readdirSync(join(root, 'server/data/districts/records')).filter(name => name.endsWith('.json'))
  .map(name => JSON.parse(readFileSync(join(root, 'server/data/districts/records', name), 'utf8')) as DistrictRecord)
const record = records.find(item => item.district.slug === 'hernando-county-school-district')!
const calendar = record.schoolYears['2026-2027']!
const palette = pdfPalette(readFileSync(join(root, 'app/assets/css/main.css'), 'utf8'))
const rendererHash = pdfHash(readFileSync(join(root, 'scripts/render-calendar-pdf.py')) + readFileSync(join(root, 'scripts/pdf-requirements.txt'), 'utf8'))

describe('site-owned printable calendars', () => {
  it('keeps filenames stable and versions the download with the article date rather than source verification', () => {
    const before = calendarPdfFilename(record.district, calendar)
    const updated = { ...calendar, contentUpdatedAt: '2026-10-27', verifiedAt: '2026-10-28' }
    expect(calendarPdfFilename(record.district, updated)).toBe(before)
    expect(calendarPdfDownloadUrl(record.district, updated)).toBe('/pdf/hernando-county-school-district-school-calendar-2026-2027.pdf?v=2026-10-27')
    expect(calendarPdfDownloadUrl(record.district, { ...updated, verifiedAt: '2026-10-29' })).toContain('?v=2026-10-27')
    expect(() => calendarPdfFilename({ slug: '../escape' }, calendar)).toThrow('Invalid calendar PDF filename')
  })

  it('uses local PDF links on desktop and mobile even when there is no official PDF', () => {
    const duval = records.find(item => item.district.slug === 'duval-county-public-schools')!
    const year = duval.schoolYears['2026-2027']!
    expect(year.actions.officialPdfUrl).toBeNull()
    const wrapper = mount(CalendarActions, { props: { district: duval.district, calendar: year } })
    const pdfLinks = wrapper.findAll('a').filter(link => link.attributes('aria-label') === 'Download PDF' || link.text() === 'Download PDF')
    expect(pdfLinks).toHaveLength(2)
    for (const link of pdfLinks) {
      expect(link.attributes('href')).toBe(calendarPdfDownloadUrl(duval.district, year))
      expect(link.attributes('download')).toBeUndefined()
      expect(link.attributes('target')).toBe('_blank')
      expect(link.attributes('rel')).toBe('noopener noreferrer')
    }
    expect(wrapper.text()).not.toContain('View Official Calendar')
    wrapper.unmount()
  })

  it('gives calendar variants distinct files and preserves their scopes', () => {
    const jobs = buildPdfJobs(records, palette)
    expect(new Set(jobs.map(job => job.filename)).size).toBe(jobs.length)
    const charlotte = jobs.filter(job => job.payload.districtSlug === 'charlotte-county-school-district')
    expect(charlotte).toHaveLength(3)
    expect(charlotte.map(job => job.filename)).toContain('charlotte-county-school-district-school-calendar-2026-2027-early-head-start.pdf')
    expect(jobs.some(job => job.payload.districtSlug === 'indian-river-county-school-district' && job.payload.year === '2027-2028')).toBe(false)
    const unaudited = structuredClone(record)
    unaudited.schoolYears['2026-2027']!.verifiedAt = null
    expect(() => buildPdfJobs([unaudited], palette)).toThrow('Audit and article update dates')
  })

  it('keeps student/family details and attendance contingencies consistent with the detail page', () => {
    const jobs = buildPdfJobs(records, palette)
    const hernando = jobs.find(job => job.payload.districtSlug === record.district.slug)!.payload
    expect(hernando.earlyRelease).toHaveLength(10)
    expect(hernando.dayTones['2026-10-09']).toBe('important')
    expect(hernando.monthEvents.some(event => event.start === '2026-11-23' && event.conditional)).toBe(true)
    expect(hernando.monthEvents.some(event => event.start === '2026-11-25' && event.end === '2026-11-27' && !event.conditional)).toBe(true)
    expect(hernando).not.toHaveProperty('windows')
    expect(hernando).not.toHaveProperty('scope')
    expect(hernando).not.toHaveProperty('sources')
    const bradford = jobs.find(job => job.payload.districtSlug === 'bradford-county-school-district')!.payload
    expect(bradford.monthEvents.some(event => event.id === 'bradford-2026-2027-virtual-planning')).toBe(false)
    const spring = hernando.monthEvents.find(event => event.start === '2027-03-17')
    expect(spring?.start).toBe('2027-03-17')
    expect(spring?.end).toBe('2027-03-19')
    expect(palette.brand).toEqual([216 / 360, 1, .2])
  })

  it('uses the same grouped month lists as the visible web calendar', () => {
    const payload = buildPdfJobs([record], palette)[0]!.payload
    const events = monthlyCalendarEvents(calendar.events, calendar.firstDay, calendar.lastDay)
    expect(payload.monthEvents.map(event => event.id)).toEqual(monthlyCalendarListEvents(events, calendar.eventDisplayGroups).map(event => event.id))
    const wrapper = mount(MonthlyCalendar, { props: {
      districtName: record.district.name, events: calendar.events,
      eventDisplayGroups: calendar.eventDisplayGroups, firstDay: calendar.firstDay, lastDay: calendar.lastDay,
    } })
    const rows = wrapper.findAll('.month-event-list li')
    expect(rows.length).toBe(payload.monthEvents.length)
    payload.monthEvents.forEach((event, index) => expect(rows[index]!.text()).toContain(event.name))
    expect(wrapper.findAll('thead th').slice(0, 7).map(th => th.text())).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    wrapper.unmount()
  })

  it('excludes internal meetings and employee calendars while retaining student no-class days', () => {
    const modified = structuredClone(record)
    const year = modified.schoolYears['2026-2027']!
    const base = year.events.find(event => event.id === 'hernando-2026-2027-march-professional')!
    year.events.push(
      { ...base, id: 'board-only', name: 'School Board Meeting', dateStart: '2026-10-01' },
      { ...base, id: 'employee-only', name: 'Employee Workday', participantScope: 'Employees only', dateStart: '2026-10-02' },
      { ...base, id: 'staff-post-planning', name: 'Staff Post-Planning', dateStart: '2027-06-01' },
    )
    const payload = buildPdfJobs([modified], palette)[0]!.payload
    for (const events of [payload.monthEvents, payload.gridEvents]) {
      expect(events.some(event => ['board-only', 'employee-only', 'staff-post-planning'].includes(event.id))).toBe(false)
      expect(events.some(event => event.id === base.id)).toBe(true)
    }
  })

  it('has a current committed PDF asset for every published calendar, with no automatic rendering during builds', () => {
    const jobs = buildPdfJobs(records, palette)
    const manifest = JSON.parse(readFileSync(join(root, 'public/pdf/manifest.json'), 'utf8'))
    for (const job of jobs) {
      const bytes = readFileSync(join(root, 'public/pdf', job.filename))
      expect(pdfIsCurrent(job, manifest.calendars[job.filename], rendererHash, bytes), job.filename).toBe(true)
      expect(manifest.calendars[job.filename].contentUpdatedAt).toBe(job.payload.updatedAt)
      expect(manifest.calendars[job.filename].pages).toBeGreaterThanOrEqual(1)
      expect(manifest.calendars[job.filename].pages).toBeLessThanOrEqual(2)
      if (!job.payload.earlyRelease.length) expect(manifest.calendars[job.filename].pages).toBe(1)
    }
    expect(jobs.length).toBeGreaterThan(0)
    const compact = jobs.find(job => job.payload.districtSlug === 'gulf-county-school-district')!
    expect(compact.payload.earlyRelease.length).toBeGreaterThan(0)
    expect(manifest.calendars[compact.filename].pages).toBe(1)
    const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts
    expect(scripts.prebuild).toContain('pdf:check')
    expect(scripts.pregenerate).toContain('pdf:check')
    for (const hook of ['prebuild', 'pregenerate', 'predev']) expect(scripts[hook]).not.toContain('pdf:generate')
  })

  it('regenerates only for missing, changed or damaged files', () => {
    const payload = { updatedAt: '2026-10-23', title: 'Example' }
    const job = { payload }
    const bytes = Buffer.from('%PDF-1.4 example')
    const entry = { inputHash: pdfHash(JSON.stringify(payload) + 'renderer'), fileHash: pdfHash(bytes) }
    expect(pdfIsCurrent(job, entry, 'renderer', bytes)).toBe(true)
    expect(pdfIsCurrent(job, entry, 'changed-renderer', bytes)).toBe(false)
    expect(pdfIsCurrent({ payload: { ...payload, updatedAt: '2026-10-27' } }, entry, 'renderer', bytes)).toBe(false)
    expect(pdfIsCurrent(job, entry, 'renderer', Buffer.from('%PDF-damaged'))).toBe(false)
    expect(pdfIsCurrent(job, undefined, 'renderer', null)).toBe(false)
  })

  it('lists the local PDF in the calendar dataset without changing official source evidence', () => {
    const before = JSON.stringify(calendar.sources)
    const schema = buildDistrictCalendarSchema({ siteUrl: 'https://flschoolcalendar.com', path: '/hernando-county-school-district/2026-2027/', district: record.district, calendar, discovery: record.calendarDiscovery })
    const dataset = (schema['@graph'] as Array<Record<string, unknown>>).find(item => item['@type'] === 'Dataset')!
    expect(dataset.distribution).toContainEqual({ '@type': 'DataDownload', name: record.district.shortName + ' 2026–2027 printable calendar (PDF)', contentUrl: 'https://flschoolcalendar.com' + calendarPdfDownloadUrl(record.district, calendar), encodingFormat: 'application/pdf' })
    expect(JSON.stringify(calendar.sources)).toBe(before)
  })
})
