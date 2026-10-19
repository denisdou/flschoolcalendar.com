import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    include: ['test/unit/**/*.test.ts', 'shared/utils/**/*.test.ts', 'app/components/**/*.test.ts'],
    hookTimeout: 30_000,
  },
})
