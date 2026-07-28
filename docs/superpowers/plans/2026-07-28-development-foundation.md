# Development Foundation and TypeScript Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the corrupted JavaScript starter template with a clean native WeChat Mini Program TypeScript baseline whose local quality gates are executable and passing.

**Architecture:** Put all mini-program runtime source under `miniprogram/` and keep Node tooling, tests, data, archives, and documents at repository root. Use WeChat DevTools' TypeScript compiler plugin for runtime compilation and TypeScript/Vitest for pure local checks.

**Tech Stack:** Native WeChat Mini Program, TypeScript, Node.js, Vitest, ESLint flat config, Prettier, `miniprogram-api-typings`, local Git

## Global Constraints

- Keep the confirmed App ID in `project.config.json`.
- Set `miniprogramRoot` to `miniprogram/`.
- Enable the WeChat TypeScript compiler through `setting.useCompilerPlugins`.
- Do not retain login, profile, cloud, remote-avatar, or network-request code from the generated template.
- V1 runtime code and formal copy use Traditional Chinese.
- Do not create feature cards for unfinished modules.
- Tests for independently verifiable behavior are written before implementation.
- Keep the worktree clean after each task commit.

---

## File Map

- `package.json`: local scripts and development dependencies.
- `package-lock.json`: reproducible npm dependency resolution.
- `tsconfig.json`: strict TypeScript settings shared by runtime source, tools, and tests.
- `eslint.config.mjs`: TypeScript-aware lint rules and generated/archive exclusions.
- `.prettierrc.json`: repository formatting rules.
- `.prettierignore`: immutable/archive/generated exclusions.
- `vitest.config.ts`: deterministic Node test configuration.
- `tests/config/project-config.test.ts`: executable architecture contract.
- `tests/config/app-shell.test.ts`: shell route and local-only contract.
- `tests/unit/local-only.test.ts`: network-reference scanner behavior.
- `tools/quality/find-runtime-network-references.ts`: pure scanner used by tests and CLI.
- `tools/quality/check-runtime-network.ts`: CLI wrapper for the scanner.
- `miniprogram/app.ts`: side-effect-free application entry.
- `miniprogram/app.json`: V1 route and window configuration.
- `miniprogram/app.wxss`: global tokens and reset.
- `miniprogram/sitemap.json`: sitemap configuration.
- `miniprogram/pages/home/*`: minimal compilable home shell.
- `miniprogram/typings/index.d.ts`: application and asset-module typings.
- `README.md`: local setup, quality commands, and DevTools verification.
- `project.config.json`: source-root and compiler-plugin configuration.

### Task 1: Bootstrap the local TypeScript quality toolchain

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `vitest.config.ts`
- Create: `tests/config/tooling-config.test.ts`
- Create: `tsconfig.json`
- Create: `eslint.config.mjs`
- Create: `.prettierrc.json`
- Create: `.prettierignore`

**Interfaces:**
- Consumes: Node.js and npm installed locally.
- Produces: `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`, and `npm run verify`.

- [ ] **Step 1: Create the npm manifest and install the exact tool categories**

Create `package.json`:

```json
{
  "name": "uwo-assistant",
  "version": "0.1.0",
  "private": true,
  "description": "Uncharted Waters Origin 航海士資料查詢微信小程序",
  "scripts": {
    "lint": "eslint . --max-warnings 0",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "check:runtime-network": "tsx tools/quality/check-runtime-network.ts",
    "verify": "npm run format:check && npm run lint && npm run typecheck && npm test && npm run check:runtime-network"
  }
}
```

Run:

```powershell
npm.cmd install --save-dev typescript vitest eslint @eslint/js typescript-eslint eslint-config-prettier prettier miniprogram-api-typings @types/node tsx
```

Expected: `package-lock.json` is created and npm exits with code 0.

- [ ] **Step 2: Write the failing tooling contract**

Create `tests/config/tooling-config.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>

describe('local toolchain', () => {
  it('uses strict TypeScript without emitting build files', () => {
    const config = readJson('tsconfig.json')
    expect(config.compilerOptions).toMatchObject({
      strict: true,
      noEmit: true,
      moduleResolution: 'Bundler',
    })
  })

  it('exposes the complete local verification command', () => {
    const pkg = readJson('package.json')
    expect(pkg.scripts).toMatchObject({
      lint: 'eslint . --max-warnings 0',
      'format:check': 'prettier --check .',
      typecheck: 'tsc --noEmit',
      test: 'vitest run',
    })
  })
})
```

- [ ] **Step 3: Run the contract to verify it fails**

Run:

```powershell
npm.cmd test -- tests/config/tooling-config.test.ts
```

Expected: FAIL because `tsconfig.json` does not exist.

- [ ] **Step 4: Add the minimal tool configuration**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "allowJs": false,
    "types": ["miniprogram-api-typings", "node", "vitest/globals"],
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["miniprogram/**/*.ts", "tools/**/*.ts", "tests/**/*.ts", "vitest.config.ts"],
  "exclude": ["node_modules", "archive", "miniprogram/generated"]
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
})
```

Create `eslint.config.mjs`:

```js
import js from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['archive/**', 'coverage/**', 'miniprogram/generated/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      'no-undef': 'off',
    },
  },
  eslintConfigPrettier,
)
```

Create `.prettierrc.json`:

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

Create `.prettierignore`:

```text
archive/
coverage/
docs/superpowers/
miniprogram/generated/
node_modules/
package-lock.json
游戏内被动技能查询截图.png
游戏内菜单图.png
```

- [ ] **Step 5: Run the focused and complete tooling checks**

Run:

```powershell
npm.cmd test -- tests/config/tooling-config.test.ts
npm.cmd run typecheck
```

Expected: both commands exit with code 0. Full-repository lint and formatting are first required after Task 2 removes the generated JavaScript template.

- [ ] **Step 6: Commit the toolchain**

```powershell
git add package.json package-lock.json tsconfig.json vitest.config.ts eslint.config.mjs .prettierrc.json .prettierignore tests/config/tooling-config.test.ts
git commit -m "chore: add TypeScript quality toolchain"
```

### Task 2: Move the mini-program into its dedicated TypeScript source root

**Files:**
- Modify: `project.config.json`
- Create: `tests/config/project-config.test.ts`
- Create: `miniprogram/app.ts`
- Create: `miniprogram/app.json`
- Create: `miniprogram/app.wxss`
- Create: `miniprogram/sitemap.json`
- Create: `miniprogram/typings/index.d.ts`
- Delete: `app.js`
- Delete: `app.json`
- Delete: `app.wxss`
- Delete: `sitemap.json`
- Delete: `pages/index/*`
- Delete: `pages/logs/*`
- Delete: `utils/util.js`

**Interfaces:**
- Consumes: Task 1 Vitest and TypeScript configuration.
- Produces: `project.config.json` with `miniprogramRoot: "miniprogram/"` and TypeScript compilation enabled.

- [ ] **Step 1: Write the failing project-configuration contract**

Create `tests/config/project-config.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const project = JSON.parse(readFileSync('project.config.json', 'utf8')) as {
  appid: string
  miniprogramRoot?: string
  setting: { useCompilerPlugins?: string[] }
}

describe('WeChat project structure', () => {
  it('keeps the existing App ID and points DevTools at the TypeScript source root', () => {
    expect(project.appid).toBe('wx8f961bcd8b26996a')
    expect(project.miniprogramRoot).toBe('miniprogram/')
    expect(project.setting.useCompilerPlugins).toContain('typescript')
  })

  it('has one application entry and no root JavaScript template', () => {
    expect(existsSync('miniprogram/app.ts')).toBe(true)
    expect(existsSync('miniprogram/app.json')).toBe(true)
    expect(existsSync('app.js')).toBe(false)
    expect(existsSync('pages/logs/logs.js')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm.cmd test -- tests/config/project-config.test.ts
```

Expected: FAIL because `miniprogramRoot` and the TypeScript compiler plugin are absent.

- [ ] **Step 3: Configure the WeChat source root**

Modify `project.config.json` without changing `appid`:

```json
{
  "miniprogramRoot": "miniprogram/",
  "compileType": "miniprogram",
  "libVersion": "trial",
  "setting": {
    "es6": true,
    "postcss": true,
    "minified": true,
    "enhance": true,
    "useCompilerPlugins": ["typescript"],
    "minifyWXSS": true,
    "minifyWXML": true,
    "uploadWithSourceMap": true
  },
  "condition": {},
  "editorSetting": {
    "tabIndent": "auto",
    "tabSize": 2
  },
  "appid": "wx8f961bcd8b26996a"
}
```

- [ ] **Step 4: Add the minimal application entry and typings**

Create `miniprogram/app.ts`:

```ts
App<IAppOption>({
  globalData: {
    datasetVersion: null,
  },
})
```

Create `miniprogram/typings/index.d.ts`:

```ts
interface IAppOption {
  globalData: {
    datasetVersion: string | null
  }
}
```

Create `miniprogram/app.json`:

```json
{
  "pages": ["pages/home/index"],
  "window": {
    "navigationBarBackgroundColor": "#2f302b",
    "navigationBarTextStyle": "white",
    "navigationBarTitleText": "航海助手",
    "backgroundColor": "#ded7c7",
    "backgroundTextStyle": "dark"
  },
  "style": "v2",
  "componentFramework": "glass-easel",
  "sitemapLocation": "sitemap.json",
  "lazyCodeLoading": "requiredComponents"
}
```

Create `miniprogram/app.wxss`:

```css
page {
  min-height: 100%;
  background: #ded7c7;
  color: #292a26;
  font-family: serif;
}

view,
text,
button,
input,
image,
scroll-view {
  box-sizing: border-box;
}
```

Create `miniprogram/sitemap.json`:

```json
{
  "desc": "航海助手頁面索引",
  "rules": [{ "action": "allow", "page": "*" }]
}
```

- [ ] **Step 5: Remove the generated JavaScript template**

Delete only the paths listed in this task: root `app.*`, root `sitemap.json`, `pages/index`, `pages/logs`, and `utils/util.js`. Preserve the two reference screenshots, documents, Git metadata, and `project.config.json`.

- [ ] **Step 6: Run the focused test**

Run:

```powershell
npm.cmd test -- tests/config/project-config.test.ts
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
```

Expected: all commands exit with code 0 after the legacy template has been removed.

- [ ] **Step 7: Commit the source-root migration**

```powershell
git add project.config.json miniprogram tests/config/project-config.test.ts app.js app.json app.wxss sitemap.json pages utils
git commit -m "refactor: migrate mini program source to TypeScript"
```

### Task 3: Add a minimal Traditional Chinese application shell

**Files:**
- Create: `tests/config/app-shell.test.ts`
- Create: `miniprogram/pages/home/index.ts`
- Create: `miniprogram/pages/home/index.json`
- Create: `miniprogram/pages/home/index.wxml`
- Create: `miniprogram/pages/home/index.wxss`

**Interfaces:**
- Consumes: Task 2 `miniprogram/app.json` home route.
- Produces: a compilable home page with no unfinished feature cards or remote dependencies.

- [ ] **Step 1: Write the failing shell contract**

Create `tests/config/app-shell.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('application shell', () => {
  it('uses the confirmed home route and Traditional Chinese copy', () => {
    const app = JSON.parse(readFileSync('miniprogram/app.json', 'utf8')) as {
      pages: string[]
    }
    const wxml = readFileSync('miniprogram/pages/home/index.wxml', 'utf8')

    expect(app.pages).toEqual(['pages/home/index'])
    expect(wxml).toContain('航海助手')
    expect(wxml).toContain('航海士名鑑')
    expect(wxml).not.toContain('即將推出')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm.cmd test -- tests/config/app-shell.test.ts
```

Expected: FAIL because the home page files do not exist.

- [ ] **Step 3: Add the minimal page**

Create `miniprogram/pages/home/index.ts`:

```ts
Page({
  data: {
    title: '航海助手',
    moduleName: '航海士名鑑',
    status: '資料庫建置中',
  },
})
```

Create `miniprogram/pages/home/index.json`:

```json
{
  "navigationBarTitleText": "航海助手"
}
```

Create `miniprogram/pages/home/index.wxml`:

```xml
<view class="page">
  <view class="masthead">
    <text class="title">{{title}}</text>
    <text class="subtitle">UNCHARTED WATERS ORIGIN</text>
  </view>
  <view class="module" aria-label="{{moduleName}}">
    <text class="module__name">{{moduleName}}</text>
    <text class="module__status">{{status}}</text>
  </view>
</view>
```

Create `miniprogram/pages/home/index.wxss`:

```css
.page {
  min-height: 100vh;
  padding: 32rpx 28rpx;
}

.masthead {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 20rpx 0 28rpx;
  border-bottom: 2rpx solid #8f7848;
}

.title {
  color: #34342f;
  font-size: 44rpx;
  font-weight: 700;
}

.subtitle {
  color: #75684d;
  font-size: 20rpx;
  letter-spacing: 2rpx;
}

.module {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 24rpx;
  padding: 24rpx;
  border: 2rpx solid #8f7848;
  background: #eee8da;
}

.module__name {
  font-size: 32rpx;
  font-weight: 700;
}

.module__status {
  color: #765f35;
  font-size: 24rpx;
}
```

- [ ] **Step 4: Run the shell contract and static checks**

Run:

```powershell
npm.cmd test -- tests/config/app-shell.test.ts
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
```

Expected: all commands exit with code 0.

- [ ] **Step 5: Compile in WeChat DevTools**

Open the repository root in WeChat DevTools and compile once. Verify:

- DevTools resolves `miniprogram/app.json`.
- `miniprogram/app.ts` compiles without a duplicate `app.js` source file.
- The simulator shows the Traditional Chinese shell.
- No login permission, network, missing route, or TypeScript diagnostics appear.

- [ ] **Step 6: Commit the shell**

```powershell
git add miniprogram/pages/home tests/config/app-shell.test.ts
git commit -m "feat: add Traditional Chinese app shell"
```

### Task 4: Enforce the local-only runtime boundary

**Files:**
- Create: `tests/unit/local-only.test.ts`
- Create: `tools/quality/find-runtime-network-references.ts`
- Create: `tools/quality/check-runtime-network.ts`

**Interfaces:**
- Consumes: a runtime root path.
- Produces: `findRuntimeNetworkReferences(root: string): RuntimeNetworkReference[]`.

- [ ] **Step 1: Write the failing scanner tests**

Create `tests/unit/local-only.test.ts`:

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findRuntimeNetworkReferences } from '../../tools/quality/find-runtime-network-references'

const fixture = (content: string): string => {
  const root = mkdtempSync(join(tmpdir(), 'uwo-local-only-'))
  mkdirSync(join(root, 'pages'), { recursive: true })
  writeFileSync(join(root, 'pages', 'index.ts'), content, 'utf8')
  return root
}

describe('findRuntimeNetworkReferences', () => {
  it('accepts local mini-program assets', () => {
    expect(findRuntimeNetworkReferences(fixture("const portrait = '/assets/officers/1.png'"))).toEqual([])
  })

  it.each([
    ["const portrait = 'https://example.com/1.png'", 'remote URL'],
    ["wx.request({ url: '/api' })", 'wx.request'],
    ["wx.downloadFile({ url: '/asset' })", 'wx.downloadFile'],
    ["wx.cloud.init()", 'wx.cloud'],
  ])('rejects %s', (content, reason) => {
    expect(findRuntimeNetworkReferences(fixture(content))).toEqual([
      expect.objectContaining({ reason }),
    ])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```powershell
npm.cmd test -- tests/unit/local-only.test.ts
```

Expected: FAIL because the scanner module does not exist.

- [ ] **Step 3: Implement the pure scanner**

Create `tools/quality/find-runtime-network-references.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

export interface RuntimeNetworkReference {
  file: string
  line: number
  reason: 'remote URL' | 'wx.request' | 'wx.downloadFile' | 'wx.cloud'
}

const sourceExtensions = new Set(['.ts', '.json', '.wxml', '.wxss', '.wxs'])
const forbidden = [
  { pattern: /https?:\/\//, reason: 'remote URL' as const },
  { pattern: /\\bwx\\.request\\s*\\(/, reason: 'wx.request' as const },
  { pattern: /\\bwx\\.downloadFile\\s*\\(/, reason: 'wx.downloadFile' as const },
  { pattern: /\\bwx\\.cloud\\b/, reason: 'wx.cloud' as const },
]

export const findRuntimeNetworkReferences = (root: string): RuntimeNetworkReference[] => {
  const results: RuntimeNetworkReference[] = []

  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(path)
        continue
      }
      if (!sourceExtensions.has(extname(path))) continue

      readFileSync(path, 'utf8')
        .split(/\\r?\\n/)
        .forEach((line, index) => {
          for (const rule of forbidden) {
            if (rule.pattern.test(line)) {
              results.push({
                file: relative(root, path).replaceAll('\\\\', '/'),
                line: index + 1,
                reason: rule.reason,
              })
            }
          }
        })
    }
  }

  visit(root)
  return results
}
```

Create `tools/quality/check-runtime-network.ts`:

```ts
import { findRuntimeNetworkReferences } from './find-runtime-network-references'

const findings = findRuntimeNetworkReferences('miniprogram')

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line} ${finding.reason}`)
  }
  process.exitCode = 1
} else {
  console.log('Runtime network boundary: PASS')
}
```

- [ ] **Step 4: Run the focused tests and CLI**

Run:

```powershell
npm.cmd test -- tests/unit/local-only.test.ts
npm.cmd run check:runtime-network
```

Expected: tests pass and the CLI prints `Runtime network boundary: PASS`.

- [ ] **Step 5: Commit the boundary check**

```powershell
git add tools/quality tests/unit/local-only.test.ts package.json package-lock.json
git commit -m "test: enforce local-only runtime boundary"
```

### Task 5: Document and verify the development baseline

**Files:**
- Create: `tests/config/readme-contract.test.ts`
- Create: `README.md`

**Interfaces:**
- Consumes: Tasks 1–4 commands and project layout.
- Produces: a zero-context setup guide and one complete `npm run verify` gate.

- [ ] **Step 1: Write the failing documentation contract**

Create `tests/config/readme-contract.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('developer documentation', () => {
  it('documents installation, verification, and DevTools source root', () => {
    const readme = readFileSync('README.md', 'utf8')
    expect(readme).toContain('npm.cmd ci')
    expect(readme).toContain('npm.cmd run verify')
    expect(readme).toContain('miniprogram/')
    expect(readme).toContain('微信開發者工具')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm.cmd test -- tests/config/readme-contract.test.ts
```

Expected: FAIL because `README.md` does not exist.

- [ ] **Step 3: Create the setup guide**

Create `README.md`:

````markdown
# UWO Assistant

《Uncharted Waters Origin》國際服航海士資料查詢微信小程序。

## 本機安裝

```powershell
npm.cmd ci
```

## 完整驗證

```powershell
npm.cmd run verify
```

此命令依序檢查格式、ESLint、TypeScript、Vitest，以及小程序執行碼是否包含遠端資料或網路 API。

## 微信開發者工具

使用微信開發者工具開啟專案根目錄。`project.config.json` 會將小程序來源指向 `miniprogram/`，並使用內建 TypeScript 編譯插件。

首次編譯後確認首頁顯示「航海助手」與「航海士名鑑」，且控制台沒有登入、網路、路由或 TypeScript 錯誤。

## 目錄邊界

- `miniprogram/`：小程序執行碼與本地素材。
- `data/master/`：後續建立的唯一可人工維護資料源。
- `archive/`：後續保存的一次性來源快照，不進入小程序包。
- `tools/`：資料、素材和品質工具。
- `tests/`：單元、契約和流程測試。
- `docs/superpowers/`：已確認規格與實施計畫。
````

- [ ] **Step 4: Run the documentation test**

Run:

```powershell
npm.cmd test -- tests/config/readme-contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the complete automated gate**

Run:

```powershell
npm.cmd run verify
```

Expected: formatting, lint, typecheck, all Vitest tests, and the runtime-network check exit with code 0.

- [ ] **Step 6: Perform final DevTools verification**

Compile in WeChat DevTools and verify the four Task 3 conditions again, then commit the verified documentation:

```powershell
git add README.md tests/config/readme-contract.test.ts
git commit -m "docs: document local development workflow"
```

## Plan Self-Review

- Spec coverage for this phase: native TypeScript source root, local Git workflow, Traditional Chinese shell, no login/network starter behavior, ESLint, Prettier, automated tests, TDD-ready scripts, and DevTools compilation.
- Deliberately deferred to the named later phases in the roadmap: voyage.tw field audit, canonical schemas, import, asset compression/package experiments, runtime query engine, production UI, and release verification.
- Public names used consistently: `miniprogram/`, `findRuntimeNetworkReferences`, `npm run verify`, and `check:runtime-network`.
- No production page reads canonical or generated officer data in this phase.
