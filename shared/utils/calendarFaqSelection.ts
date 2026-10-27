import type { CalendarFaqItem } from '../types/content'

export const DETAIL_FAQ_LIMIT = 8

type Topic = (item: CalendarFaqItem) => boolean
const firstDay: Topic = ({ question }) => !/\b(?:times?|hours|bell|break|holiday|semester|trimester|quarter|graduation)\b/i.test(question)
  && /\bfirst day\b|\bwhen\b.*\b(?:start|starts|begin|begins)\b|\bdoes\b.*\bstart school\b|\bgo back\b.*\baugust\b/i.test(question)
const lastDay: Topic = ({ question }) => /\blast day\b|\bstart and end\b|\bfirst and last\b/i.test(question)
const thanksgiving: Topic = ({ question }) => /thanksgiving/i.test(question)
const winter: Topic = ({ question }) => /winter|christmas/i.test(question) && /break|holiday/i.test(question)
  && !/\breturn\b|\bresume\b|\bgo back\b/i.test(question.replace(/,?\s*and when.*$/i, ''))
const spring: Topic = ({ question }) => /spring break/i.test(question) && !/\breturn\b|\bresume\b/i.test(question)
const earlyRelease: Topic = ({ question }) => /early[ -](?:release|dismissal)|half[ -]days?|dismiss early|leave early/i.test(question)
const weather: Topic = ({ question }) => /hurricane|weather|make[ -]?up/i.test(question)
const coreTopics = [firstDay, lastDay, thanksgiving, winter, spring, earlyRelease, weather]

function earlyReleasePriority({ question }: CalendarFaqItem): number {
  return (/every monday|each monday/i.test(question) ? 20 : 0)
    + (/\bdates\b|\bwhich days\b|\bwhen are\b/i.test(question) ? 10 : 0)
    - (/\bwhat time\b|\bhours\b|\blast day\b/i.test(question) ? 20 : 0)
}

/** Select existing answers only: prioritize planning needs without rewriting facts. */
export function selectCalendarFaqs(items: CalendarFaqItem[]): CalendarFaqItem[] {
  const seen = new Set<string>()
  const available = items.filter((item) => {
    const key = item.question.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!key || !item.answer.trim() || seen.has(key)) return false
    seen.add(key)
    return true
  })
  const selected: CalendarFaqItem[] = []
  const pick = (topic: Topic, rank?: (item: CalendarFaqItem) => number) => {
    if (selected.length >= DETAIL_FAQ_LIMIT || selected.some(topic)) return
    const candidates = available.filter(item => !selected.includes(item) && topic(item))
    if (rank) candidates.sort((a, b) => rank(b) - rank(a))
    if (candidates[0]) selected.push(candidates[0])
  }
  for (const topic of coreTopics) {
    pick(topic, topic === earlyRelease ? earlyReleasePriority
      : topic === weather ? ({ question }) => /\bdates\b|\bwhat are\b|\bwhich days\b/i.test(question) ? 10 : 0
        : undefined)
  }

  // Keep room for district/program exceptions rather than similar holiday questions.
  const specific: Topic = ({ question }) => /rodeo|suwannee|\bfair\b|time zones?|march 5|december 20|saturdays?|class[ -]swap/i.test(question)
  const scope: Topic = ({ question }) => /which.*schools.*(?:use|follow)|is this calendar for|same as.*regular|schools and grades/i.test(question)
  if (available[0] && scope(available[0])) pick(scope)
  pick(specific)
  pick(({ question }) => /fall break|intersession/i.test(question))
  pick(({ question }) => /return|resume|go back/i.test(question) && /winter|christmas|january/i.test(question))
  pick(({ question }) => /what time/i.test(question) && /dismiss|release/i.test(question))
  pick(scope)
  pick(({ question }) => /official.*calendar|calendar.*pdf/i.test(question))
  for (const item of available) {
    if (selected.length >= DETAIL_FAQ_LIMIT) break
    if (selected.includes(item)) continue
    if (coreTopics.some(topic => topic(item) && selected.some(topic))) continue
    selected.push(item)
  }
  return selected
}
