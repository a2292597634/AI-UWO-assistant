import { resolve, relative, isAbsolute } from 'node:path'

/** 只列工具擁有的產物，不含分包人工頁面與素材。 */
export const DATA_GENERATION_OUTPUT_PATHS: readonly string[] = [
  'miniprogram/generated',
  'miniprogram/subpkg-fleet/generated/fleet-officers.js',
  ...Array.from({ length: 10 }, (_, n) => `miniprogram/subpkg-detail/details-${n}.js`),
  'miniprogram/subpkg-detail/detail-index.js',
  'miniprogram/subpkg-detail/detail-loaders.js',
  ...Array.from({ length: 10 }, (_, n) => `miniprogram/subpkg-trade/trade-details-${n}.js`),
  'miniprogram/subpkg-trade/trade-detail-index.js',
  'miniprogram/subpkg-trade/trade-detail-loaders.js',
  'miniprogram/subpkg-trade/trade-goods.js',
  'miniprogram/subpkg-trade/trade-reference.js',
  'miniprogram/subpkg-trade/major-event-reference.js',
  'miniprogram/subpkg-maintenance/maintenance-officers.js',
  'cloudfunctions/officer-custom/reference-data.json',
  'cloudfunctions/officer-maintenance/reference-data.json',
  'data/assets/asset-dependencies.json',
]

export function assertProjectPath(projectRoot: string, path: string): string {
  const target = resolve(path)
  const child = relative(resolve(projectRoot), target)
  if (
    !child ||
    child === '..' ||
    child.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
    isAbsolute(child)
  )
    throw new Error(`回復路徑超出專案範圍：${target}`)
  return target
}

export function getMaintenanceRollbackPaths(projectRoot: string): readonly string[] {
  return [
    ...DATA_GENERATION_OUTPUT_PATHS,
    'data/assets/staging',
    'data/assets/cloudbase-manifest.json',
  ].map((path) => assertProjectPath(projectRoot, resolve(projectRoot, path)))
}
