import { posix as pathPosix } from 'node:path'

import type { ReviewScenario } from './types'

export type ReviewTriggerMode = 'iterate' | 'final'
export type TriggerOutcome = 'run' | 'skipped' | 'blocked'

export interface TriggerPlan {
  mode: ReviewTriggerMode
  changedFiles: string[]
  pageFiles: string[]
  scenarios: ReviewScenario[]
  outcome: TriggerOutcome
  reason?: string
}

const pageExtensions = new Set([
  '.wxml',
  '.wxss',
  '.ts',
  '.js',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.svg',
])

const generatedPathPatterns = [
  /^miniprogram\/generated(?:\/|$)/,
  /^miniprogram\/subpkg-detail\/details-[^/]+\.js$/,
  /^miniprogram\/subpkg-detail\/detail-index\.js$/,
  /^miniprogram\/subpkg-detail\/detail-loaders\.js$/,
  /^miniprogram\/subpkg-trade\/trade-details-[^/]+\.js$/,
  /^miniprogram\/subpkg-trade\/trade-detail-index\.js$/,
  /^miniprogram\/subpkg-trade\/trade-detail-loaders\.js$/,
  /^miniprogram\/subpkg-trade\/trade-goods\.js$/,
  /^miniprogram\/subpkg-trade\/trade-reference\.js$/,
  /^miniprogram\/subpkg-maintenance\/maintenance-officers\.js$/,
  /^miniprogram_npm(?:\/|$)/,
]

const sharedFleetShareAssetPatterns = [
  /^data\/master\/ui-assets\/fleet-share-map-source\.png$/,
  /^data\/master\/ui-assets\/fleet-share-nautical-motifs-source\.png$/,
  /^data\/master\/ui-assets\/config-paper-texture-source\.png$/,
  /^miniprogram\/assets\/ui\/fleet-share-nautical-motifs\.png$/,
  /^miniprogram\/assets\/ui\/config-paper-texture\.png$/,
  /^tools\/ui-assets\/(?:config|build-ui-assets)\.ts$/,
]

export const normalizeRepoPath = (value: string): string => {
  const normalized = value.trim().replace(/\\/g, '/')
  const withoutDotPrefix = normalized.replace(/^(?:\.\/)+/, '')
  const segments = withoutDotPrefix.split('/')
  const pathSegments = withoutDotPrefix.endsWith('/') ? segments.slice(0, -1) : segments
  if (
    withoutDotPrefix === '' ||
    withoutDotPrefix.startsWith('/') ||
    pathSegments.some((segment) => segment === '..' || segment === '' || segment === '.')
  ) {
    throw new Error(`不是安全的仓库相对路径：${value}`)
  }
  return withoutDotPrefix
}

const tryNormalize = (value: string): string | undefined => {
  try {
    return normalizeRepoPath(value)
  } catch {
    return undefined
  }
}

const isGeneratedPath = (path: string): boolean =>
  generatedPathPatterns.some((pattern) => pattern.test(path))

export const isPageRelatedPath = (value: string): boolean => {
  const path = tryNormalize(value)
  if (!path || path === 'miniprogram/app.json' || isGeneratedPath(path)) {
    return path === 'miniprogram/app.json'
  }
  if (sharedFleetShareAssetPatterns.some((pattern) => pattern.test(path))) return true
  if (!path.startsWith('miniprogram/')) return false
  return pageExtensions.has(pathPosix.extname(path).toLowerCase())
}

const isRouteChange = (path: string): boolean => path === 'miniprogram/app.json'

const matchesWatchPath = (filePath: string, watchPath: string): boolean => {
  const normalizedWatchPath = tryNormalize(watchPath)
  if (!normalizedWatchPath) return false
  if (normalizedWatchPath.endsWith('/')) {
    const directory = normalizedWatchPath.slice(0, -1)
    return filePath === directory || filePath.startsWith(normalizedWatchPath)
  }
  return filePath === normalizedWatchPath || filePath.startsWith(`${normalizedWatchPath}/`)
}

const fallbackWatchPath = (entry: string): string => {
  const entryPath = entry.replace(/^\/+/, '')
  return `miniprogram/${pathPosix.dirname(entryPath)}/`
}

const scenarioMatches = (scenario: ReviewScenario, pageFiles: string[]): boolean => {
  const watchPaths = scenario.watchPaths?.length
    ? scenario.watchPaths
    : [fallbackWatchPath(scenario.entry)]
  return pageFiles.some((filePath) =>
    watchPaths.some((watchPath) => matchesWatchPath(filePath, watchPath)),
  )
}

const compareScenario = (left: ReviewScenario, right: ReviewScenario): number => {
  const leftNormal = left.state === 'normal' ? 0 : 1
  const rightNormal = right.state === 'normal' ? 0 : 1
  if (leftNormal !== rightNormal) return leftNormal - rightNormal
  if (left.steps.length !== right.steps.length) return left.steps.length - right.steps.length
  return left.name.localeCompare(right.name)
}

const chooseIterateScenarios = (scenarios: ReviewScenario[]): ReviewScenario[] => {
  const byEntry = new Map<string, ReviewScenario[]>()
  for (const scenario of scenarios) {
    const group = byEntry.get(scenario.entry) ?? []
    group.push(scenario)
    byEntry.set(scenario.entry, group)
  }
  return [...byEntry.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, group]) => [...group].sort(compareScenario)[0])
    .filter((scenario): scenario is ReviewScenario => Boolean(scenario))
}

const sortFinalScenarios = (scenarios: ReviewScenario[]): ReviewScenario[] =>
  [...scenarios].sort((left, right) => {
    const byEntry = left.entry.localeCompare(right.entry)
    if (byEntry !== 0) return byEntry
    const byState = left.state.localeCompare(right.state)
    return byState === 0 ? left.name.localeCompare(right.name) : byState
  })

const uniqueSorted = (values: string[]): string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right))

export const createTriggerPlan = (input: {
  mode: ReviewTriggerMode
  changedFiles: string[]
  scenarios: ReviewScenario[]
}): TriggerPlan => {
  const changedFiles = uniqueSorted(
    input.changedFiles.map((value) => tryNormalize(value)).filter(Boolean) as string[],
  )
  const pageFiles = changedFiles.filter(isPageRelatedPath)
  if (pageFiles.length === 0) {
    return {
      mode: input.mode,
      changedFiles,
      pageFiles,
      scenarios: [],
      outcome: input.mode === 'iterate' ? 'skipped' : 'blocked',
      reason:
        input.mode === 'iterate'
          ? '未发现页面相关变更，已跳过自动验收'
          : '未检测到页面变更，无法用本次命令证明页面已验收',
    }
  }

  const matched = pageFiles.some(isRouteChange)
    ? [...input.scenarios]
    : input.scenarios.filter((scenario) => scenarioMatches(scenario, pageFiles))
  if (matched.length === 0) {
    return {
      mode: input.mode,
      changedFiles,
      pageFiles,
      scenarios: [],
      outcome: 'blocked',
      reason: '页面变更没有匹配到验收场景，请为场景补充 watchPaths',
    }
  }

  return {
    mode: input.mode,
    changedFiles,
    pageFiles,
    scenarios:
      input.mode === 'iterate' ? chooseIterateScenarios(matched) : sortFinalScenarios(matched),
    outcome: 'run',
  }
}
