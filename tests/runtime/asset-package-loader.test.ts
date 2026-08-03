import { describe, expect, it } from 'vitest'

import {
  ASSET_PACKAGE_ROOTS,
  createAssetPackageLoader,
} from '../../miniprogram/runtime/asset-package-loader'

describe('asset package loader', () => {
  it('loads every asset package in root order and records completion', async () => {
    const calls: string[] = []
    const loader = createAssetPackageLoader({
      navigateTo: async (url) => {
        calls.push(`to:${url}`)
      },
      navigateBack: async () => {
        calls.push('back')
      },
    })

    await loader.loadAll()

    expect(calls.slice(0, 4)).toEqual([
      'to:/subpkg-a0/pages/placeholder/index',
      'back',
      'to:/subpkg-a1/pages/placeholder/index',
      'back',
    ])
    expect(calls).toHaveLength(ASSET_PACKAGE_ROOTS.length * 2)
    expect(loader.loadedRoots()).toEqual([...ASSET_PACKAGE_ROOTS])
  })

  it('does not navigate again when all packages have already loaded', async () => {
    let navigateCount = 0
    const loader = createAssetPackageLoader({
      navigateTo: async () => {
        navigateCount += 1
      },
      navigateBack: async () => {
        navigateCount += 1
      },
    })
    await loader.loadAll()
    await loader.loadAll()

    expect(navigateCount).toBe(ASSET_PACKAGE_ROOTS.length * 2)
    expect(loader.loadedRoots()).toEqual([...ASSET_PACKAGE_ROOTS])
  })

  it('stops at the first failed package and leaves later packages unloaded', async () => {
    const calls: string[] = []
    const loader = createAssetPackageLoader({
      navigateTo: async (url) => {
        calls.push(`to:${url}`)
        if (url.includes('subpkg-a2')) {
          throw new Error('navigation failed')
        }
      },
      navigateBack: async () => {
        calls.push('back')
      },
    })

    await expect(loader.loadAll()).rejects.toThrow('subpkg-a2')
    expect(calls).toEqual([
      'to:/subpkg-a0/pages/placeholder/index',
      'back',
      'to:/subpkg-a1/pages/placeholder/index',
      'back',
      'to:/subpkg-a2/pages/placeholder/index',
    ])
    expect(loader.loadedRoots()).toEqual(['subpkg-a0', 'subpkg-a1'])
  })
})
