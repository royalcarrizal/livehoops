import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.claude']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      'react-hooks/set-state-in-effect': 'off',
      // Catches the temporal-dead-zone bug that took the whole Profile screen
      // down: a `const` read earlier in the function body than its own
      // declaration. `const` is hoisted but not initialised, so it throws at
      // runtime rather than being undefined — and eslint:recommended does not
      // include this rule, so nothing flagged it.
      //
      // functions: false because function declarations really are hoisted and
      // safe to call before their definition; flagging those is just noise.
      'no-use-before-define': ['error', {
        functions: false,
        variables: true,
        classes: true,
        allowNamedExports: true,
      }],
    },
  },
  {
    files: ['public/firebase-messaging-sw.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        importScripts: 'readonly',
        firebase: 'readonly',
        clients: 'readonly',
      },
    },
  },
])
