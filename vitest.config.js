// vitest.config.js
//
// Configuration for the test runner (npm test). Kept separate from
// vite.config.js so tests don't drag in the PWA plugin or React tooling —
// the current tests target pure logic functions and run in plain Node.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Dummy env values so importing app modules (which create the Supabase
    // client at import time) never crashes in tests or CI. Tests never talk
    // to the real backend.
    env: {
      VITE_SUPABASE_URL: 'https://test-project.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      VITE_MAPBOX_TOKEN: 'test-mapbox-token',
    },
  },
});
