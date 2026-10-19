<script setup lang="ts">
defineProps<{
  breadcrumbs: Array<{ label: string; href?: string }>
  eyebrow: string
  title: string
  lead: string
  className?: string
}>()
</script>

<template>
  <section class="page-intro-section" :class="className">
    <div class="site-container">
      <AppBreadcrumbs :items="breadcrumbs" />
      <PageHero :eyebrow="eyebrow" :title="title" :lead="lead">
        <slot />
      </PageHero>
    </div>
  </section>
</template>
