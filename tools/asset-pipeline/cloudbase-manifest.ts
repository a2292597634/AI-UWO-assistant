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

/** 已存在於 CloudBase、可直接沿用的資產位置。 */
export interface AssetReuseLocation {
  filename: string
  cloudPath: string
  publicUrl: string
  releaseId: string
  fileID: string
  sha256?: string
  bytes?: number
  contentType?: 'image/png'
  /** 可選的本地來源指紋；不一致時會改走新版本上傳。 */
  sourceSha256?: string
  sourceBytes?: number
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
  reusedAssets?: ReadonlyMap<string, AssetReuseLocation>
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

const assertReuseLocation = (
  location: AssetReuseLocation,
  config: CloudBasePublishConfig,
): void => {
  assertFilename(location.filename)
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(location.releaseId)) {
    throw new Error(`reused asset release ID is invalid: ${location.releaseId}`)
  }
  const expectedCloudPath = `${config.cloudPathPrefix}/${location.releaseId}/${location.filename}`
  if (location.cloudPath !== expectedCloudPath) {
    throw new Error(`reused asset cloud path does not match release: ${location.cloudPath}`)
  }
  if (location.publicUrl !== publicUrlFor(config.cdnOrigin, location.cloudPath)) {
    throw new Error(
      `reused asset public URL is not the configured CloudBase CDN URL: ${location.filename}`,
    )
  }
  if (!/^cloud:\/\/[^?\s]+$/.test(location.fileID)) {
    throw new Error(`reused asset fileID is missing or invalid: ${location.filename}`)
  }
  if (location.sha256 !== undefined && !/^[a-f0-9]{64}$/i.test(location.sha256)) {
    throw new Error(`reused asset sha256 is invalid: ${location.filename}`)
  }
  if (location.bytes !== undefined && (!Number.isInteger(location.bytes) || location.bytes <= 0)) {
    throw new Error(`reused asset bytes is invalid: ${location.filename}`)
  }
  if (location.contentType !== undefined && location.contentType !== 'image/png') {
    throw new Error(`reused asset content type is invalid: ${location.filename}`)
  }
  if (location.sourceSha256 !== undefined && !/^[a-f0-9]{64}$/i.test(location.sourceSha256)) {
    throw new Error(`reused asset source sha256 is invalid: ${location.filename}`)
  }
  if (
    location.sourceBytes !== undefined &&
    (!Number.isInteger(location.sourceBytes) || location.sourceBytes <= 0)
  ) {
    throw new Error(`reused asset source bytes is invalid: ${location.filename}`)
  }
}

export const buildAssetReleasePlan = ({
  dependencies,
  assetRoot,
  config,
  limit,
  reusedAssets,
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

  const effectiveReusedAssets = new Map<string, AssetReuseLocation>()
  for (const asset of localAssets) {
    const reused = reusedAssets?.get(asset.filename)
    if (!reused) continue
    const sourceMatches =
      (reused.sourceSha256 === undefined || reused.sourceSha256 === asset.sha256) &&
      (reused.sourceBytes === undefined || reused.sourceBytes === asset.bytes)
    if (!sourceMatches) continue
    assertReuseLocation(reused, config)
    effectiveReusedAssets.set(asset.filename, reused)
  }

  const effectiveAssets = localAssets.map((asset) => {
    const reused = effectiveReusedAssets.get(asset.filename)
    if (!reused) return asset
    return {
      ...asset,
      ...(reused.sha256 === undefined ? {} : { sha256: reused.sha256 }),
      ...(reused.bytes === undefined ? {} : { bytes: reused.bytes }),
      ...(reused.contentType === undefined ? {} : { contentType: reused.contentType }),
    }
  })
  const manifestDigest = digestFor(effectiveAssets)
  const releaseId = `${config.contentVersion}-${manifestDigest.slice(0, 12)}`
  const assets: AssetReleasePlanAsset[] = localAssets.map((asset, index) => {
    const effectiveAsset = effectiveAssets[index]!
    const reused = effectiveReusedAssets.get(asset.filename)
    if (reused) {
      return {
        ...effectiveAsset,
        cloudPath: reused.cloudPath,
        publicUrl: reused.publicUrl,
        releaseId: reused.releaseId,
        fileID: null,
      }
    }
    const cloudPath = `${config.cloudPathPrefix}/${releaseId}/${asset.filename}`
    return {
      ...effectiveAsset,
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

export const assetReuseLocationFromPublishedAsset = (
  asset: PublishedAsset,
): AssetReuseLocation => ({
  filename: asset.filename,
  cloudPath: asset.cloudPath,
  publicUrl: asset.publicUrl,
  releaseId: asset.releaseId,
  fileID: asset.fileID,
  sha256: asset.sha256,
  bytes: asset.bytes,
  contentType: asset.contentType,
  sourceSha256: asset.sha256,
  sourceBytes: asset.bytes,
})

export const loadAssetReuseLocations = (path: string): Map<string, AssetReuseLocation> => {
  const value = JSON.parse(readFileSync(path, 'utf8')) as unknown
  if (!Array.isArray(value)) throw new Error(`asset reuse manifest must be an array: ${path}`)
  const locations = new Map<string, AssetReuseLocation>()
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`asset reuse manifest contains an invalid entry: ${path}`)
    }
    const record = entry as Record<string, unknown>
    const requiredFields = ['filename', 'cloudPath', 'publicUrl', 'releaseId', 'fileID']
    if (requiredFields.some((field) => typeof record[field] !== 'string')) {
      throw new Error(`asset reuse manifest entry is incomplete: ${path}`)
    }
    const location: AssetReuseLocation = {
      filename: record.filename as string,
      cloudPath: record.cloudPath as string,
      publicUrl: record.publicUrl as string,
      releaseId: record.releaseId as string,
      fileID: record.fileID as string,
      ...(record.sha256 === undefined ? {} : { sha256: record.sha256 as string }),
      ...(record.bytes === undefined ? {} : { bytes: record.bytes as number }),
      ...(record.contentType === undefined
        ? {}
        : { contentType: record.contentType as 'image/png' }),
      ...(record.sourceSha256 === undefined ? {} : { sourceSha256: record.sourceSha256 as string }),
      ...(record.sourceBytes === undefined ? {} : { sourceBytes: record.sourceBytes as number }),
    }
    if (locations.has(location.filename)) {
      throw new Error(`duplicate asset reuse filename: ${location.filename}`)
    }
    locations.set(location.filename, location)
  }
  return locations
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
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(asset.releaseId)) {
      throw new Error(`asset release ID is invalid: ${asset.filename}`)
    }
    if (asset.cloudPath !== `${manifest.cloudPathPrefix}/${asset.releaseId}/${asset.filename}`) {
      throw new Error(`asset cloud path does not match release: ${asset.cloudPath}`)
    }
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
