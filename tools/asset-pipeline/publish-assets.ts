import { exec, execFile } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import type { CloudBaseCli, CloudBaseUploadInput } from './cloudbase-cli'
import { createCloudBaseCli, normalizeCloudBaseCliCommand } from './cloudbase-cli'
import {
  assetReuseLocationFromPublishedAsset,
  finalizePublishedAssetManifest,
  loadAssetReuseLocations,
  parseCloudBasePublishConfig,
  validatePublishedAssetManifest,
  type AssetReuseLocation,
  type AssetReleasePlan,
  type PublishedAssetManifest,
} from './cloudbase-manifest'
import {
  buildAssetDependencyIndex,
  type AssetDependencyIndex,
} from '../data-pipeline/asset-dependencies'
import type { CanonicalSkill } from '../import/types'
import { loadCanonicalOfficers } from '../data-pipeline/load-officers'
import { loadSkillIconOverrides } from './source-skill-icons'
import { buildAssetReleasePlan } from './cloudbase-manifest'

export interface PublishAssetReleaseInput {
  plan: AssetReleasePlan
  cli: CloudBaseCli
  verifyAsset?: (asset: AssetReleasePlan['assets'][number]) => Promise<void>
  reusedAssets?: ReadonlyMap<string, AssetReuseLocation>
}

export const ASSET_PUBLISH_CONCURRENCY = 8

const runWithConcurrency = async <T>(
  items: readonly T[],
  worker: (item: T) => Promise<void>,
  concurrency: number,
): Promise<void> => {
  let cursor = 0
  const runWorker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      await worker(items[index]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()))
}

export const publishAssetRelease = async ({
  plan,
  cli,
  verifyAsset,
  reusedAssets = new Map(),
}: PublishAssetReleaseInput): Promise<PublishedAssetManifest> => {
  await cli.assertPublicReadAdminWrite?.()
  const fileIDs: Record<string, string> = {}
  const reusedPlanAssets = plan.assets.filter((asset) => {
    const reused = reusedAssets.get(asset.filename)
    if (
      !reused ||
      reused.cloudPath !== asset.cloudPath ||
      reused.publicUrl !== asset.publicUrl ||
      reused.releaseId !== asset.releaseId
    ) {
      return false
    }
    fileIDs[asset.filename] = reused.fileID
    return true
  })
  const reusedFilenames = new Set(reusedPlanAssets.map((asset) => asset.filename))
  const assetsToUpload = plan.assets.filter((asset) => !reusedFilenames.has(asset.filename))

  if (
    assetsToUpload.length > 0 &&
    cli.uploadDirectory &&
    cli.fileIDFor &&
    cli.assertCloudPrefixAbsent
  ) {
    const stageDirectory = mkdtempSync(join(tmpdir(), 'uwo-cloudbase-assets-'))
    try {
      for (const asset of assetsToUpload) {
        copyFileSync(
          resolve(plan.assetRoot, asset.sourcePath),
          join(stageDirectory, asset.filename),
        )
      }
      const cloudPathPrefix = `${plan.cloudPathPrefix}/${plan.releaseId}`
      await cli.assertCloudPrefixAbsent(cloudPathPrefix)
      await cli.uploadDirectory({ sourceDirectory: stageDirectory, cloudPath: cloudPathPrefix })
      await runWithConcurrency(
        assetsToUpload,
        async (asset) => {
          fileIDs[asset.filename] = await cli.fileIDFor!(asset.cloudPath)
          await verifyAsset?.(asset)
        },
        ASSET_PUBLISH_CONCURRENCY,
      )
    } finally {
      rmSync(stageDirectory, { recursive: true, force: true })
    }
  } else {
    await runWithConcurrency(
      assetsToUpload,
      async (asset) => {
        const upload: CloudBaseUploadInput = {
          sourcePath: resolve(plan.assetRoot, asset.sourcePath),
          cloudPath: asset.cloudPath,
          contentType: asset.contentType,
          cacheControl: plan.cacheControl,
        }
        const result = await cli.upload(upload)
        fileIDs[asset.filename] = result.fileID
        await verifyAsset?.(asset)
      },
      ASSET_PUBLISH_CONCURRENCY,
    )
  }
  return finalizePublishedAssetManifest(plan, fileIDs)
}

export const writePublishedAssetManifest = (
  path: string,
  manifest: PublishedAssetManifest,
): void => {
  validatePublishedAssetManifest(manifest)
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)
}

export const loadPublishedAssetManifest = (path: string): PublishedAssetManifest => {
  if (!existsSync(path)) {
    throw new Error(`Published CloudBase asset manifest is missing: ${path}`)
  }
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as PublishedAssetManifest
  validatePublishedAssetManifest(manifest)
  return manifest
}

export interface PublicAssetCheckResult {
  status: number
  contentType: string
  cacheControl: string
}

export type PublicAssetRequest = (url: string) => Promise<PublicAssetCheckResult>

const defaultPublicAssetRequest: PublicAssetRequest = async (url) => {
  const response = await fetch(url, { method: 'HEAD' })
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    cacheControl: response.headers.get('cache-control') ?? '',
  }
}

export const verifyPublicAsset = async (
  asset: AssetReleasePlan['assets'][number],
  request: PublicAssetRequest = defaultPublicAssetRequest,
): Promise<void> => {
  let result: PublicAssetCheckResult | undefined
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      result = await request(asset.publicUrl)
      break
    } catch (error) {
      if (attempt === 2) throw error
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
    }
  }
  if (!result)
    throw new Error(`CloudBase public URL check returned no response: ${asset.publicUrl}`)
  const maxAge = Number(result.cacheControl.match(/max-age=(\d+)/i)?.[1] ?? 0)
  if (result.status !== 200)
    throw new Error(`CloudBase public URL returned HTTP ${result.status}: ${asset.publicUrl}`)
  if (!/^image\/png(?:;|$)/i.test(result.contentType)) {
    throw new Error(
      `CloudBase public URL returned ${result.contentType || 'no content type'}: ${asset.filename}`,
    )
  }
  // CloudBase's default CDN can omit Cache-Control while still serving through
  // its CDN (with X-Cache-Lookup/Age headers). Reject an explicitly shorter
  // policy, but do not reject that valid CloudBase response shape.
  if (result.cacheControl.trim() !== '' && maxAge < 31536000) {
    throw new Error(
      `CloudBase public URL cache-control is shorter than one year: ${asset.filename}`,
    )
  }
}

const execFileAsync = promisify(execFile)
const execAsync = promisify(exec)

const quoteWindowsCommandArg = (value: string): string => {
  if (!/[\s"]/.test(value)) return value
  return `"${value.replace(/"/g, '\\"')}"`
}

const runCloudBaseCommand = async (
  command: string,
  args: readonly string[],
): Promise<{ code: number; stdout: string; stderr: string }> => {
  const invocation = normalizeCloudBaseCliCommand(command)
  try {
    if (invocation.argsPrefix.length > 0) {
      const commandLine = [invocation.executable, ...args].map(quoteWindowsCommandArg).join(' ')
      const result = await execAsync(commandLine, { encoding: 'utf8', windowsHide: true })
      return { code: 0, stdout: result.stdout, stderr: result.stderr }
    }
    const result = await execFileAsync(invocation.command, [...args], { encoding: 'utf8' })
    return { code: 0, stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string }
    return {
      code: typeof failure.code === 'number' ? failure.code : 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? failure.message ?? String(error),
    }
  }
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

const readPublishDependencies = (assetRoot: string): AssetDependencyIndex => {
  const stagedFiles = existsSync(assetRoot)
    ? readdirSync(assetRoot).filter((filename) => filename.toLowerCase().endsWith('.png'))
    : []
  if (stagedFiles.length > 0) {
    return buildAssetDependencyIndex(
      loadCanonicalOfficers('data/master'),
      readJson<CanonicalSkill[]>('data/master/skills.json'),
      {
        assetFilenames: new Set(stagedFiles),
        skillIconOverrides: loadSkillIconOverrides(),
      },
    )
  }
  const source = readFileSync('data/assets/asset-dependencies.json', 'utf8')
  return JSON.parse(source) as AssetDependencyIndex
}

const parsePublishLimit = (value: string | undefined): number | undefined => {
  if (value === undefined || value.trim() === '') return undefined
  const limit = Number(value)
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`CLOUDBASE_ASSET_LIMIT must be a positive integer: ${value}`)
  }
  return limit
}

const run = async (): Promise<void> => {
  const mode = process.argv[2]
  const manifestPath =
    process.env.CLOUDBASE_ASSET_MANIFEST_PATH ?? 'data/assets/cloudbase-manifest.json'
  if (mode === '--check') {
    const manifest = loadPublishedAssetManifest(manifestPath)
    console.log(
      `Validated CloudBase manifest ${manifest.releaseId}: ${manifest.assets.length} assets.`,
    )
    return
  }
  if (mode !== '--publish') {
    throw new Error('Usage: npm run assets:manifest:check or npm run assets:publish')
  }

  const config = parseCloudBasePublishConfig({
    envId: process.env.CLOUDBASE_ENV_ID,
    cdnOrigin: process.env.CLOUDBASE_CDN_ORIGIN,
    contentVersion: process.env.CLOUDBASE_CONTENT_VERSION,
    cloudPathPrefix: process.env.CLOUDBASE_CLOUD_PATH_PREFIX,
    cacheControl: process.env.CLOUDBASE_CACHE_CONTROL,
    cliCommand: process.env.CLOUDBASE_CLI_COMMAND,
  })
  const reusedAssets = new Map<string, AssetReuseLocation>()
  if (existsSync(manifestPath)) {
    const currentManifest = loadPublishedAssetManifest(manifestPath)
    for (const asset of currentManifest.assets) {
      reusedAssets.set(asset.filename, assetReuseLocationFromPublishedAsset(asset))
    }
  }
  const reuseManifestPath =
    process.env.CLOUDBASE_ASSET_REUSE_PATH ?? 'data/assets/cloudbase-reused-skill-icons.json'
  if (existsSync(reuseManifestPath)) {
    for (const [filename, location] of loadAssetReuseLocations(reuseManifestPath)) {
      if (!reusedAssets.has(filename)) reusedAssets.set(filename, location)
    }
  }
  const assetRoot = process.env.CLOUDBASE_ASSET_ROOT ?? 'data/assets/staging'
  const plan = buildAssetReleasePlan({
    dependencies: readPublishDependencies(assetRoot),
    assetRoot,
    config,
    limit: parsePublishLimit(process.env.CLOUDBASE_ASSET_LIMIT),
    reusedAssets,
  })
  const reusedCount = plan.assets.filter((asset) => {
    const reused = reusedAssets.get(asset.filename)
    return reused?.cloudPath === asset.cloudPath && reused.publicUrl === asset.publicUrl
  }).length
  console.log(
    `Asset reuse plan: ${reusedCount} existing assets reused, ${plan.assets.length - reusedCount} assets to upload.`,
  )
  const cli = createCloudBaseCli({
    envId: config.envId,
    command: config.cliCommand,
    run: runCloudBaseCommand,
  })
  const manifest = await publishAssetRelease({
    plan,
    cli,
    verifyAsset: verifyPublicAsset,
    reusedAssets,
  })
  writePublishedAssetManifest(manifestPath, manifest)
  console.log(
    `Published CloudBase release ${manifest.releaseId}: ${manifest.assets.length} assets.`,
  )
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/asset-pipeline/publish-assets.ts')) {
  run().catch((error) => {
    console.error('CloudBase asset operation failed:', error)
    process.exit(1)
  })
}
