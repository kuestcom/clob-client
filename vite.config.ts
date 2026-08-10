import { defineConfig } from 'vite-plus'

export default defineConfig({
  fmt: {
    printWidth: 120,
    tabWidth: 2,
    semi: false,
    singleQuote: true,
    trailingComma: 'all',
    sortImports: {
      groups: [
        'type-import',
        ['value-builtin', 'value-external'],
        'type-internal',
        'value-internal',
        ['type-parent', 'type-sibling', 'type-index'],
        ['value-parent', 'value-sibling', 'value-index'],
        'unknown',
      ],
    },
    sortTailwindcss: {
      stylesheet: './src/styles/globals.css',
      functions: ['clsx', 'cn', 'cva', 'twMerge'],
    },
    sortPackageJson: true,
    ignorePatterns: ['pnpm-lock.yaml'],
  },
  lint: {
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    overrides: [
      {
        files: ['tests/**/*.ts'],
        rules: { 'no-unused-expressions': 'off' },
      },
    ],
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: true },
  },
  staged: {
    '*.{js,jsx,ts,tsx,json,jsonc,css,md,yml,yaml}': 'vp check --fix',
  },
})
