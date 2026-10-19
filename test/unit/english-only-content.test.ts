import { describe, expect, it } from 'vitest'
// @ts-ignore Dependency-free content loader, outside the application bundle.
import { loadRecords } from '../../scripts/check-content-quality.mjs'

// Explicitly approved English copy; this is not permission to restore translated
// page content or language resources across other districts.
const approvedAldineFaq = {
  question: 'Is the Aldine ISD 2026-2027 calendar available in Spanish?',
  answer: 'Yes. The district PDF includes a Spanish-language calendar on page two. Families should use the district’s current Calendar page when checking for later revisions or schedule changes.',
}

const approvedUnitedFaq = {
  question: 'Is the UISD 2026-2027 calendar available in Spanish?',
  answer: 'Yes. United ISD’s Academic Calendar page links English and Spanish versions of the 2026-2027 calendar.',
}

const approvedUnitedCalendarFaq = {
  question: 'Where can I find the official UISD 2026-2027 calendar?',
  answer: 'United ISD publishes its current 2026-2027 calendar on the district’s Academic Calendar page, with both English and Spanish versions available.',
}

const approvedPflugervilleFaq = {
  question: 'Is the PfISD 2026-2027 calendar available in Spanish or Vietnamese?',
  answer: 'Yes. The district’s Calendar page links Spanish and Vietnamese versions of the approved regular 2026-2027 calendar alongside the English PDF and text-based version. Dessau and Timmerman families should use their separate ACE campus calendars.',
}

// Verified on Collier's official calendar page; these are English answers about
// available source documents, not translated page content.
const approvedCollierFaqs: Record<string, { question: string; answer: string }> = {
  '2026-2027': {
    question: 'Where can I download the official calendar in another language?',
    answer: 'The district’s Academic & District Calendars page links the approved 2026-2027 PDF in English, Spanish and Creole. It also has the live district calendar. Use school notices and the district’s Weather Updates page for later operating changes.',
  },
  '2027-2028': {
    question: 'Where is the official 2027-2028 PDF?',
    answer: 'The Academic & District Calendars page links the approved calendar in English, Spanish and Creole under future calendars. The English PDF prints Board approval on January 20, 2026. Check the same page and district announcements for later updates.',
  },
}

// Hernando's official School Calendars page explicitly describes these language
// options. The FAQ remains English and refers families to the source documents.
const approvedHernandoFaq = {
  question: 'Is the calendar available in Spanish or Haitian Creole?',
  answer: 'The district says its downloadable documents are ADA accessible and available in Spanish, Haitian Creole and other languages once opened. Check the document’s language and accessibility options from the official School Calendars page.',
}

describe('English-only public district content', () => {
  it('keeps translation-related copy limited to explicitly approved source references', () => {
    const { records } = loadRecords()
    const findings: string[] = []
    function inspect(value: unknown, path: string) {
      if (typeof value === 'string') {
        const approvedGrandPrairieSourceReference = /^grand-prairie-isd\.json\.schoolYears\.(2026-2027|2027-2028)\.(?:sources\[\d+\]\.label|relatedResources\[\d+\]\.(?:label|description))$/.test(path)
          && /^(?:Grand Prairie ISD|Official) 202[67]-202[78] (?:GPISD )?calendar in Spanish$|^Spanish-language version linked on the district's official Calendar page\.$/.test(value)
        const approvedAustinWinterConflict = /^austin-isd\.json\.schoolYears\.2026-2027\.(?:highlights\[\d+\]\.note|comparativeInsights\[\d+\]|events\[\d+\]\.note|about\.updates|faqs\[\d+\]\.answer)$/.test(path)
          && /winter break/i.test(value)
          && /spanish important dates/i.test(value)
        if (/spanish|bilingual|español|espanol/i.test(value) && !approvedAustinWinterConflict && !approvedGrandPrairieSourceReference) findings.push(path)
      }
      else if (Array.isArray(value)) value.forEach((item, index) => inspect(item, `${path}[${index}]`))
      else if (value && typeof value === 'object') {
        const faq = value as Record<string, unknown>
        const approvedAldine = /^aldine-isd\.json\.schoolYears\.2026-2027\.faqs\[\d+\]$/.test(path)
          && faq.question === approvedAldineFaq.question
          && faq.answer === approvedAldineFaq.answer
        const approvedUnited = /^united-isd\.json\.schoolYears\.2026-2027\.faqs\[\d+\]$/.test(path)
          && [approvedUnitedFaq, approvedUnitedCalendarFaq].some(approvedFaq => (
            faq.question === approvedFaq.question && faq.answer === approvedFaq.answer
          ))
        const grandPrairieYear = path.match(/^grand-prairie-isd\.json\.schoolYears\.(2026-2027|2027-2028)\.faqs\[\d+\]$/)?.[1]
        const approvedGrandPrairie = grandPrairieYear
          && faq.question === `Is there a Spanish version of the Grand Prairie ISD ${grandPrairieYear} calendar?`
          && faq.answer === `Yes. GPISD provides a Spanish-language PDF on its official Calendar page, alongside the English version under the ${grandPrairieYear} school year.`
        const approvedPflugerville = /^pflugerville-isd\.json\.schoolYears\.2026-2027\.faqs\[\d+\]$/.test(path)
          && faq.question === approvedPflugervilleFaq.question
          && faq.answer === approvedPflugervilleFaq.answer
        const collierYear = path.match(/^collier-county-school-district\.json\.schoolYears\.(2026-2027|2027-2028)\.faqs\[\d+\]$/)?.[1]
        const approvedCollier = collierYear && approvedCollierFaqs[collierYear]
          && faq.question === approvedCollierFaqs[collierYear]!.question
          && faq.answer === approvedCollierFaqs[collierYear]!.answer
        const approvedHernando = /^hernando-county-school-district\.json\.schoolYears\.2026-2027\.faqs\[\d+\]$/.test(path)
          && faq.question === approvedHernandoFaq.question
          && faq.answer === approvedHernandoFaq.answer
        const approved = approvedAldine || approvedUnited || approvedGrandPrairie || approvedPflugerville || approvedCollier || approvedHernando
        for (const [key, child] of Object.entries(value)) {
          if (approved && (key === 'question' || key === 'answer')) continue
          // Preserve canonical official URLs and internal discovery evidence.
          if (!/url|href|id|filename/i.test(key)) inspect(child, `${path}.${key}`)
        }
      }
    }
    for (const { filename, record } of records) {
      inspect(record.page, filename + '.page')
      inspect(record.schoolYears, filename + '.schoolYears')
    }
    expect(findings).toEqual([])
  })
})
