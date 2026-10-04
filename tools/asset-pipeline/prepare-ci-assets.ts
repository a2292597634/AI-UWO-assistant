import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp, { type Metadata } from 'sharp'
import {
  validatePublishedAssetManifest,
  type PublishedAsset,
  type PublishedAssetManifest,
} from './cloudbase-manifest'

import { CI_ASSET_FILENAMES } from './ci-asset-inputs'
export { CI_ASSET_FILENAMES } from './ci-asset-inputs'

interface PrepareCiAssetsOptions {
  manifest: PublishedAssetManifest
  outputDirectory: string
  fetcher?: typeof fetch
}

const validateContent = async (asset: PublishedAsset, content: Buffer): Promise<void> => {
  if (content.length !== asset.bytes) throw new Error(`${asset.filename}：大小與 manifest 不符`)
  const digest = createHash('sha256').update(content).digest('hex')
  if (digest !== asset.sha256) throw new Error(`${asset.filename}：SHA-256 與 manifest 不符`)
  let metadata: Metadata
  try {
    metadata = await sharp(content).metadata()
    await sharp(content).raw().toBuffer()
  } catch {
    throw new Error(`${asset.filename}：無法解碼為 PNG`)
  }
  if (metadata.format !== 'png') throw new Error(`${asset.filename}：不是 PNG`)
  if (metadata.width !== 64 || metadata.height !== 64) {
    throw new Error(`${asset.filename}：圖片必須為 64×64`)
  }
}

/** 只準備 CI 原有測試所需的已發布圖片；不修改 manifest 或上傳素材。 */
export const prepareCiAssets = async ({
  manifest,
  outputDirectory,
  fetcher = fetch,
}: PrepareCiAssetsOptions): Promise<void> => {
  validatePublishedAssetManifest(manifest)
  const assets = CI_ASSET_FILENAMES.map((filename) => {
    const asset = manifest.assets.find((entry) => entry.filename === filename)
    if (!asset) throw new Error(`manifest 缺少 CI 素材：${filename}`)
    return asset
  })
  const missing: PublishedAsset[] = []
  for (const asset of assets) {
    const path = join(outputDirectory, asset.filename)
    if (existsSync(path)) await validateContent(asset, readFileSync(path))
    else missing.push(asset)
  }

  const downloaded: Array<{ asset: PublishedAsset; content: Buffer }> = []
  for (const asset of missing) {
    // fetch 與讀取 body 共用逾時訊號，拒絕跳轉到 manifest 以外的來源。
    const response = await fetcher(asset.publicUrl, {
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`${asset.filename}：下載失敗 HTTP ${response.status}`)
    const content = Buffer.from(await response.arrayBuffer())
    await validateContent(asset, content)
    downloaded.push({ asset, content })
  }

  // 全部內容驗證成功後才寫入，失敗不留下先前下載的假成功素材。
  if (downloaded.length > 0) mkdirSync(outputDirectory, { recursive: true })
  for (const { asset, content } of downloaded) {
    writeFileSync(join(outputDirectory, asset.filename), content, { flag: 'wx' })
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/asset-pipeline/prepare-ci-assets.ts')) {
  const manifest = JSON.parse(
    readFileSync('data/assets/cloudbase-manifest.json', 'utf8'),
  ) as PublishedAssetManifest
  prepareCiAssets({ manifest, outputDirectory: 'data/assets/staging' }).then(
    () => console.log(`CI 素材準備完成：${CI_ASSET_FILENAMES.length} 張圖片均已校驗。`),
    (error: unknown) => {
      console.error('CI 素材準備失敗：', error)
      process.exitCode = 1
    },
  )
}
