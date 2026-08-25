import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    // Confirmed-dead/generated/non-source paths (health-audit findings 3.1, 7.7) --
    // no value linting code that's either never shipped or not hand-written.
    // node_modules and dist are ignored by ESLint's own defaults already, listed
    // here only for clarity.
    ignores: [
      'dist',
      'node_modules',
      'pages/**', // orphaned root-level duplicate HomePage.tsx (finding 3.1), not part of the real app
      'Reference Data/**',
      '.claude/**',
      'card-source-audit.json',
    ],
  },

  // App source: browser + React + TypeScript.
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // tsc (noUnusedLocals/noUnusedParameters, tsconfig.app.json) already
      // enforces this at build time app-wide; avoid duplicate, differently-worded
      // errors for the same thing from two tools.
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  // Node-side import/audit scripts: real Node globals, not browser; plain JS, not
  // type-checked (these aren't part of the tsconfig.app.json project).
  {
    extends: [js.configs.recommended],
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
    },
  },

  // Config files themselves run under Node during build/dev, not the browser.
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['*.config.{js,ts}', 'vite.config.ts'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
    },
  },
)
