import { defineConfig } from 'vitest/config'

/**
 * QAR-4: a test's own time limit, when it sets none. 5 s on a person's computer, as Vitest's
 * default. On CI more, and on Windows most: the end-to-end tests start the built command as a
 * new process many times, and a Windows runner starts one about three times slower.
 */
const windows = process.platform === 'win32'
const limit = windows ? 60_000 : process.env['CI'] ? 30_000 : 5_000

export default defineConfig({
  plugins: [
    {
      // CMD-40: a page of docs/ imported as its text, as the build's `.md` loader does.
      name: 'markdown-as-text',
      enforce: 'pre',
      transform: (code, id) => (id.endsWith('.md') ? { code: `export default ${JSON.stringify(code)}`, map: null } : null),
    },
  ],
  test: {
    environment: 'node',
    globals: true,
    testTimeout: limit,
    hookTimeout: Math.max(limit, 10_000),
  },
})
