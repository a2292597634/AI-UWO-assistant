import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  assertAssetDependencyIndex,
  type AssetDependencyIndex,
} from '../../tools/data-pipeline/asset-dependencies'

const dependencyPath = resolve(__dirname, '../../data/assets/asset-dependencies.json')
const generatedPath = resolve(__dirname, '../../miniprogram/generated/asset-dependencies.js')
const appConfig = JSON.parse(
  readFileSync(resolve(__dirname, '../../miniprogram/app.json'), 'utf8'),
) as { subpackages: Array<{ root: string; name: string }> }

describe('generated asset dependency output', () => {
  const dependencies = ((): AssetDependencyIndex => {
    if (!existsSync(dependencyPath)) {
      throw new Error(
        `Asset dependency index not found at ${dependencyPath}. Run npm run data:generate first.`,
      )
    }
    return JSON.parse(readFileSync(dependencyPath, 'utf8')) as AssetDependencyIndex
  })()

  it('writes to data/assets/asset-dependencies.json as plain JSON', () => {
    expect(existsSync(dependencyPath)).toBe(true)
    // Plain JSON: the first non-whitespace character must be { not m (module.exports)
    const raw = readFileSync(dependencyPath, 'utf8').trimStart()
    expect(raw.startsWith('{')).toBe(true)
  })

  it('does not output into miniprogram/generated/', () => {
    // The legacy JS module must not exist after the migration
    expect(existsSync(generatedPath)).toBe(false)
  })

  it('keeps seven deterministic catalog roots in canonical directory order', () => {
    expect(dependencies.roots.map((root) => root.root)).toEqual([
      'subpkg-assets-0',
      'subpkg-assets-1',
      'subpkg-assets-2',
      'subpkg-assets-3',
      'subpkg-assets-4',
      'subpkg-assets-5',
      'subpkg-assets-6',
    ])
    const counts = dependencies.roots.map((root) => root.officerIds.length)
    // 7 个素材根，每个最多 100 个航海士
    expect(counts).toHaveLength(7)
    expect(counts.every((c) => c <= 100)).toBe(true)
    expect(counts.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(627)
  })

  it('validates one physical owner for every generated asset reference', () => {
    assertAssetDependencyIndex(dependencies)

    const files = dependencies.roots.flatMap((root) => root.files)
    expect(new Set(files).size).toBe(files.length)
    expect(
      Object.keys(dependencies.pathToRoot).every((path) => path.startsWith('/subpkg-assets-')),
    ).toBe(true)
  })

  it('keeps build-only roots out of the app subpackage configuration', () => {
    const appRoots = appConfig.subpackages
      .filter((subpackage) => subpackage.name.startsWith('assetsCatalog'))
      .map((subpackage) => subpackage.root)
    expect(appRoots).toEqual([])
    expect(appRoots.some((root) => /^subpkg-a\d$/.test(root))).toBe(false)
  })
})
