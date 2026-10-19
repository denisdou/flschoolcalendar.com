import { defineVitestConfig } from '@nuxt/test-utils/config'

// Historical Texas content audits are separate from Florida publication checks.
export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    include: ['test/legacy/**/*.test.ts'],
    hookTimeout: 30_000,
  },
})
