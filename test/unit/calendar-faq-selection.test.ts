import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mount, shallowMount } from '@vue/test-utils'
import { DETAIL_FAQ_LIMIT, selectCalendarFaqs } from '../../shared/utils/calendarFaqSelection'
import { buildDistrictCalendarSchema } from '../../shared/utils/calendarSchema'
import CalendarFaq from '../../app/components/calendar/CalendarFaq.vue'
import DistrictCalendarPage from '../../app/components/calendar/DistrictCalendarPage.vue'
import type { CalendarFaqItem, DistrictRecord } from '../../shared/types/content'

const directory = join(process.cwd(), 'server/data/districts/records')
const records = readdirSync(directory).filter(name => name.endsWith('.json'))
  .map(name => JSON.parse(readFileSync(join(directory, name), 'utf8')) as DistrictRecord)
const findRecord = (slug: string) => records.find(record => record.district.slug === slug)!

describe('selected detail-page FAQs', () => {
  it('prioritizes eight planning questions rather than taking the first eight', () => {
    const calendar = findRecord('hernando-county-school-district').schoolYears['2026-2027']!
    const selected = selectCalendarFaqs(calendar.faqs)
    expect(selected).toHaveLength(8)
    expect(selected.map(item => item.question)).toEqual([
      'When does the 2026-27 school year start in Hernando County?',
      'When is the last day of school in Hernando County in 2027?',
      'When is Thanksgiving break for Hernando County schools?',
      'When is Hernando County winter break, and when do students return?',
      'When is spring break for Hernando County schools in 2027?',
      'What are the early-release days for the 2026-27 school year?',
      'Which dates could become hurricane make-up school days?',
      'Does Hernando County have a fall break in 2026?',
    ])
    expect(selected.map(item => item.question)).not.toEqual(calendar.faqs.slice(0, 8).map(item => item.question))
  })

  it('preserves district exceptions and the scope of specialized calendars', () => {
    const questions = (slug: string, year = '2026-2027') => selectCalendarFaqs(findRecord(slug).schoolYears[year]!.faqs).map(item => item.question)
    expect(questions('gadsden-county-school-district')).toContain('Is March 5, 2027, a half day for students?')
    expect(questions('gulf-county-school-district')).toContain('Do Port St. Joe and Wewahitchka use the same time zone?')
    expect(questions('holmes-county-school-district')).toContain('Is there school on Rodeo Holiday in 2026?')
    expect(questions('charlotte-county-school-district', '2026-2027-early-head-start')).toContain('Is this calendar for Early Head Start, Head Start or VPK?')
    expect(questions('miami-dade-county-public-schools', '2026-2027-juvenile-justice')).toContain('Does the Miami-Dade Juvenile Justice Center have school on Saturdays?')
  })

  it('uses the same selection for visible questions and structured data on every published calendar', () => {
    let checked = 0
    for (const record of records) for (const calendar of Object.values(record.schoolYears).filter(item => item.indexable)) {
      const before = JSON.stringify(calendar.faqs)
      const selected = selectCalendarFaqs(calendar.faqs)
      expect(selected.length).toBeGreaterThanOrEqual(5)
      expect(selected.length).toBeLessThanOrEqual(DETAIL_FAQ_LIMIT)
      for (const item of selected) expect(calendar.faqs).toContain(item)
      const schema = buildDistrictCalendarSchema({ siteUrl: 'https://flschoolcalendar.com', path: '/example/2026-2027/', district: record.district, calendar, discovery: record.calendarDiscovery })
      const faq = (schema['@graph'] as Array<Record<string, unknown>>).find(node => node['@type'] === 'FAQPage')!
      expect(faq.mainEntity).toEqual(selected.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })))
      expect(JSON.stringify(calendar.faqs)).toBe(before)
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('keeps small sets intact and omits empty or duplicate questions without manufacturing more', () => {
    const items: CalendarFaqItem[] = [
      { question: 'When is the first day of school?', answer: 'August 11.' },
      { question: ' When is the first day of school? ', answer: 'August 11.' },
      { question: 'When is spring break?', answer: 'March 15–19.' },
      { question: ' ', answer: 'No question.' },
      { question: 'When do classes end?', answer: ' ' },
    ]
    expect(selectCalendarFaqs(items)).toEqual([items[0], items[2]])
    expect(selectCalendarFaqs([])).toEqual([])
    const record = findRecord('hernando-county-school-district')
    const calendar = record.schoolYears['2026-2027']!
    const wrapper = shallowMount(DistrictCalendarPage, { props: { district: record.district, calendar: { ...calendar, faqs: [] }, calendars: [calendar], relatedResources: [], nearbyDistricts: [], otherDistricts: [] } })
    expect(wrapper.findComponent(CalendarFaq).exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders only the selected questions in accessible expandable answers', async () => {
    const record = findRecord('hernando-county-school-district')
    const items = selectCalendarFaqs(record.schoolYears['2026-2027']!.faqs)
    const wrapper = mount(CalendarFaq, { props: { items } })
    expect(wrapper.findAll('details')).toHaveLength(8)
    expect(wrapper.findAll('summary').map(item => item.text().replace(/\+$/, '').trim())).toEqual(items.map(item => item.question))
    expect(wrapper.findAll('details[open]')).toHaveLength(2)
    expect(wrapper.findAll('p').map(item => item.text())).toContain(items[0]!.answer)
    expect(wrapper.text()).not.toContain('Is there school on Election Day, November 3, 2026?')
    wrapper.unmount()
  })
})
