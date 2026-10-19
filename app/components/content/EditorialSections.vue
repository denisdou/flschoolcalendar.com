<script setup lang="ts">
export interface EditorialSection {
  title: string
  paragraphs: string[]
  items?: string[]
}

defineProps<{
  sections: EditorialSection[]
}>()
</script>

<template>
  <div class="prose">
    <article v-for="section in sections" :key="section.title">
      <h2>{{ section.title }}</h2>
      <p v-for="paragraph in section.paragraphs" :key="paragraph">{{ paragraph }}</p>
      <ul v-if="section.items?.length">
        <li v-for="item in section.items" :key="item">{{ item }}</li>
      </ul>
    </article>
  </div>
</template>
