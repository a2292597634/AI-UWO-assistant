import { describe, expect, it } from 'vitest'
import type { AssetDependencyIndex } from '../../tools/data-pipeline/asset-dependencies'
import { planAssetPackageLayout } from '../../tools/asset-pipeline/asset-package-builder'

const dependencyIndex = (overrides?: Partial<AssetDependencyIndex>): AssetDependencyIndex => ({
  roots: [
    {
      root: 'subpkg-assets-0',
      name: 'assetsCatalog0',
      officerIds: ['officer-a'],
      files: ['officer-a.png', 'skill-shared.png'],
    },
    {
      root: 'subpkg-assets-1',
      name: 'assetsCatalog1',
      officerIds: ['officer-b'],
      files: ['skill-shared.png', 'officer-b.png'],
    },
  ],
  pathToRoot: {},
  skillIcons: {},
  officerPortraits: {},
  officerCatalogRoots: {},
  officerDetailRoots: {},
  ...overrides,
})

describe('asset package layout planning', () => {
  it('retains only referenced source files and assigns shared files to the first root', () => {
    const plan = planAssetPackageLayout({
      dependencies: dependencyIndex(),
      sourceFiles: ['officer-a.png', 'skill-shared.png', 'officer-b.png', 'unused.png'],
      existingOutputFiles: ['officer-a.png', 'skill-shared.png', 'unused.png'],
    })

    expect(plan.missingFiles).toEqual([])
    expect(plan.staleFiles).toEqual(['unused.png'])
    expect(plan.roots).toEqual([
      { root: 'subpkg-assets-0', files: ['officer-a.png', 'skill-shared.png'] },
      { root: 'subpkg-assets-1', files: ['officer-b.png'] },
    ])
    expect(plan.retainedFiles).toEqual(['officer-a.png', 'skill-shared.png', 'officer-b.png'])
  })

  it('reports a referenced asset missing from the local source without inventing a file', () => {
    const plan = planAssetPackageLayout({
      dependencies: dependencyIndex(),
      sourceFiles: ['officer-a.png'],
      existingOutputFiles: [],
    })

    expect(plan.missingFiles).toEqual(['skill-shared.png', 'officer-b.png'])
    expect(plan.retainedFiles).toEqual(['officer-a.png'])
    expect(plan.roots).toEqual([
      { root: 'subpkg-assets-0', files: ['officer-a.png'] },
      { root: 'subpkg-assets-1', files: [] },
    ])
  })
})
