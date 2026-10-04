import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { UI_ASSET_RECIPES } from '../ui-assets/config'
import { MAJOR_EVENTS_ASSET_DEFINITIONS } from '../ui-assets/major-events-config'
import { CI_ASSET_FILENAMES } from '../asset-pipeline/ci-asset-inputs'
import {
  validatePublishedAssetManifest,
  type PublishedAssetManifest,
} from '../asset-pipeline/cloudbase-manifest'
import { diagnoseReviewConfig, resolveReviewConfig } from '../miniprogram-review/config'

export type PreflightScope = 'repository' | 'page'
export interface PreflightItem {
  code: string
  level: 'error' | 'warning' | 'info'
  message: string
  paths: string[]
}
export interface PreflightReport {
  schemaVersion: 1
  projectRoot: string
  nodeVersion: string
  npmVersion: string
  platform: string
  ready: boolean
  items: PreflightItem[]
}
export function checkNodeVersion(version: string): PreflightItem {
  const supported = /^v?22\.\d+\.\d+$/.test(version)
  return {
    code: supported ? 'NODE_SUPPORTED' : 'NODE_UNSUPPORTED',
    level: supported ? 'info' : 'error',
    message: supported
      ? 'Node 版本符合專案要求。'
      : '請使用既有 Node >=22 <23；預檢不安裝或切換環境。',
    paths: [],
  }
}
export function checkNpmVersion(version: string): PreflightItem {
  const match = /^v?(\d+)\.\d+\.\d+$/.exec(version)
  const supported = match !== null && Number(match[1]) >= 10
  return {
    code: !match ? 'NPM_UNVERIFIED' : supported ? 'NPM_SUPPORTED' : 'NPM_UNSUPPORTED',
    level: supported ? 'info' : 'error',
    message: supported
      ? 'npm 版本符合專案要求。'
      : '請使用 npm >=10，從 npm script 執行以取得可核對版本；不啟動安裝。',
    paths: [],
  }
}
export function collectPreflight(input: {
  projectRoot: string
  scope: PreflightScope
  nodeVersion: string
  npmVersion: string
  platform: string
  env: Record<string, string | undefined>
}): PreflightReport {
  const root = resolve(input.projectRoot)
  const items: PreflightItem[] = [
    checkNodeVersion(input.nodeVersion),
    checkNpmVersion(input.npmVersion),
  ]
  const read = (p: string, json = p.endsWith('.json'), required = true): unknown => {
    const file = resolve(root, p)
    if (!existsSync(file)) {
      if (required)
        items.push({
          code: 'INPUT_MISSING',
          level: 'error',
          message: '必要輸入缺失；請在隔離副本準備。',
          paths: [file],
        })
      return undefined
    }
    try {
      const bytes = readFileSync(file)
      return json ? (JSON.parse(bytes.toString('utf8')) as unknown) : bytes
    } catch {
      items.push({
        code: 'INPUT_INVALID',
        level: 'error',
        message: '輸入無法讀取或 JSON 損壞。',
        paths: [file],
      })
      return undefined
    }
  }
  for (const p of [
    'package.json',
    'package-lock.json',
    ...[
      'dataset',
      'officers',
      'skills',
      'dictionaries',
      'assets',
      'trade-goods',
      'major-events',
    ].map((n) => 'data/master/' + n + '.json'),
    ...[
      'dataset',
      'officers',
      'skills',
      'dictionaries',
      'assets',
      'trade-goods',
      'major-events',
    ].map((n) => 'data/schema/' + n + '.schema.json'),
    'data/audit/skill-group-mapping.json',
    'data/audit/source-field-inventory.json',
    'data/audit/source-enum-inventory.json',
    'archive/voyage-tw-2026052501/raw-data/json_char.js',
    'tools/data-pipeline/generate.ts',
    'tools/data-audit/check-master-dataset.ts',
    'tools/ui-assets/build-ui-assets.ts',
    'tools/ui-assets/build-major-events-assets.ts',
  ])
    read(p)
  read('data/master/custom-officers.json', true, false)
  for (const recipe of UI_ASSET_RECIPES) read('data/master/ui-assets/' + recipe.source, false)
  for (const definition of MAJOR_EVENTS_ASSET_DEFINITIONS) {
    read('data/master/ui-assets/major-events/' + definition.source, false)
    read('miniprogram/subpkg-trade/assets/major-events/' + definition.output, false)
  }
  const manifestPath = resolve(
    root,
    input.env.CLOUDBASE_ASSET_MANIFEST_PATH ?? 'data/assets/cloudbase-manifest.json',
  )
  const manifestValue = read(manifestPath)
  let manifest: PublishedAssetManifest | undefined
  if (manifestValue !== undefined) {
    try {
      validatePublishedAssetManifest(manifestValue as PublishedAssetManifest)
      manifest = manifestValue as PublishedAssetManifest
    } catch {
      items.push({
        code: 'INPUT_INVALID',
        level: 'error',
        message: '發布 manifest 結構或素材欄位無效。',
        paths: [manifestPath],
      })
    }
  }
  const reusePath = resolve(
    root,
    input.env.CLOUDBASE_ASSET_REUSE_PATH ?? 'data/assets/cloudbase-reused-skill-icons.json',
  )
  read(reusePath, true, input.env.CLOUDBASE_ASSET_REUSE_PATH !== undefined)
  items.push({
    code: 'ASSET_INPUT_PATHS',
    level: 'info',
    message: '生成採用的 manifest／可選 reuse 路徑。',
    paths: [manifestPath, reusePath],
  })
  for (const name of CI_ASSET_FILENAMES) {
    const path = join(root, 'data/assets/staging', name)
    const asset = Array.isArray(manifest?.assets)
      ? manifest.assets.find((a) => a.filename === name)
      : undefined
    if (!asset)
      items.push({
        code: 'CI_MANIFEST_INVALID',
        level: 'error',
        message: 'manifest 缺少 CI 素材。',
        paths: [manifestPath, path],
      })
    else if (!existsSync(path))
      items.push({
        code: 'CI_ASSET_MISSING',
        level: 'error',
        message: '在乾淨隔離副本執行 npm run assets:ci 準備已發布素材；預檢不下載。',
        paths: [path],
      })
    else {
      try {
        const bytes = readFileSync(path)
        if (
          bytes.length !== asset.bytes ||
          createHash('sha256').update(bytes).digest('hex') !== asset.sha256
        )
          items.push({
            code: 'CI_ASSET_INVALID',
            level: 'error',
            message: '已有素材與發布 bytes 不符；不覆寫。',
            paths: [path],
          })
      } catch {
        items.push({
          code: 'INPUT_INVALID',
          level: 'error',
          message: 'CI 素材無法讀取。',
          paths: [path],
        })
      }
    }
  }
  if (input.platform !== 'win32')
    items.push({
      code: 'PLATFORM_DIFFERENCE',
      level: 'warning',
      message: '正式 CI 使用 Windows；素材原生依賴結果須分開驗證。',
      paths: [],
    })
  if (input.scope === 'page') {
    try {
      const config = resolveReviewConfig({ cwd: root, args: {}, env: input.env })
      for (const d of diagnoseReviewConfig(config))
        items.push({
          ...d,
          paths: [config.projectPath, ...(config.cliPath ? [config.cliPath] : [])],
        })
      const publicConfig = read(join(config.projectPath, 'project.config.json')) as
        { libVersion?: string } | undefined
      const privateConfig = read(
        join(config.projectPath, 'project.private.config.json'),
        true,
        false,
      ) as { libVersion?: string } | undefined
      const effective = privateConfig?.libVersion ?? publicConfig?.libVersion ?? '未知'
      items.push({
        code:
          privateConfig?.libVersion && privateConfig.libVersion !== publicConfig?.libVersion
            ? 'BASE_LIBRARY_OVERRIDE'
            : 'BASE_LIBRARY_CONFIG',
        level:
          privateConfig?.libVersion && privateConfig.libVersion !== publicConfig?.libVersion
            ? 'warning'
            : 'info',
        message: '公共基礎庫：' + (publicConfig?.libVersion ?? '未知') + '；有效配置：' + effective,
        paths: [config.projectPath],
      })
    } catch {
      items.push({
        code: 'PAGE_CONFIG_INVALID',
        level: 'error',
        message: '頁面配置無效，請核對本機 CLI／端點設定。',
        paths: [root],
      })
    }
    items.push({
      code: 'PAGE_PROBE_NOT_RUN',
      level: 'info',
      message: '實際 SDK／頁面／元素探測：未執行；靜態就緒不能代替場景驗收。',
      paths: [root],
    })
  }
  return {
    schemaVersion: 1,
    projectRoot: root,
    nodeVersion: input.nodeVersion,
    npmVersion: input.npmVersion,
    platform: input.platform,
    ready: !items.some((i) => i.level === 'error'),
    items,
  }
}
