import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MonthlyCalendar from '../../app/components/calendar/MonthlyCalendar.vue'
import recordJson from '../fixtures/districts/fort-bend-isd.json'
import type { DistrictRecord } from '../../shared/types/content'

const record = recordJson as unknown as DistrictRecord
const calendar = record.schoolYears['2026-2027']!

describe('Fort Bend ISD 2026-2027 calendar content', () => {
  it('keeps generic exam markings separate from the senior final-exam event', () => {
    const genericExamIds = [
      'fbisd-2026-first-semester-exams',
      'fbisd-2027-second-semester-exams-may-21',
      'fbisd-2027-second-semester-exams-may-24-26',
    ]

    for (const id of genericExamIds) {
      expect(calendar.events.find(event => event.id === id)).toMatchObject({
        eventType: 'EXAM',
        officialLabel: 'Exams',
        nameBasis: 'derived',
      })
    }
    expect(calendar.events.find(event => event.id === 'fbisd-2027-senior-final-exams')).toMatchObject({
      eventType: 'FINAL_EXAM',
      officialLabel: 'Senior Exams',
      nameBasis: 'derived',
    })
  })

  it('stores the official regular and early-release hours and answers both intents', () => {
    expect(calendar.schoolHours).toEqual([
      expect.objectContaining({ scope: 'Elementary schools', regularHours: '8:05 a.m.-3:25 p.m.', earlyReleaseTime: '12:10 p.m.' }),
      expect.objectContaining({ scope: 'Middle schools', regularHours: '8:50 a.m.-4:10 p.m.', earlyReleaseTime: '1:25 p.m.' }),
      expect.objectContaining({ scope: 'High schools', regularHours: '7:30 a.m.-2:50 p.m.', earlyReleaseTime: '11:35 a.m.' }),
    ])
    expect(calendar.faqs.some(item => item.question === 'What time does school start and end in Fort Bend ISD?')).toBe(true)
    expect(calendar.faqs.some(item => item.question === 'What time is early release in Fort Bend ISD?')).toBe(true)
  })

  it('groups overlapping May 26 facts in the date cell instead of duplicating key-date rows', () => {
    const wrapper = mount(MonthlyCalendar, {
      props: {
        districtName: record.district.name,
        events: calendar.events,
        firstDay: calendar.firstDay,
        lastDay: calendar.lastDay,
        timeZone: record.district.timeZone,
      },
    })

    const tooltip = wrapper.find('time[datetime="2027-05-26"] .month-day-tooltip').text()
    expect(tooltip).toContain('Second-Semester Exams')
    expect(tooltip).toContain('All-Student Early Release')
    expect(tooltip).toContain('Last Day of School')
    expect(tooltip).toContain('Fourth Nine Weeks Ends')
    wrapper.unmount()
  })
})
