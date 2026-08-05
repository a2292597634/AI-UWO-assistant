import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import type { AssetDependencyIndex } from '../data-pipeline/asset-dependencies'
import {
  parseCloudBasePublishConfig,
  assertCloudBaseCdnOrigin,
  type CloudBasePublishConfig,
  type CloudBasePublishConfigInput,
} from './cloudbase-config'

export { parseCloudBasePublishConfig }
export { assertCloudBaseCdnOrigin }
export type { CloudBasePublishConfig, CloudBasePublishConfigInput }

export interface AssetReleasePlanAsset {
  sourcePath: string
  filename: string
  cloudPath: string
  publicUrl: string
  sha256: string
  bytes: number
  contentType: 'image/png'
  releaseId: string
  fileID: null
}

export interface PublishedAsset extends Omit<AssetReleasePlanAsset, 'fileID'> {
  fileID: string
}

export interface AssetReleasePlan {
  assetRoot: string
  releaseId: string
  manifestDigest: string
  contentVersion: string
  cdnOrigin: string
  cloudPathPrefix: string
  cacheControl: string
  assets: AssetReleasePlanAsset[]
}

export interface PublishedAssetManifest extends Omit<AssetReleasePlan, 'assetRoot' | 'assets'> {
  assets: PublishedAsset[]
}

interface AssetReleasePlanInput {
  dependencies: AssetDependencyIndex
  assetRoot: string
  config: CloudBasePublishConfig
  limit?: number
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

const toPosix = (path: string): string => path.replace(/\\/g, '/')

const assertFilename = (filename: string): void => {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*\.png$/i.test(filename) || filename.includes('..')) {
    throw new Error(`asset filename is invalid: ${filename}`)
  }
}

const publicUrlFor = (origin: string, cloudPath: string): string =>
  `${origin}/${cloudPath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')}`

const digestFor = (
  assets: readonly Pick<AssetReleasePlanAsset, 'filename' | 'sha256' | 'bytes' | 'contentType'>[],
): string =>
  createHash('sha256')
    .update(
      assets
        .map((asset) =>
          JSON.stringify({
            filename: asset.filename,
            sha256: asset.sha256,
            bytes: asset.bytes,
            contentType: asset.contentType,
          }),
        )
        .join('\n'),
    )
    .digest('hex')

const isPng = (content: Buffer): boolean =>
  content.length >= PNG_SIGNATURE.length &&
  PNG_SIGNATURE.equals(content.subarray(0, PNG_SIGNATURE.length))

export const buildAssetReleasePlan = ({
  dependencies,
  assetRoot,
  config,
  limit,
}: AssetReleasePlanInput): AssetReleasePlan => {
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error(`asset publish limit must be a positive integer: ${limit}`)
  }
  const rootDirectory = resolve(assetRoot)
  const seen = new Set<string>()
  const localAssets: Array<
    Pick<AssetReleasePlanAsset, 'sourcePath' | 'filename' | 'sha256' | 'bytes' | 'contentType'>
  > = []

  for (const root of dependencies.roots) {
    for (const filename of root.files) {
      if (seen.has(filename)) continue
      if (limit !== undefined && localAssets.length >= limit) break
      seen.add(filename)
      assertFilename(filename)
      const candidates = [
        join(rootDirectory, root.root, 'imgs', filename),
        join(rootDirectory, 'assets', filename),
        join(rootDirectory, filename),
      ]
      const localPath = candidates.find(
        (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
      )
      if (!localPath) {
        throw new Error(
          `missing referenced PNG: ${toPosix(relative(rootDirectory, candidates[0]!))}`,
        )
      }
      const content = readFileSync(localPath)
      if (!isPng(content)) throw new Error(`referenced asset is not a PNG: ${filename}`)
      localAssets.push({
        sourcePath: toPosix(relative(rootDirectory, localPath)),
        filename,
        sha256: createHash('sha256').update(content).digest('hex'),
        bytes: content.byteLength,
        contentType: 'image/png',
      })
    }
  }

  const manifestDigest = digestFor(localAssets)
  const releaseId = `${config.contentVersion}-${manifestDigest.slice(0, 12)}`
  const assets: AssetReleasePlanAsset[] = localAssets.map((asset) => {
    const cloudPath = `${config.cloudPathPrefix}/${releaseId}/${asset.filename}`
    return {
      ...asset,
      cloudPath,
      publicUrl: publicUrlFor(config.cdnOrigin, cloudPath),
      releaseId,
      fileID: null,
    }
  })

  return {
    assetRoot: rootDirectory,
    releaseId,
    manifestDigest,
    contentVersion: config.contentVersion,
    cdnOrigin: config.cdnOrigin,
    cloudPathPrefix: config.cloudPathPrefix,
    cacheControl: config.cacheControl,
    assets,
  }
}

export const finalizePublishedAssetManifest = (
  plan: AssetReleasePlan,
  fileIDs: Readonly<Record<string, string>>,
): PublishedAssetManifest => {
  const assets: PublishedAsset[] = plan.assets.map((asset) => ({
    ...asset,
    fileID: fileIDs[asset.filename] ?? '',
  }))
  const { assetRoot: _assetRoot, ...publishedPlan } = plan
  const manifest: PublishedAssetManifest = { ...publishedPlan, assets }
  validatePublishedAssetManifest(manifest)
  return manifest
}

export const validatePublishedAssetManifest = (manifest: PublishedAssetManifest): void => {
  assertCloudBaseCdnOrigin(manifest.cdnOrigin)
  const expectedDigest = digestFor(manifest.assets)
  if (expectedDigest !== manifest.manifestDigest) {
    throw new Error(`asset manifest digest mismatch for release ${manifest.releaseId}`)
  }
  if (manifest.releaseId !== `${manifest.contentVersion}-${manifest.manifestDigest.slice(0, 12)}`) {
    throw new Error(`asset manifest release ID mismatch: ${manifest.releaseId}`)
  }
  if (manifest.assets.length === 0)
    throw new Error('asset manifest must contain at least one asset')

  const filenames = new Set<string>()
  const cloudPaths = new Set<string>()
  for (const asset of manifest.assets) {
    assertFilename(asset.filename)
    if (filenames.has(asset.filename))
      throw new Error(`duplicate asset filename: ${asset.filename}`)
    filenames.add(asset.filename)
    if (cloudPaths.has(asset.cloudPath)) throw new Error(`duplicate cloud path: ${asset.cloudPath}`)
    cloudPaths.add(asset.cloudPath)
    if (asset.cloudPath !== `${manifest.cloudPathPrefix}/${manifest.releaseId}/${asset.filename}`) {
      throw new Error(`asset cloud path does not match release: ${asset.cloudPath}`)
    }
    if (asset.releaseId !== manifest.releaseId)
      throw new Error(`asset release ID mismatch: ${asset.filename}`)
    if (!/^cloud:\/\/[^?\s]+$/.test(asset.fileID))
      throw new Error(`asset fileID is missing or invalid: ${asset.filename}`)
    if (!/^[a-f0-9]{64}$/i.test(asset.sha256))
      throw new Error(`asset sha256 is invalid: ${asset.filename}`)
    if (!Number.isInteger(asset.bytes) || asset.bytes <= 0)
      throw new Error(`asset bytes is invalid: ${asset.filename}`)
    if (asset.contentType !== 'image/png')
      throw new Error(`asset content type is invalid: ${asset.filename}`)
    const url = new URL(asset.publicUrl)
    const expectedUrl = publicUrlFor(manifest.cdnOrigin, asset.cloudPath)
    if (url.protocol !== 'https:' || url.search || url.hash || asset.publicUrl !== expectedUrl) {
      throw new Error(`asset publicUrl is not the configured CloudBase CDN URL: ${asset.filename}`)
    }
  }
}
