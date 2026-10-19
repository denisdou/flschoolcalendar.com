<script setup lang="ts">
import type { DistrictCatalogEntry } from '~~/shared/types/content'
import { districtMatchesSearch, formatDistrictSearchName } from '~~/shared/utils/content'

const props = defineProps<{
  modelValue: string
  districts: DistrictCatalogEntry[]
  excludedSlug?: string
  inputId: string
  label: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const root = ref<HTMLElement | null>(null)
const searchText = ref('')
const isOpen = ref(false)
const activeIndex = ref(-1)

const selectedDistrict = computed(() =>
  props.districts.find(district => district.slug === props.modelValue) || null,
)

const availableDistricts = computed(() => props.districts.filter(district =>
  district.slug !== props.excludedSlug,
))

const results = computed(() => {
  const term = searchText.value.trim()
  const matches = term
    ? availableDistricts.value.filter(district => districtMatchesSearch(district, term))
    : availableDistricts.value

  return matches.slice(0, 8)
})

const listboxId = computed(() => `${props.inputId}-results`)
const activeOptionId = computed(() => activeIndex.value >= 0
  ? `${props.inputId}-option-${activeIndex.value}`
  : undefined,
)

watch(selectedDistrict, (district) => {
  searchText.value = district?.name || ''
}, { immediate: true })

watch(results, (nextResults) => {
  if (!nextResults.length) {
    activeIndex.value = -1
  } else if (activeIndex.value < 0 || activeIndex.value >= nextResults.length) {
    activeIndex.value = 0
  }
})

function openResults() {
  isOpen.value = true
  activeIndex.value = results.value.length ? 0 : -1
}

function handleInput(event: Event) {
  searchText.value = (event.target as HTMLInputElement).value
  if (selectedDistrict.value?.name !== searchText.value) {
    emit('update:modelValue', '')
  }
  openResults()
}

function selectDistrict(district: DistrictCatalogEntry) {
  emit('update:modelValue', district.slug)
  searchText.value = district.name
  isOpen.value = false
  activeIndex.value = -1
}

function moveActive(direction: 1 | -1) {
  if (!isOpen.value) openResults()
  if (!results.value.length) return

  activeIndex.value = (activeIndex.value + direction + results.value.length) % results.value.length
}

function selectActive() {
  if (!isOpen.value) {
    openResults()
    return
  }

  const district = results.value[activeIndex.value]
  if (district) selectDistrict(district)
}

function closeResults() {
  isOpen.value = false
  activeIndex.value = -1
  searchText.value = selectedDistrict.value?.name || ''
}

function handleFocusout(event: FocusEvent) {
  const nextTarget = event.relatedTarget
  if (nextTarget instanceof Node && root.value?.contains(nextTarget)) return
  closeResults()
}
</script>

<template>
  <div ref="root" class="compare-district-search" @focusout="handleFocusout">
    <label class="control-label" :for="inputId">{{ label }}</label>
    <div class="compare-search-input-wrap">
      <span class="compare-search-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20" focusable="false">
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="m12.5 12.5 4 4" />
        </svg>
      </span>
      <input
        :id="inputId"
        :value="searchText"
        class="search-input compare-search-input"
        type="search"
        autocomplete="off"
        spellcheck="false"
        placeholder="Search by district, county, or region"
        role="combobox"
        aria-autocomplete="list"
        :aria-controls="listboxId"
        :aria-expanded="isOpen"
        :aria-activedescendant="isOpen ? activeOptionId : undefined"
        @focus="openResults"
        @input="handleInput"
        @keydown.down.prevent="moveActive(1)"
        @keydown.up.prevent="moveActive(-1)"
        @keydown.enter.prevent="selectActive"
        @keydown.esc.prevent="closeResults"
      >

      <div
        v-if="isOpen"
        :id="listboxId"
        class="compare-search-results"
        role="listbox"
        :aria-label="`${label} search results`"
      >
        <button
          v-for="(district, index) in results"
          :id="`${inputId}-option-${index}`"
          :key="district.slug"
          class="compare-search-option"
          :class="{ 'compare-search-option--active': index === activeIndex }"
          type="button"
          role="option"
          :aria-selected="district.slug === modelValue"
          @mouseenter="activeIndex = index"
          @mousedown.prevent
          @click="selectDistrict(district)"
        >
          <strong>{{ formatDistrictSearchName(district) }}</strong>
          <small>{{ district.county }} · {{ district.region }}</small>
        </button>
        <p v-if="!results.length" class="compare-search-empty" aria-live="polite">
          No matching districts
        </p>
      </div>
    </div>
  </div>
</template>
