<script setup lang="ts">
import type { DistrictCalendar, DistrictIdentity } from '~~/shared/types/content'
import { calendarPdfDownloadUrl } from '~~/shared/utils/calendarPdf'
import {
  appleCalendarSubscriptionUrl,
  calendarRouteSlug,
  googleCalendarSubscriptionUrl,
} from '~~/shared/utils/content'

const props = defineProps<{
  district: DistrictIdentity
  calendar: DistrictCalendar
}>()

const runtimeConfig = useRuntimeConfig()

interface CalendarActionItem {
  key: 'pdf' | 'calendar' | 'google' | 'apple' | 'ics'
  label: string
  mobileLabel?: string
  href: string
  icon: 'pdf' | 'calendar' | 'google' | 'apple' | 'ics'
  primary: boolean
  target?: '_blank'
  rel?: string
  download?: string
}

const actionItems = computed<CalendarActionItem[]>(() => {
  const items: CalendarActionItem[] = []
  const actions = props.calendar.actions
  const siteUrl = String(runtimeConfig.public.siteUrl)
  const googleCalendarUrl = actions.googleCalendarUrl
    || (actions.staticIcsUrl
      ? googleCalendarSubscriptionUrl(siteUrl, actions.staticIcsUrl)
      : null)
  const appleCalendarUrl = actions.appleCalendarUrl
    || (actions.staticIcsUrl
      ? appleCalendarSubscriptionUrl(siteUrl, actions.staticIcsUrl)
      : null)

  items.push({
    key: 'pdf',
    label: 'Download PDF',
    mobileLabel: 'PDF',
    href: calendarPdfDownloadUrl(props.district, props.calendar),
    icon: 'pdf',
    primary: true,
    target: '_blank',
    rel: 'noopener noreferrer',
  })
  if (googleCalendarUrl) {
    items.push({
      key: 'google',
      label: 'Add to Google',
      href: googleCalendarUrl,
      icon: 'google',
      primary: false,
      target: '_blank',
      rel: 'noopener noreferrer',
    })
  }
  if (appleCalendarUrl) {
    items.push({
      key: 'apple',
      label: 'Add to Apple',
      href: appleCalendarUrl,
      icon: 'apple',
      primary: false,
    })
  }
  if (actions.staticIcsUrl) {
    items.push({
      key: 'ics',
      label: 'Download ICS',
      href: actions.staticIcsUrl,
      icon: 'ics',
      primary: false,
      download: props.district.slug + '-' + calendarRouteSlug(props.calendar) + '.ics',
    })
  }

  return items
})

const primaryAction = computed(() => actionItems.value.find(action => action.primary))
const secondaryActions = computed(() => actionItems.value.filter(action => !action.primary))
</script>

<template>
  <div
    class="calendar-actions calendar-actions--desktop"
    role="group"
    aria-label="Calendar actions"
  >
    <a
      v-for="action in actionItems"
      :key="action.key"
      :class="['button', action.primary ? 'button--primary' : 'button--secondary']"
      :href="action.href"
      :target="action.target"
      :rel="action.rel"
      :download="action.download"
    >
      <CalendarActionIcon :name="action.icon" />
      {{ action.label }}
    </a>
  </div>

  <div
    class="calendar-actions calendar-actions--mobile"
    role="group"
    aria-label="Calendar actions"
  >
    <a
      v-if="primaryAction"
      class="button button--primary"
      :href="primaryAction.href"
      :target="primaryAction.target"
      :rel="primaryAction.rel"
      :aria-label="primaryAction.label"
      :download="primaryAction.download"
    >
      <CalendarActionIcon :name="primaryAction.icon" />
      {{ primaryAction.mobileLabel || primaryAction.label }}
    </a>

    <details v-if="secondaryActions.length" class="calendar-action-menu">
      <summary
        class="button button--secondary calendar-action-menu-trigger"
        aria-label="Show calendar sync options"
      >
        Sync
        <svg
          class="calendar-action-menu-chevron"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
          focusable="false"
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </summary>

      <div class="calendar-action-menu-panel" role="group" aria-label="Calendar sync options">
        <a
          v-for="action in secondaryActions"
          :key="action.key"
          class="calendar-action-menu-item"
          :href="action.href"
          :target="action.target"
          :rel="action.rel"
          :download="action.download"
        >
          <CalendarActionIcon :name="action.icon" />
          {{ action.label }}
        </a>
      </div>
    </details>
  </div>
</template>
