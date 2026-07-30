import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // ---------------------------------------------------------------------
      // Accepted pre-existing debt (ENG-003 -> tracked as ENG-009).
      //
      // These two rules currently produce 5 errors across code that predates
      // any linting in CI:
      //   react-hooks/set-state-in-effect      Counter.tsx:34, Navbar.tsx:33,
      //                                        PromptDrawer.tsx:47, Library.tsx:89
      //   react-refresh/only-export-components ExplorerControls.tsx:20
      //
      // Downgraded to 'warn' rather than fixed, deliberately: fixing them means
      // changing effect/state logic in five app files in a repo that had ZERO
      // tests until this ticket. That is a refactor with real regression risk
      // and it belongs in its own ticket with tests behind it -- not in the
      // ticket whose entire purpose is to create the safety net.
      //
      // Downgrading is preferred over per-line eslint-disable comments because
      // it keeps the debt in one visible place instead of scattering it, and
      // over dropping the rules entirely because warnings still surface.
      //
      // ENG-009 fixes these and restores both to 'error'. Do not add new code
      // that trips them -- the warnings are visible in local runs and CI logs.
      // ---------------------------------------------------------------------
      'react-hooks/set-state-in-effect': 'warn',
      'react-refresh/only-export-components': 'warn',
    },
  },
])
