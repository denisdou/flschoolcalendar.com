<script setup lang="ts">
export interface InfoCardItem {
  title: string
  description: string
  meta?: string
  href?: string
}

defineProps<{
  items: InfoCardItem[]
}>()
</script>

<template>
  <div class="link-grid">
    <template
      v-for="item in items"
      :key="item.title"
    >
      <NuxtLink v-if="item.href" class="link-card" :to="item.href">
        <div>
          <h3>{{ item.title }}</h3>
          <p>{{ item.description }}</p>
        </div>
        <span v-if="item.meta" class="directory-meta">{{ item.meta }}</span>
        <span v-else class="text-link">Explore →</span>
      </NuxtLink>
      <article v-else class="link-card">
        <div>
          <h3>{{ item.title }}</h3>
          <p>{{ item.description }}</p>
        </div>
        <span v-if="item.meta" class="directory-meta">{{ item.meta }}</span>
      </article>
    </template>
  </div>
</template>
