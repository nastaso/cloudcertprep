import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.astro', '.kiro']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      ...Object.fromEntries(
        Object.keys(jsxA11y.flatConfigs.recommended.rules ?? {}).map(r => [r, 'warn']),
      ),
      // jsx-a11y/label-has-for is deprecated upstream (jsx-a11y v6.7+);
      // the modern replacement is `label-has-associated-control`, which the
      // recommended preset already enables. Keeping `label-has-for` on adds
      // 8+ noisy warnings without any genuine a11y signal because we already
      // satisfy `label-has-associated-control` via `htmlFor`/`id` pairs.
      'jsx-a11y/label-has-for': 'off',
    },
  },
])
