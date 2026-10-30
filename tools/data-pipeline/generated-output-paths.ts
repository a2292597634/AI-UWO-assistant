import { resolve, relative, isAbsolute, join, sep, dirname, parse } from 'node:path'
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

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
  'cloudfunctions/coupon-redemption/game-servers.json',
  'cloudfunctions/message-board/game-servers.json',
  'cloudfunctions/major-event-reminder/reference-data.json',
  'cloudfunctions/major-event-reminder-worker/reference-data.json',
  'cloudfunctions/major-event-reminder-worker/shared',
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
  let current = parse(target).root
  for (const part of target.slice(current.length).split(sep)) {
    current = join(current, part)
    try {
      if (lstatSync(current).isSymbolicLink())
        throw new Error(`拒絕符號連結或 junction：${current}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return target
}

/** 完整收集普通檔案 bytes 與目錄成員，拒絕連結和特殊檔案。 */
export function readGenerationTree(
  root: string,
  path: string,
  required = true,
): Map<string, string> {
  const target = assertProjectPath(root, resolve(root, path))
  const files = new Map<string, string>()
  if (!existsSync(target)) {
    if (required) throw new Error(`輸入或產物缺失：${target}`)
    return files
  }
  const visit = (file: string): void => {
    assertProjectPath(root, file)
    const stat = lstatSync(file)
    const name = relative(resolve(root), file).replace(/\\/g, '/')
    if (stat.isDirectory()) {
      files.set(name + '/', 'directory')
      for (const entry of readdirSync(file).sort()) visit(join(file, entry))
    } else if (stat.isFile())
      files.set(name, createHash('sha256').update(readFileSync(file)).digest('hex'))
    else throw new Error(`不是普通檔案或目錄：${file}`)
  }
  visit(target)
  return files
}

/** 分片目錄含人工檔案，只擴充工具擁有的分片命名空間以偵測陳舊多檔。 */
export function expandGenerationOutputPaths(root: string, paths: readonly string[]): string[] {
  const result = new Set(paths)
  for (const [directory, pattern] of [
    ['miniprogram/subpkg-detail', /^details-.*\.js$/],
    ['miniprogram/subpkg-trade', /^trade-details-.*\.js$/],
  ] as const) {
    if (!paths.some((path) => dirname(path).replace(/\\/g, '/') === directory)) continue
    const target = assertProjectPath(root, resolve(root, directory))
    if (!existsSync(target)) continue
    for (const name of readdirSync(target))
      if (pattern.test(name)) result.add(`${directory}/${name}`)
  }
  return [...result].sort()
}

export function getMaintenanceRollbackPaths(projectRoot: string): readonly string[] {
  return [
    ...DATA_GENERATION_OUTPUT_PATHS,
    'data/assets/staging',
    'data/assets/cloudbase-manifest.json',
  ].map((path) => assertProjectPath(projectRoot, resolve(projectRoot, path)))
}
