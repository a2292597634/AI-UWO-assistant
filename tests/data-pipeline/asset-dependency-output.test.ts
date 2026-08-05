import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  assertAssetDependencyIndex,
  type AssetDependencyIndex,
} from '../../tools/data-pipeline/asset-dependencies'

const generatedDependencies = readFileSync(
  resolve(__dirname, '../../miniprogram/generated/asset-dependencies.js'),
  'utf8',
)
const dependencies = JSON.parse(
  generatedDependencies.replace(/^module\.exports\s*=\s*/, ''),
) as AssetDependencyIndex
const appConfig = JSON.parse(
  readFileSync(resolve(__dirname, '../../miniprogram/app.json'), 'utf8'),
) as { subpackages: Array<{ root: string; name: string }> }

describe('generated asset dependency output', () => {
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
    expect(dependencies.roots.map((root) => root.officerIds.length)).toEqual([
      100, 100, 100, 100, 100, 100, 27,
    ])
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
