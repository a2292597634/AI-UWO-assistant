import js from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'archive/**',
      'coverage/**',
      'miniprogram/generated/**',
      'miniprogram/subpkg-detail/details-*.js',
      'miniprogram/subpkg-detail/detail-index.js',
      'miniprogram/subpkg-detail/detail-loaders.js',
      'node_modules/**',
      // Compiled JS from tools/ and tests/ (IDE TS plugin output)
      'tools/**/*.js',
      'tests/**/*.js',
      'vitest.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['miniprogram/**/*.js'],
    languageOptions: {
      globals: {
        App: 'readonly',
        Page: 'readonly',
        Component: 'readonly',
        wx: 'readonly',
        getApp: 'readonly',
        getCurrentPages: 'readonly',
        module: 'readonly',
        require: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { varsIgnorePattern: '^_' }],
    },
  },
  eslintConfigPrettier,
)
