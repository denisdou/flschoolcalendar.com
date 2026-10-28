<script setup lang="ts">
import { loadTurnstile, type TurnstileApi } from '~/utils/turnstile'

const props = defineProps<{ siteKey: string; active: boolean }>()
const emit = defineEmits<{ 'update:token': [token: string] }>()
const container = useTemplateRef<HTMLDivElement>('container')
const status = ref('')
const failed = ref(false)
let api: TurnstileApi | undefined
let widgetId: string | undefined
let generation = 0

function remove() {
  generation++
  if (widgetId !== undefined) api?.remove(widgetId)
  widgetId = undefined
  emit('update:token', '')
}

async function render() {
  remove()
  if (!props.active || !props.siteKey || !container.value) return
  const current = generation
  failed.value = false
  status.value = 'Loading verification…'
  try {
    api = await loadTurnstile()
    if (current !== generation || !props.active || !container.value) return
    widgetId = api.render(container.value, {
      sitekey: props.siteKey, action: 'calendar_correction', theme: 'auto', size: 'flexible',
      callback: (token) => {
        if (current !== generation) return
        emit('update:token', token)
        status.value = ''
        failed.value = false
      },
      'expired-callback': () => {
        if (current !== generation) return
        emit('update:token', '')
        status.value = 'Verification expired. Please verify again.'
      },
      'error-callback': () => {
        if (current !== generation) return
        emit('update:token', '')
        status.value = 'Verification could not complete. Please retry.'
        failed.value = true
      },
    })
    if (!failed.value) status.value = ''
  }
  catch {
    if (current !== generation) return
    status.value = 'Verification could not load. Please retry or use the email link.'
    failed.value = true
  }
}

function reset() {
  emit('update:token', '')
  status.value = ''
  failed.value = false
  if (widgetId !== undefined) api?.reset(widgetId)
  else void render()
}

watch([() => props.active, () => props.siteKey, container], () => { void render() }, { flush: 'post' })
onBeforeUnmount(remove)
defineExpose({ reset })
</script>

<template>
  <div v-if="siteKey" class="correction-verification">
    <div ref="container" />
    <p v-if="status" class="correction-help" role="status">{{ status }}</p>
    <button v-if="failed" type="button" class="text-link" @click="render">Retry verification</button>
  </div>
</template>
