<script setup lang="ts">
import type { DistrictCalendar, DistrictIdentity } from '~~/shared/types/content'
import { absoluteUrl, calendarRouteSlug } from '~~/shared/utils/content'
import { calendarCorrectionHref, correctionEmail } from '~~/shared/utils/calendarCorrection'

const props = defineProps<{ district: DistrictIdentity; calendar: DistrictCalendar }>()
const config = useRuntimeConfig()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const message = ref('')
const email = ref('')
const active = ref(false)
const token = ref('')
const sending = ref(false)
const sent = ref(false)
const errorMessage = ref('')
const challenge = useTemplateRef<{ reset: () => void }>('challenge')
const siteKey = computed(() => String(config.public.turnstileSiteKey || ''))
let submissionId = ''
const context = computed(() => ({
  page: absoluteUrl(String(config.public.siteUrl), `/${props.district.slug}/${calendarRouteSlug(props.calendar)}/`),
  district: props.district.name,
  schoolYear: props.calendar.schoolYear,
}))
const attachmentHref = computed(() => calendarCorrectionHref(context.value))
watch([message, email], () => { submissionId = '' })
function open() {
  sent.value = false
  errorMessage.value = ''
  dialog.value?.showModal()
  active.value = true
}
function close() {
  dialog.value?.close()
  active.value = false
}
async function submit() {
  if (sending.value || sent.value) return
  errorMessage.value = ''
  if (!siteKey.value || !token.value) {
    errorMessage.value = 'Please complete verification before sending.'
    return
  }
  if (message.value.trim().length < 10) {
    errorMessage.value = 'Please describe the correction in at least 10 characters.'
    return
  }
  submissionId ||= crypto.randomUUID()
  sending.value = true
  try {
    const response = await $fetch<{ ok: boolean }>('/api/corrections', {
      method: 'POST', retry: 0, timeout: 30_000,
      body: { ...context.value, message: message.value.trim(), email: email.value.trim(), turnstileToken: token.value, submissionId },
    })
    if (!response.ok) throw new Error('Correction was not accepted.')
    sent.value = true
    active.value = false
    message.value = ''
    email.value = ''
    submissionId = ''
  }
  catch (error) {
    const details = error as { data?: { message?: string } }
    errorMessage.value = details.data?.message || 'Your correction could not be sent. Please retry or use the email link.'
    challenge.value?.reset()
  }
  finally { sending.value = false }
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
  <dialog ref="dialog" class="calendar-correction-dialog" aria-labelledby="correction-heading" @click="closeOnBackdrop" @close="active = false">
    <div class="correction-dialog-heading">
      <div><p class="eyebrow">Calendar feedback</p><h2 id="correction-heading">Report a Correction</h2></div>
      <button type="button" class="correction-close" aria-label="Close correction form" @click="close">×</button>
    </div>
    <div v-if="sent" class="correction-success" role="status">
      <p>Thank you. Your correction has been sent for review.</p>
      <div class="correction-dialog-actions"><button type="button" class="button button--primary" @click="close">Done</button></div>
    </div>
    <form v-else :aria-busy="sending" @submit.prevent="submit">
      <label for="correction-message">What needs correcting?</label>
      <p id="correction-context" class="correction-help">We’ll include this page, district and school year automatically.</p>
      <textarea id="correction-message" v-model="message" :disabled="sending" aria-describedby="correction-context" required minlength="10" maxlength="5000" rows="5" autofocus />
      <label for="correction-email">Email <span class="correction-help">(optional)</span></label>
      <input id="correction-email" v-model="email" :disabled="sending" type="email" autocomplete="email" maxlength="254">
      <p class="correction-help">Have a file to share? <a class="text-link" :href="attachmentHref">Email {{ correctionEmail }}</a>.</p>
      <TurnstileChallenge ref="challenge" :site-key="siteKey" :active="active" @update:token="token = $event" />
      <p v-if="!siteKey" class="correction-help">Online submission is temporarily unavailable. Please use the email link above.</p>
      <p v-if="errorMessage" class="correction-error" role="alert">{{ errorMessage }}</p>
      <div class="correction-dialog-actions">
        <button type="button" class="button button--secondary" @click="close">Cancel</button>
        <button type="submit" class="button button--primary" :disabled="sending || !siteKey || !token">{{ sending ? 'Sending…' : 'Send correction' }}</button>
      </div>
    </form>
  </dialog>
</template>
