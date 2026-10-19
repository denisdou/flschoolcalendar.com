<script setup lang="ts">
const route = useRoute()
const currentSchoolYear = useCurrentSchoolYear()
const { data: catalog } = await useDistrictCatalog()
const districts = computed(() => catalog.value?.districts || [])
const mobileNavigation = ref<HTMLDetailsElement | null>(null)
const mobileMenuOpen = ref(false)
const isScrolled = ref(false)

function syncScrollState() {
  isScrolled.value = window.scrollY > 0
}

onMounted(() => {
  syncScrollState()
  window.addEventListener('scroll', syncScrollState, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', syncScrollState)
})

const navigation = [
  { label: 'Home', href: '/' },
  { label: 'Districts', href: '/#districts' },
  { label: 'Compare', href: '/compare/' },
]

function isActive(href: string) {
  if (href === '/') return route.path === '/' && route.hash !== '#districts'
  if (href === '/#districts') {
    return (route.path === '/' && route.hash === '#districts')
      || String(route.name || '').startsWith('district')
  }
  return route.path.startsWith(href)
}

function closeMobileNavigation() {
  if (mobileNavigation.value) mobileNavigation.value.open = false
  mobileMenuOpen.value = false
}

function syncMobileNavigationState(event: Event) {
  mobileMenuOpen.value = (event.currentTarget as HTMLDetailsElement).open
}

watch(() => route.fullPath, closeMobileNavigation)
</script>

<template>
  <header class="site-header" :class="{ 'site-header--scrolled': isScrolled }">
    <div class="site-container header-row">
      <NuxtLink class="brand" to="/" aria-label="FL School Calendar home">
        <img
          class="brand-mark"
          src="/flschoolcalendar-logo.webp"
          alt=""
          width="160"
          height="160"
          aria-hidden="true"
        >
        <span>FL School Calendar</span>
      </NuxtLink>

      <div class="desktop-header-actions">
        <nav class="desktop-nav" aria-label="Primary navigation">
          <NuxtLink
            v-for="item in navigation"
            :key="item.href"
            class="nav-link"
            :class="{ 'is-active': isActive(item.href) }"
            :to="item.href"
          >
            {{ item.label }}
          </NuxtLink>
        </nav>
        <HeaderDistrictSearch :districts="districts" :school-year="currentSchoolYear" search-id="desktop-district-search" />
      </div>

      <details
        ref="mobileNavigation"
        class="mobile-nav"
        @toggle="syncMobileNavigationState"
      >
        <summary
          :aria-label="mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'"
          title="Menu"
        >
          <svg
            class="mobile-menu-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path v-if="!mobileMenuOpen" d="M4 7h16M4 12h16M4 17h16" />
            <path v-else d="m6 6 12 12M18 6 6 18" />
          </svg>
        </summary>
        <nav class="mobile-nav-panel" aria-label="Mobile navigation">
          <NuxtLink
            v-for="item in navigation"
            :key="item.href"
            class="nav-link"
            :class="{ 'is-active': isActive(item.href) }"
            :to="item.href"
            @click="closeMobileNavigation"
          >
            {{ item.label }}
          </NuxtLink>
          <HeaderDistrictSearch :districts="districts" :school-year="currentSchoolYear" search-id="mobile-district-search" />
        </nav>
      </details>
    </div>
  </header>
</template>
