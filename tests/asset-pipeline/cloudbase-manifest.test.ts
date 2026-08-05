import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AssetDependencyIndex } from '../../tools/data-pipeline/asset-dependencies'
import {
  buildAssetReleasePlan,
  finalizePublishedAssetManifest,
  parseCloudBasePublishConfig,
  validatePublishedAssetManifest,
} from '../../tools/asset-pipeline/cloudbase-manifest'

const PNG_HEADER = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

const dependencies = (): AssetDependencyIndex => ({
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
      files: ['officer-b.png'],
    },
  ],
  pathToRoot: {},
  skillIcons: {},
  officerPortraits: {},
  officerCatalogRoots: {},
  officerDetailRoots: {},
})

const config = () =>
  parseCloudBasePublishConfig({
    envId: 'uwo-prod-123',
    cdnOrigin: 'https://uwo-prod-123.tcb.qcloud.la',
    contentVersion: '1.0.0',
  })

const writeAssets = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'uwo-cloudbase-'))
  for (const assetRoot of ['subpkg-assets-0', 'subpkg-assets-1']) {
    mkdirSync(join(root, assetRoot, 'imgs'), { recursive: true })
  }
  writeFileSync(
    join(root, 'subpkg-assets-0', 'imgs', 'officer-a.png'),
    Buffer.concat([PNG_HEADER, Buffer.from('a')]),
  )
  writeFileSync(
    join(root, 'subpkg-assets-0', 'imgs', 'skill-shared.png'),
    Buffer.concat([PNG_HEADER, Buffer.from('shared')]),
  )
  writeFileSync(
    join(root, 'subpkg-assets-1', 'imgs', 'officer-b.png'),
    Buffer.concat([PNG_HEADER, Buffer.from('b')]),
  )
  return root
}

describe('CloudBase asset manifest', () => {
  it('builds a deterministic release plan with versioned paths and one CDN origin', () => {
    const assetRoot = writeAssets()
    try {
      const first = buildAssetReleasePlan({
        dependencies: dependencies(),
        assetRoot,
        config: config(),
      })
      const second = buildAssetReleasePlan({
        dependencies: dependencies(),
        assetRoot,
        config: config(),
      })

      expect(first).toEqual(second)
      expect(first.assets.map((asset) => asset.filename)).toEqual([
        'officer-a.png',
        'skill-shared.png',
        'officer-b.png',
      ])
      expect(first.assets.every((asset) => asset.contentType === 'image/png')).toBe(true)
      expect(
        first.assets.every((asset) => asset.cloudPath.startsWith(`assets/${first.releaseId}/`)),
      ).toBe(true)
      expect(
        first.assets.every((asset) =>
          asset.publicUrl.startsWith(`${config().cdnOrigin}/assets/${first.releaseId}/`),
        ),
      ).toBe(true)
      expect(first.assets[0]).toMatchObject({
        fileID: null,
        bytes: PNG_HEADER.length + 1,
        sourcePath: 'subpkg-assets-0/imgs/officer-a.png',
      })
    } finally {
      rmSync(assetRoot, { recursive: true, force: true })
    }
  })

  it('changes release identity when a referenced PNG changes', () => {
    const assetRoot = writeAssets()
    try {
      const before = buildAssetReleasePlan({
        dependencies: dependencies(),
        assetRoot,
        config: config(),
      })
      writeFileSync(
        join(assetRoot, 'subpkg-assets-0', 'imgs', 'officer-a.png'),
        Buffer.concat([PNG_HEADER, Buffer.from('changed')]),
      )
      const after = buildAssetReleasePlan({
        dependencies: dependencies(),
        assetRoot,
        config: config(),
      })

      expect(after.releaseId).not.toBe(before.releaseId)
      expect(after.assets[0]?.sha256).not.toBe(before.assets[0]?.sha256)
    } finally {
      rmSync(assetRoot, { recursive: true, force: true })
    }
  })

  it('publishes referenced files from the flat build asset directory', () => {
    const assetRoot = mkdtempSync(join(tmpdir(), 'uwo-cloudbase-flat-'))
    try {
      mkdirSync(join(assetRoot, 'assets'), { recursive: true })
      writeFileSync(
        join(assetRoot, 'assets', 'officer-a.png'),
        Buffer.concat([PNG_HEADER, Buffer.from('flat')]),
      )
      writeFileSync(
        join(assetRoot, 'assets', 'skill-shared.png'),
        Buffer.concat([PNG_HEADER, Buffer.from('flat-skill')]),
      )
      writeFileSync(
        join(assetRoot, 'assets', 'officer-b.png'),
        Buffer.concat([PNG_HEADER, Buffer.from('flat-b')]),
      )
      const plan = buildAssetReleasePlan({
        dependencies: dependencies(),
        assetRoot,
        config: config(),
      })
      expect(plan.assets[0]!.sourcePath).toBe('assets/officer-a.png')
    } finally {
      rmSync(assetRoot, { recursive: true, force: true })
    }
  })

  it('can constrain a real publish smoke test without changing dependency ownership', () => {
    const assetRoot = writeAssets()
    try {
      const plan = buildAssetReleasePlan({
        dependencies: dependencies(),
        assetRoot,
        config: config(),
        limit: 1,
      })
      expect(plan.assets).toHaveLength(1)
      expect(plan.assets[0]!.filename).toBe('officer-a.png')
    } finally {
      rmSync(assetRoot, { recursive: true, force: true })
    }
  })

  it('rejects non-CloudBase origins, URL queries and missing published file IDs', () => {
    expect(() =>
      parseCloudBasePublishConfig({
        envId: 'uwo-prod-123',
        cdnOrigin: 'https://cdn.example.com',
        contentVersion: '1.0.0',
      }),
    ).toThrow(/CloudBase CDN origin/)
    expect(() =>
      parseCloudBasePublishConfig({
        envId: 'uwo-prod-123',
        cdnOrigin: 'https://uwo-prod-123.tcb.qcloud.la/?token=bad',
        contentVersion: '1.0.0',
      }),
    ).toThrow(/query|fragment|path/i)

    const assetRoot = writeAssets()
    try {
      const baseDependencies = dependencies()
      const plan = buildAssetReleasePlan({
        dependencies: {
          ...baseDependencies,
          roots: [
            {
              ...baseDependencies.roots[0]!,
              files: ['officer-a.png'],
            },
          ],
        },
        assetRoot,
        config: config(),
      })
      expect(() => finalizePublishedAssetManifest(plan, {})).toThrow(/fileID/)
      expect(() =>
        validatePublishedAssetManifest(
          finalizePublishedAssetManifest(plan, {
            'officer-a.png': `cloud://uwo-prod-123/${plan.assets[0]!.cloudPath}`,
          }),
        ),
      ).not.toThrow()
      const validManifest = finalizePublishedAssetManifest(plan, {
        'officer-a.png': `cloud://uwo-prod-123/${plan.assets[0]!.cloudPath}`,
      })
      expect(() =>
        validatePublishedAssetManifest({
          ...validManifest,
          cdnOrigin: 'https://cdn.example.com',
        }),
      ).toThrow(/CloudBase CDN origin/)
    } finally {
      rmSync(assetRoot, { recursive: true, force: true })
    }
  })
})
