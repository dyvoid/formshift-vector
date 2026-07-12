import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    // The scaffold ships no logic yet; drop this the moment the first test lands.
    passWithNoTests: true
  }
})
