import { createHash } from 'node:crypto'
import { dirname, resolve, basename } from 'node:path'
import { readInputTree } from '../workflow/read-inputs'

/** 依 generate.ts 及其傳遞依賴維護；不含正式生成產物或報告。 */
export const GENERATION_INPUT_PATHS: readonly string[] = [
  'package.json',
  'package-lock.json',
  'data/master/',
  'data/schema/',
  'data/audit/skill-group-mapping.json',
  'archive/voyage-tw-2026052501/raw-data/json_char.js',
  'miniprogram/subpkg-trade/assets/major-events/',
  'miniprogram/contracts/',
  'tools/data-pipeline/',
  'tools/data-audit/',
  'tools/import/',
  'tools/asset-pipeline/',
  'tools/workflow/read-inputs.ts',
  'data/assets/cloudbase-manifest.json',
]

export function fingerprintGenerationInputs(input: {
  projectRoot: string
  env: Record<string, string | undefined>
}): string {
  const hash = createHash('sha256')
  const entries = new Map<string, string>()
  for (const p of GENERATION_INPUT_PATHS) {
    // manifest 的實際路徑可能由既有環境變數覆蓋。
    if (p === 'data/assets/cloudbase-manifest.json') continue
    for (const [name, digest] of readInputTree(input.projectRoot, p)) entries.set(name, digest)
  }
  for (const [key, fallback, required] of [
    ['CLOUDBASE_ASSET_MANIFEST_PATH', 'data/assets/cloudbase-manifest.json', true],
    ['CLOUDBASE_ASSET_REUSE_PATH', 'data/assets/cloudbase-reused-skill-icons.json', false],
  ] as const) {
    const path = resolve(input.projectRoot, input.env[key] ?? fallback)
    hash.update(JSON.stringify([key, path]))
    const files = readInputTree(
      dirname(path),
      basename(path),
      required || input.env[key] !== undefined,
    )
    hash.update(JSON.stringify([...files.entries()]))
  }
  hash.update(
    JSON.stringify([...entries.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
  )
  return hash.digest('hex')
}
