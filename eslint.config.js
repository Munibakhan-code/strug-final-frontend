import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

// Rules that catch real defects run at ERROR with zero tolerance — `no-undef` in particular,
// which is what would have caught the `CardElement` / `DIGPROD_CATS` ReferenceErrors that
// shipped to production. Hygiene rules run at WARN and are reported in CI but do not fail
// the build; only ERROR-severity findings fail `npm run lint`.
export default defineConfig([
  globalIgnores(['dist', 'coverage', 'playwright-report', 'test-results', 'node_modules']),

  // Browser application source.
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
    linterOptions: {
      reportUnusedDisableDirectives: 'warn',
    },
    rules: {
      // --- Defect-class rules: these stay at error, count must stay at zero. ---
      'no-undef': 'error',
      'no-constant-binary-expression': 'error',
      'no-control-regex': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-self-compare': 'error',
      'no-unsafe-optional-chaining': 'error',
      // An empty catch swallows the failure silently. Allow it only when the intent is stated
      // with a comment, which is the convention already used across this codebase.
      'no-empty': ['warn', { allowEmptyCatch: false }],

      // --- Hygiene: warn now, capped in CI, tightened over time. ---
      'no-unused-vars': ['warn', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'react-refresh/only-export-components': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/static-components': 'warn',

      // `rules-of-hooks` is unambiguous — a violation is always a bug.
      'react-hooks/rules-of-hooks': 'error',

      // The compiler-era rules below find real problems but also flag deliberate, safe patterns
      // this codebase uses on purpose: a documented `getBoundingClientRect()` read during render
      // in Videos.jsx, assigning `.src` on a DOM node held in state, and `children(onClose)`
      // render props. Held at warn (and capped) so they inform review without forcing rewrites
      // of correct code.
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
    },
  },

  // Node-side code: build scripts, guard scripts, serverless handlers, config files.
  // These were reporting `process`/`Buffer` as undefined purely because they inherited the
  // browser globals above, which buried the two real no-undef defects in the noise.
  {
    files: [
      'scripts/**/*.{js,mjs,cjs}',
      'api/**/*.{js,mjs,cjs}',
      '*.config.{js,mjs,cjs}',
      'playwright.config.cjs',
    ],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'module',
    },
    rules: {
      // Node scripts legitimately export helpers alongside anything else.
      'react-refresh/only-export-components': 'off',
    },
  },

  // Vitest / Playwright specs: test globals plus Node built-ins used by source-contract tests.
  {
    files: ['**/*.test.{js,jsx}', 'src/test/**/*.{js,jsx}', 'test/**/*.{js,jsx,cjs}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, ...globals.vitest },
    },
    rules: {
      'react-refresh/only-export-components': 'off',
      'no-empty': 'off',
    },
  },
])
