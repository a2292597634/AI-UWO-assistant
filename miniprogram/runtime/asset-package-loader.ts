export const ASSET_PACKAGE_ROOTS = [
  'subpkg-a0',
  'subpkg-a1',
  'subpkg-a2',
  'subpkg-a3',
  'subpkg-a4',
  'subpkg-a5',
  'subpkg-a6',
  'subpkg-a7',
  'subpkg-a8',
  'subpkg-a9',
] as const

export interface AssetPackageNavigation {
  navigateTo(url: string): Promise<void>
  navigateBack(): Promise<void>
}

export interface AssetPackageLoader {
  loadAll(): Promise<void>
  loadedRoots(): readonly string[]
}

interface TestableAssetPackageLoader extends AssetPackageLoader {
  resetForTests(): void
}

const placeholderUrl = (root: string): string => `/${root}/pages/placeholder/index`

const errorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

export const createAssetPackageLoader = (
  navigation: AssetPackageNavigation,
): TestableAssetPackageLoader => {
  const loaded = new Set<string>()
  let inFlight: Promise<void> | undefined

  const loadRoot = async (root: string): Promise<void> => {
    if (loaded.has(root)) return

    try {
      await navigation.navigateTo(placeholderUrl(root))
      await navigation.navigateBack()
      loaded.add(root)
    } catch (error) {
      throw Object.assign(new Error(`asset package ${root} failed: ${errorMessage(error)}`), {
        cause: error,
      })
    }
  }

  const loadAll = (): Promise<void> => {
    if (inFlight) return inFlight

    const pending = (async () => {
      for (const root of ASSET_PACKAGE_ROOTS) {
        await loadRoot(root)
      }
    })()

    inFlight = pending.finally(() => {
      inFlight = undefined
    })
    return inFlight
  }

  return {
    loadAll,
    loadedRoots: () => ASSET_PACKAGE_ROOTS.filter((root) => loaded.has(root)),
    resetForTests: () => {
      loaded.clear()
      inFlight = undefined
    },
  }
}

const wxNavigation: AssetPackageNavigation = {
  navigateTo: (url) =>
    new Promise<void>((resolve, reject) => {
      wx.navigateTo({
        url,
        success: () => resolve(),
        fail: reject,
      })
    }),
  navigateBack: () =>
    new Promise<void>((resolve, reject) => {
      wx.navigateBack({
        delta: 1,
        success: () => resolve(),
        fail: reject,
      })
    }),
}

const productionLoader = createAssetPackageLoader(wxNavigation)

export const assetPackageLoader: AssetPackageLoader = productionLoader

export const resetAssetPackageLoaderForTests = (): void => {
  productionLoader.resetForTests()
}
