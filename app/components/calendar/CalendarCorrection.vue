<script setup lang="ts">
import type { DistrictCalendar, DistrictIdentity } from '~~/shared/types/content'
import { absoluteUrl, calendarRouteSlug } from '~~/shared/utils/content'
import { calendarCorrectionHref, correctionEmail } from '~~/shared/utils/calendarCorrection'

const props = defineProps<{ district: DistrictIdentity; calendar: DistrictCalendar }>()
const config = useRuntimeConfig()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const message = ref('')
const email = ref('')
const draftOpened = ref(false)
const context = computed(() => ({
  page: absoluteUrl(String(config.public.siteUrl), `/${props.district.slug}/${calendarRouteSlug(props.calendar)}/`),
  district: props.district.name,
  schoolYear: props.calendar.schoolYear,
}))
const attachmentHref = computed(() => calendarCorrectionHref(context.value))
const draftHref = computed(() => calendarCorrectionHref({ ...context.value, message: message.value, email: email.value }))
function open() { dialog.value?.showModal() }
function close() { dialog.value?.close() }
function submit() {
  window.location.href = draftHref.value
  draftOpened.value = true
}
function closeOnBackdrop(event: MouseEvent) {
  const element = dialog.value
  if (!element || event.target !== element) return
  const rect = element.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close()
}
</script>

<template>
  <div class="calendar-correction-strip">
    <p>Spot an error? Help us keep this calendar accurate.</p>
    <button type="button" class="text-link" @click="open">Report a correction →</button>
  </div>
  <dialog ref="dialog" class="calendar-correction-dialog" aria-labelledby="correction-heading" @click="closeOnBackdrop">
    <div class="correction-dialog-heading">
      <div><p class="eyebrow">Calendar feedback</p><h2 id="correction-heading">Report a Correction</h2></div>
      <button type="button" class="correction-close" aria-label="Close correction form" @click="close">×</button>
    </div>
    <form @submit.prevent="submit">
      <label for="correction-message">What needs correcting?</label>
      <p id="correction-context" class="correction-help">We’ll include this page, district and school year automatically.</p>
      <textarea id="correction-message" v-model="message" aria-describedby="correction-context" required maxlength="5000" rows="5" autofocus />
      <label for="correction-email">Email <span class="correction-help">(optional)</span></label>
      <input id="correction-email" v-model="email" type="email" autocomplete="email" maxlength="254">
      <p class="correction-help">Have a file to share? <a class="text-link" :href="attachmentHref">Email {{ correctionEmail }}</a>.</p>
      <p class="correction-help">This opens a draft in your email app. Send the email there to report the correction.</p>
      <p v-if="draftOpened" role="status">Your email draft has been requested. If it did not open, <a class="text-link" :href="draftHref">open the draft again</a> or email {{ correctionEmail }}.</p>
      <div class="correction-dialog-actions">
        <button type="button" class="button button--secondary" @click="close">Cancel</button>
        <button type="submit" class="button button--primary">Continue in email</button>
      </div>
    </form>
  </dialog>
</template>
