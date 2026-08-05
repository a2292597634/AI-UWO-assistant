import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AssetDependencyIndex } from '../../tools/data-pipeline/asset-dependencies'
import { buildAssetReleasePlan } from '../../tools/asset-pipeline/cloudbase-manifest'
import {
  loadPublishedAssetManifest,
  publishAssetRelease,
  verifyPublicAsset,
  writePublishedAssetManifest,
} from '../../tools/asset-pipeline/publish-assets'

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1])

const dependencies = (): AssetDependencyIndex => ({
  roots: [
    {
      root: 'subpkg-assets-0',
      name: 'assetsCatalog0',
      officerIds: ['officer-a'],
      files: ['officer-a.png'],
    },
  ],
  pathToRoot: {},
  skillIcons: {},
  officerPortraits: {},
  officerCatalogRoots: {},
  officerDetailRoots: {},
})

const setup = (): { root: string; plan: ReturnType<typeof buildAssetReleasePlan> } => {
  const root = mkdtempSync(join(tmpdir(), 'uwo-publish-'))
  mkdirSync(join(root, 'subpkg-assets-0', 'imgs'), { recursive: true })
  writeFileSync(join(root, 'subpkg-assets-0', 'imgs', 'officer-a.png'), PNG)
  const plan = buildAssetReleasePlan({
    dependencies: dependencies(),
    assetRoot: root,
    config: {
      envId: 'uwo-prod-123',
      cdnOrigin: 'https://uwo-prod-123.tcb.qcloud.la',
      contentVersion: '1.0.0',
      cloudPathPrefix: 'assets',
      cacheControl: 'public, max-age=31536000, immutable',
      cliCommand: 'tcb',
    },
  })
  return { root, plan }
}

describe('CloudBase asset publishing', () => {
  it('uploads only the deterministic plan and writes a validated manifest', async () => {
    const { root, plan } = setup()
    try {
      const uploads: Array<Record<string, string>> = []
      const manifest = await publishAssetRelease({
        plan,
        cli: {
          upload: async (input) => {
            uploads.push({ ...input })
            return { fileID: `cloud://uwo-prod-123/${input.cloudPath}` }
          },
        },
      })

      expect(uploads).toEqual([
        {
          sourcePath: join(root, 'subpkg-assets-0', 'imgs', 'officer-a.png'),
          cloudPath: plan.assets[0]!.cloudPath,
          contentType: 'image/png',
          cacheControl: 'public, max-age=31536000, immutable',
        },
      ])
      expect(manifest.assets[0]!.fileID).toBe(`cloud://uwo-prod-123/${plan.assets[0]!.cloudPath}`)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not return a manifest after an upload failure', async () => {
    const { root, plan } = setup()
    try {
      await expect(
        publishAssetRelease({
          plan,
          cli: {
            upload: async () => {
              throw new Error('permission denied')
            },
          },
        }),
      ).rejects.toThrow('permission denied')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not return a manifest when a published URL fails response validation', async () => {
    const { root, plan } = setup()
    try {
      await expect(
        publishAssetRelease({
          plan,
          cli: {
            assertPublicReadAdminWrite: async () => undefined,
            upload: async (input) => ({ fileID: `cloud://uwo-prod-123/${input.cloudPath}` }),
          },
          verifyAsset: async () => {
            throw new Error('CDN returned image/jpeg')
          },
        }),
      ).rejects.toThrow(/image\/jpeg/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('uploads independent assets with bounded parallelism while preserving manifest order', async () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-publish-parallel-'))
    try {
      mkdirSync(join(root, 'subpkg-assets-0', 'imgs'), { recursive: true })
      writeFileSync(join(root, 'subpkg-assets-0', 'imgs', 'officer-a.png'), PNG)
      writeFileSync(join(root, 'subpkg-assets-0', 'imgs', 'officer-b.png'), PNG)
      const plan = buildAssetReleasePlan({
        dependencies: {
          ...dependencies(),
          roots: [
            {
              ...dependencies().roots[0]!,
              files: ['officer-a.png', 'officer-b.png'],
            },
          ],
        },
        assetRoot: root,
        config: {
          envId: 'uwo-prod-123',
          cdnOrigin: 'https://uwo-prod-123.tcb.qcloud.la',
          contentVersion: '1.0.0',
          cloudPathPrefix: 'assets',
          cacheControl: 'public, max-age=31536000, immutable',
          cliCommand: 'tcb',
        },
      })
      let active = 0
      let maximumActive = 0
      const uploaded: string[] = []
      const manifest = await publishAssetRelease({
        plan,
        cli: {
          upload: async (input) => {
            active += 1
            maximumActive = Math.max(maximumActive, active)
            await new Promise((resolve) => setTimeout(resolve, 10))
            uploaded.push(input.cloudPath)
            active -= 1
            return { fileID: `cloud://uwo-prod-123/${input.cloudPath}` }
          },
        },
      })

      expect(maximumActive).toBeGreaterThan(1)
      expect(manifest.assets.map((asset) => asset.filename)).toEqual([
        'officer-a.png',
        'officer-b.png',
      ])
      expect(uploaded).toHaveLength(2)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('requires a public PNG response with a long cache lifetime', async () => {
    const { root, plan } = setup()
    try {
      await expect(
        verifyPublicAsset(plan.assets[0]!, async () => ({
          status: 200,
          contentType: 'image/png',
          cacheControl: 'public, max-age=60',
        })),
      ).rejects.toThrow(/one year/)
      await expect(
        verifyPublicAsset(plan.assets[0]!, async () => ({
          status: 200,
          contentType: 'image/png',
          cacheControl: 'public, max-age=31536000, immutable',
        })),
      ).resolves.toBeUndefined()
      await expect(
        verifyPublicAsset(plan.assets[0]!, async () => ({
          status: 200,
          contentType: 'image/png',
          cacheControl: '',
        })),
      ).resolves.toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('retries transient public URL connection failures a limited number of times', async () => {
    const { root, plan } = setup()
    let attempts = 0
    try {
      await expect(
        verifyPublicAsset(plan.assets[0]!, async () => {
          attempts += 1
          if (attempts === 1) throw new Error('temporary connection timeout')
          return { status: 200, contentType: 'image/png', cacheControl: '' }
        }),
      ).resolves.toBeUndefined()
      expect(attempts).toBe(2)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('round-trips a manifest with stable JSON output', async () => {
    const { root, plan } = setup()
    const manifestPath = join(root, 'cloudbase-manifest.json')
    try {
      const manifest = await publishAssetRelease({
        plan,
        cli: {
          upload: async (input) => ({ fileID: `cloud://uwo-prod-123/${input.cloudPath}` }),
        },
      })
      writePublishedAssetManifest(manifestPath, manifest)
      const first = await loadPublishedAssetManifest(manifestPath)
      writePublishedAssetManifest(manifestPath, first)
      const second = await loadPublishedAssetManifest(manifestPath)
      expect(second).toEqual(first)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
