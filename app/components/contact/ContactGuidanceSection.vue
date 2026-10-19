<script setup lang="ts">
defineProps<{ email: string }>()
</script>

<template>
  <section class="page-section page-section--tight">
    <div class="site-container prose">
      <article>
        <h2>What to include</h2>
        <p>
          All messages go to <a :href="`mailto:${email}`">{{ email }}</a>. For a correction, include the district, school year, calendar variant, affected date, page URL, and an official source showing the change. Please do not send screenshots when the original district page or document is available.
        </p>
      </article>

      <article>
        <h2>Questions for your district or school</h2>
        <p>FL School Calendar cannot answer questions about enrollment, attendance records, transportation, meals, employment, individual students, exact bell times, or same-day closures. Contact the district or school directly. For an emergency, use the appropriate local emergency service.</p>
      </article>

      <article>
        <h2>How messages are handled</h2>
        <p>We review messages in good faith, but cannot promise a response time or publication of every submission. Calendar changes are made only after the supporting source can be checked. We may preserve the source and substance of a correction in a revision record, but do not publish the sender’s email address.</p>
      </article>
    </div>
  </section>
</template>
