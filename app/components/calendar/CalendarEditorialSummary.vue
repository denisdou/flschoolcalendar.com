<script setup lang="ts">
import type { CalendarEditorialSummary } from '~~/shared/types/content'

const props = defineProps<{
  summary: CalendarEditorialSummary
  heading?: string
  collapsible?: boolean
}>()

const expanded = ref(false)

interface EditorialSegment {
  text: string
  emphasized: boolean
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const monthPattern = '(?:Jan(?:uary)?\\.?|Feb(?:ruary)?\\.?|Mar(?:ch)?\\.?|Apr(?:il)?\\.?|May|Jun(?:e)?\\.?|Jul(?:y)?\\.?|Aug(?:ust)?\\.?|Sep(?:t(?:ember)?)?\\.?|Oct(?:ober)?\\.?|Nov(?:ember)?\\.?|Dec(?:ember)?\\.?)'
const weekdayPattern = '(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)'
const dayPattern = '\\d{1,2}(?:st|nd|rd|th)?'
const datePattern = `(?:${weekdayPattern},?\\s+)?${monthPattern}\\s+${dayPattern}(?:\\s*(?:[-–—]|to|through)\\s*(?:${monthPattern}\\s+)?${dayPattern})?(?:,\\s*\\d{4})?`
const exactDatePattern = new RegExp(`^${datePattern}$`)

const paragraphSegments = computed<EditorialSegment[][]>(() => {
  const highlights = [...new Set(props.summary.highlights)]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
  const highlightedText = new Set(highlights)
  const pattern = new RegExp(`(${[...highlights.map(escapeRegExp), datePattern].join('|')})`, 'g')

  return props.summary.paragraphs.map(paragraph =>
    paragraph
      .split(pattern)
      .filter(Boolean)
      .map(text => ({
        text,
        emphasized: highlightedText.has(text) || exactDatePattern.test(text),
      })),
  )
})
</script>

<template>
  <div
    v-if="summary.paragraphs.length"
    id="editorial-summary"
    aria-labelledby="editorial-summary-heading"
  >
    <div class="section-heading">
      <div>
        <p v-if="!collapsible" class="eyebrow">Editorial summary</p>
        <h2 id="editorial-summary-heading">{{ heading || summary.heading }}</h2>
      </div>
    </div>

    <div id="calendar-editorial-copy" class="calendar-editorial-copy" :class="{ 'calendar-editorial-copy--collapsed': collapsible && !expanded }">
      <p v-for="(segments, paragraphIndex) in paragraphSegments" :key="paragraphIndex">
        <template v-for="(segment, segmentIndex) in segments" :key="segmentIndex">
          <strong v-if="segment.emphasized">{{ segment.text }}</strong>
          <template v-else>{{ segment.text }}</template>
        </template>
      </p>
    </div>
    <button v-if="collapsible" type="button" class="text-link calendar-notes-toggle" :aria-expanded="expanded" aria-controls="calendar-editorial-copy" @click="expanded = !expanded">
      {{ expanded ? 'Read less' : 'Read more' }}
    </button>
  </div>
</template>
