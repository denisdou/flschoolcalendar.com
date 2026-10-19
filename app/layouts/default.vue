<template>
  <div class="site-shell">
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <SiteHeader />
    <main id="main-content" class="site-main">
      <slot />
    </main>
    <SiteFooter />
  </div>
</template>
