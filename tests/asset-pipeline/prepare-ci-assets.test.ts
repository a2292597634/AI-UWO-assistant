import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildAssetReleasePlan,
  finalizePublishedAssetManifest,
  parseCloudBasePublishConfig,
} from '../../tools/asset-pipeline/cloudbase-manifest'
import type { AssetDependencyIndex } from '../../tools/data-pipeline/asset-dependencies'
import { CI_ASSET_FILENAMES, prepareCiAssets } from '../../tools/asset-pipeline/prepare-ci-assets'

const directories: string[] = []
afterEach(() =>
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })),
)

const fixture = async (content?: Buffer, filenames: readonly string[] = CI_ASSET_FILENAMES) => {
  const directory = mkdtempSync(join(tmpdir(), 'uwo-ci-assets-'))
  directories.push(directory)
  const sourceDirectory = join(directory, 'source')
  const outputDirectory = join(directory, 'staging')
  mkdirSync(sourceDirectory)
  const png =
    content ??
    (await sharp({ create: { width: 64, height: 64, channels: 4, background: '#345678' } })
      .png()
      .toBuffer())
  for (const filename of filenames) writeFileSync(join(sourceDirectory, filename), png)
  const dependencies: AssetDependencyIndex = {
    roots: [{ root: 'assets', name: 'assets', officerIds: [], files: [...filenames] }],
    pathToRoot: {},
    skillIcons: {},
    officerPortraits: {},
    officerCatalogRoots: {},
    officerDetailRoots: {},
    tradeIcons: {},
  }
  const plan = buildAssetReleasePlan({
    dependencies,
    assetRoot: sourceDirectory,
    config: parseCloudBasePublishConfig({
      envId: 'uwo-ci-test',
      cdnOrigin: 'https://uwo-ci-test.tcb.qcloud.la',
      contentVersion: 'ci-test',
    }),
  })
  const manifest = finalizePublishedAssetManifest(
    plan,
    Object.fromEntries(
      plan.assets.map((asset) => [asset.filename, `cloud://uwo-ci-test/${asset.cloudPath}`]),
    ),
  )
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response(new Uint8Array(png)))
  return { directory, outputDirectory, png, manifest, fetcher }
}

describe('CI 已發布素材準備', () => {
  it('乾淨目錄下載三張 manifest 素材並保留原始 bytes', async () => {
    const { outputDirectory, png, manifest, fetcher } = await fixture()
    await prepareCiAssets({ manifest, outputDirectory, fetcher })
    expect(fetcher).toHaveBeenCalledTimes(3)
    for (const asset of manifest.assets) {
      expect(readFileSync(join(outputDirectory, asset.filename))).toEqual(png)
      expect(fetcher).toHaveBeenCalledWith(
        asset.publicUrl,
        expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }),
      )
    }
  })

  it('HTTP 失敗不得寫入任何待下載素材', async () => {
    const { outputDirectory, manifest, fetcher } = await fixture()
    fetcher.mockResolvedValueOnce(new Response(null, { status: 404 }))
    await expect(prepareCiAssets({ manifest, outputDirectory, fetcher })).rejects.toThrow(
      'HTTP 404',
    )
    expect(CI_ASSET_FILENAMES.some((filename) => existsSync(join(outputDirectory, filename)))).toBe(
      false,
    )
  })

  it('第二張失敗時也不落盤第一張', async () => {
    const { outputDirectory, png, manifest, fetcher } = await fixture()
    fetcher
      .mockResolvedValueOnce(new Response(new Uint8Array(png)))
      .mockRejectedValueOnce(new Error('網路逾時'))
    await expect(prepareCiAssets({ manifest, outputDirectory, fetcher })).rejects.toThrow(
      '網路逾時',
    )
    expect(existsSync(outputDirectory)).toBe(false)
  })

  it('拒絕相同大小但 SHA-256 不符的內容', async () => {
    const { outputDirectory, png, manifest, fetcher } = await fixture()
    const changed = Buffer.from(png)
    changed[changed.length - 1] ^= 1
    fetcher.mockResolvedValueOnce(new Response(new Uint8Array(changed)))
    await expect(prepareCiAssets({ manifest, outputDirectory, fetcher })).rejects.toThrow('SHA-256')
    expect(existsSync(outputDirectory)).toBe(false)
  })

  it('拒絕與 manifest 不同大小的內容', async () => {
    const { outputDirectory, manifest, fetcher } = await fixture()
    fetcher.mockResolvedValueOnce(new Response('錯誤頁面'))
    await expect(prepareCiAssets({ manifest, outputDirectory, fetcher })).rejects.toThrow('大小')
    expect(existsSync(outputDirectory)).toBe(false)
  })

  it('即使指紋吻合，仍拒絕不可解碼的 PNG', async () => {
    const { outputDirectory, manifest, fetcher } = await fixture(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )
    await expect(prepareCiAssets({ manifest, outputDirectory, fetcher })).rejects.toThrow('PNG')
    expect(existsSync(outputDirectory)).toBe(false)
  })

  it('拒絕不是 64×64 的已發布圖片', async () => {
    const png = await sharp({
      create: { width: 32, height: 64, channels: 4, background: '#345678' },
    })
      .png()
      .toBuffer()
    const { outputDirectory, manifest, fetcher } = await fixture(png)
    await expect(prepareCiAssets({ manifest, outputDirectory, fetcher })).rejects.toThrow('64×64')
    expect(existsSync(outputDirectory)).toBe(false)
  })

  it('已有相同素材時不下載；不同素材不覆蓋', async () => {
    const { outputDirectory, png, manifest, fetcher } = await fixture()
    mkdirSync(outputDirectory)
    for (const filename of CI_ASSET_FILENAMES) writeFileSync(join(outputDirectory, filename), png)
    await prepareCiAssets({ manifest, outputDirectory, fetcher })
    expect(fetcher).not.toHaveBeenCalled()
    writeFileSync(join(outputDirectory, CI_ASSET_FILENAMES[0]), '本機原素材')
    await expect(prepareCiAssets({ manifest, outputDirectory, fetcher })).rejects.toThrow('大小')
    expect(readFileSync(join(outputDirectory, CI_ASSET_FILENAMES[0]), 'utf8')).toBe('本機原素材')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('manifest 非法時下載前失敗', async () => {
    const { outputDirectory, manifest, fetcher } = await fixture()
    await expect(
      prepareCiAssets({ manifest: { ...manifest, assets: [] }, outputDirectory, fetcher }),
    ).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('結構合法的 manifest 缺少必要圖片時明確失敗', async () => {
    const { outputDirectory, manifest, fetcher } = await fixture(
      undefined,
      CI_ASSET_FILENAMES.slice(0, 2),
    )
    await expect(prepareCiAssets({ manifest, outputDirectory, fetcher })).rejects.toThrow(
      'manifest 缺少 CI 素材',
    )
    expect(fetcher).not.toHaveBeenCalled()
    expect(existsSync(outputDirectory)).toBe(false)
  })
})
