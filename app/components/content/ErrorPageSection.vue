<script setup lang="ts">
defineProps<{
  statusCode: number
  message: string
}>()

function returnHome() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <section class="page-intro-section">
    <div class="site-container">
      <PageHero eyebrow="Page unavailable" :title="String(statusCode)" :lead="message">
        <div class="button-row">
          <button class="button button--primary" type="button" @click="returnHome">
            Return home
          </button>
          <NuxtLink class="button button--secondary" to="/#districts">
            Browse districts
          </NuxtLink>
        </div>
      </PageHero>
    </div>
  </section>
</template>
