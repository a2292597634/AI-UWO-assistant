/**
 * CloudBase 已審核航海士同步工具。
 *
 * 預設只讀取 approved 投稿、下載頭像並更新本地 master；只有明確提供
 * --mark-published --dataset-version 時，才會回寫 CloudBase 的 published 狀態。
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { assertPortraitHasTransparency } from './asset-pipeline/portrait-transparency'

export const MAX_PORTRAIT_BYTES = 512 * 1024
export const MAX_PORTRAIT_EDGE = 512

export interface SyncSubmissionRecord {
  submissionId: string
  revision: number
  status: string
  updatedAt?: string
  canonicalData?: Record<string, unknown> | null
  formData?: Record<string, unknown>
}

export type CloudFunctionInvoker = (payload: Record<string, unknown>) => Promise<unknown> | unknown

export interface ApprovedPortraitDownload {
  submissionId: string
  revision: number
  path: string
  byteSize: number
  width: number
  height: number
}

export interface DownloadApprovedPortraitOptions {
  invoke?: CloudFunctionInvoker
  fetcher?: (url: string) => Promise<{
    ok?: boolean
    status?: number
    arrayBuffer(): Promise<ArrayBuffer>
  }>
  outputDir?: string
}

export interface RunSyncInput {
  syncToken?: string
  approved?: SyncSubmissionRecord[]
  existing?: Record<string, unknown>[]
  outputFile?: string
  stagingDir?: string
  invoke?: CloudFunctionInvoker
  markPublished?:
    | string
    | ((
        submissionId: string,
        revision: number,
        datasetVersion: string,
      ) => Promise<unknown> | unknown)
  markPublishedAction?: (
    submissionId: string,
    revision: number,
    datasetVersion: string,
  ) => Promise<unknown> | unknown
  datasetVersion?: string
}

export interface RunSyncResult {
  approved: SyncSubmissionRecord[]
  customOfficers: Record<string, unknown>[]
  downloaded: ApprovedPortraitDownload[]
  published: string[]
}

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)))
const MASTER_DIR = resolve(PROJECT_ROOT, '..', 'data', 'master')
const OUTPUT_FILE = resolve(MASTER_DIR, 'custom-officers.json')
const STAGING_DIR = resolve(PROJECT_ROOT, '..', 'data', 'assets', 'staging')

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asNonEmptyString = (value: unknown): string =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''

const asRevision = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0

const defaultInvoke: CloudFunctionInvoker = (payload) => {
  const output = execFileSync(
    'tcb',
    ['fn', 'invoke', 'officer-custom', '--params', JSON.stringify(payload)],
    {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      windowsHide: true,
    },
  )
  return JSON.parse(output)
}

const invoke = (runner: CloudFunctionInvoker | undefined, payload: Record<string, unknown>) =>
  (runner ?? defaultInvoke)(payload)

const cloudData = (response: unknown, action: string): unknown => {
  if (!isRecord(response) || response.ok !== true) {
    const message = isRecord(response) ? asNonEmptyString(response.message) : ''
    throw new Error(`${action} failed${message ? `: ${message}` : ''}`)
  }
  return response.data
}

const parseApprovedRecords = (value: unknown): SyncSubmissionRecord[] => {
  if (!Array.isArray(value)) throw new Error('listApprovedForSync returned an invalid list')
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`approved record ${index} is invalid`)
    const submissionId = asNonEmptyString(item.submissionId)
    const revision = asRevision(item.revision)
    if (!submissionId || revision === 0) {
      throw new Error(`approved record ${index} has invalid submissionId or revision`)
    }
    return item as unknown as SyncSubmissionRecord
  })
}

/** 從服務端取得最新 approved revision；不接受前端或本地狀態代替服務端結果。 */
export const fetchApprovedSubmissions = async (
  syncToken: string,
  runner?: CloudFunctionInvoker,
): Promise<SyncSubmissionRecord[]> => {
  if (!asNonEmptyString(syncToken)) throw new Error('缺少 OFFICER_SYNC_TOKEN')
  const response = await invoke(runner, {
    action: 'listApprovedForSync',
    syncToken,
  })
  const data = cloudData(response, 'listApprovedForSync')
  if (isRecord(data) && Array.isArray(data.records)) return parseApprovedRecords(data.records)
  return parseApprovedRecords(data)
}

const canonicalSubmissionId = (record: Record<string, unknown>): string => {
  const sourceRefs = record.sourceRefs
  if (
    !isRecord(sourceRefs) ||
    Object.keys(sourceRefs).length !== 1 ||
    typeof sourceRefs.submissionId !== 'string' ||
    sourceRefs.submissionId.length === 0
  ) {
    return ''
  }
  return sourceRefs.submissionId
}

const canonicalFromApproved = (record: SyncSubmissionRecord): Record<string, unknown> => {
  if (record.status !== 'approved') throw new Error('只有 approved 投稿可以同步')
  const submissionId = asNonEmptyString(record.submissionId)
  const revision = asRevision(record.revision)
  if (!submissionId || revision === 0 || !isRecord(record.canonicalData)) {
    throw new Error(`approved 投稿 ${submissionId || '(unknown)'} 缺少 Canonical 資料`)
  }
  const id = asNonEmptyString(record.canonicalData.id)
  if (!/^officer_custom_[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`approved 投稿 ${submissionId} 的 Canonical ID 無效`)
  }
  return {
    ...record.canonicalData,
    sourceRefs: { submissionId },
  }
}

const compareRecord = (left: SyncSubmissionRecord, right: SyncSubmissionRecord): number => {
  const revisionDifference = asRevision(left.revision) - asRevision(right.revision)
  if (revisionDifference !== 0) return revisionDifference
  const leftUpdatedAt = asNonEmptyString(left.updatedAt)
  const rightUpdatedAt = asNonEmptyString(right.updatedAt)
  if (leftUpdatedAt !== rightUpdatedAt) return leftUpdatedAt < rightUpdatedAt ? -1 : 1
  return JSON.stringify(left).localeCompare(JSON.stringify(right))
}

const latestApprovedRecords = (
  records: readonly SyncSubmissionRecord[],
): SyncSubmissionRecord[] => {
  const latest = new Map<string, SyncSubmissionRecord>()
  for (const record of records) {
    if (record.status !== 'approved') continue
    const submissionId = asNonEmptyString(record.submissionId)
    if (!submissionId || asRevision(record.revision) === 0) {
      throw new Error('approved 投稿的 submissionId 或 revision 無效')
    }
    const current = latest.get(submissionId)
    if (!current || compareRecord(current, record) < 0) latest.set(submissionId, record)
  }
  return [...latest.values()].sort((left, right) =>
    left.submissionId.localeCompare(right.submissionId),
  )
}

const existingCustomMap = (
  existing: readonly Record<string, unknown>[],
): Map<string, Record<string, unknown>> => {
  const result = new Map<string, Record<string, unknown>>()
  for (const [index, record] of existing.entries()) {
    if (!isRecord(record)) throw new Error(`existing custom officer ${index} is invalid`)
    if ('status' in record && record.status !== 'published') continue
    const submissionId = canonicalSubmissionId(record)
    const id = asNonEmptyString(record.id)
    if (!submissionId || !/^officer_custom_[A-Za-z0-9_-]+$/.test(id)) {
      throw new Error(`existing custom officer ${index} has invalid sourceRefs or ID`)
    }
    result.set(submissionId, record)
  }
  return result
}

/** 將 approved Canonical 資料按 submissionId 確定性輸出，排除 pending/rejected。 */
export const buildCustomOfficerMaster = (
  records: readonly SyncSubmissionRecord[],
  existing: readonly Record<string, unknown>[] = [],
): Record<string, unknown>[] => {
  const bySubmissionId = existingCustomMap(existing)
  for (const record of latestApprovedRecords(records)) {
    const canonical = canonicalFromApproved(record)
    bySubmissionId.set(record.submissionId, canonical)
  }
  return [...bySubmissionId.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, record]) => record)
}

/** 下載 CloudBase 臨時 URL 並轉成資產流水線使用的 PNG。 */
export const downloadApprovedPortrait = async (
  record: SyncSubmissionRecord,
  syncToken: string,
  options: DownloadApprovedPortraitOptions = {},
): Promise<ApprovedPortraitDownload> => {
  const submissionId = asNonEmptyString(record.submissionId)
  const revision = asRevision(record.revision)
  const canonicalId = isRecord(record.canonicalData)
    ? asNonEmptyString(record.canonicalData.id)
    : ''
  if (record.status !== 'approved' || !submissionId || revision === 0 || !canonicalId) {
    throw new Error('只能下載完整的 approved 投稿頭像')
  }
  if (!/^officer_custom_[A-Za-z0-9_-]+$/.test(canonicalId)) {
    throw new Error(`投稿 ${submissionId} 的 Canonical ID 無效`)
  }

  const response = await invoke(options.invoke, {
    action: 'getPortraitDownloadUrl',
    syncToken,
    submissionId,
    revision,
  })
  const data = cloudData(response, 'getPortraitDownloadUrl')
  const url = isRecord(data) ? asNonEmptyString(data.tempFileURL) : ''
  if (!url) throw new Error(`投稿 ${submissionId} 缺少頭像下載地址`)

  const fetcher = options.fetcher ?? (async (target: string) => fetch(target))
  const imageResponse = await fetcher(url)
  if (
    imageResponse.ok === false ||
    (imageResponse.status !== undefined && imageResponse.status !== 200)
  ) {
    throw new Error(`投稿 ${submissionId} 頭像下載失敗`)
  }
  const input = Buffer.from(await imageResponse.arrayBuffer())
  const inputMetadata = await sharp(input).metadata()
  const inputWidth = inputMetadata.width ?? 0
  const inputHeight = inputMetadata.height ?? 0
  if (!inputWidth || !inputHeight || Math.max(inputWidth, inputHeight) > MAX_PORTRAIT_EDGE) {
    throw new Error(`投稿 ${submissionId} 頭像最長邊不可超過 ${MAX_PORTRAIT_EDGE} px`)
  }
  await assertPortraitHasTransparency(input, `投稿 ${submissionId}`)

  const png = await sharp(input).png({ compressionLevel: 9, effort: 10 }).toBuffer()
  const outputMetadata = await sharp(png).metadata()
  const width = outputMetadata.width ?? inputWidth
  const height = outputMetadata.height ?? inputHeight
  if (png.length > MAX_PORTRAIT_BYTES) {
    throw new Error(`投稿 ${submissionId} 頭像不可超過 ${MAX_PORTRAIT_BYTES / 1024} KB`)
  }
  if (!width || !height || Math.max(width, height) > MAX_PORTRAIT_EDGE) {
    throw new Error(`投稿 ${submissionId} 頭像最長邊不可超過 ${MAX_PORTRAIT_EDGE} px`)
  }

  const outputDir = options.outputDir ?? STAGING_DIR
  mkdirSync(outputDir, { recursive: true })
  const path = join(outputDir, `${canonicalId}.png`)
  writeFileSync(path, png)
  return { submissionId, revision, path, byteSize: png.length, width, height }
}

const readExisting = (path: string | undefined): Record<string, unknown>[] => {
  if (!path || !existsSync(path)) return []
  const data = JSON.parse(readFileSync(path, 'utf8')) as unknown
  if (!Array.isArray(data)) throw new Error(`${path} 必須是陣列`)
  return data as Record<string, unknown>[]
}

const writeMaster = (path: string, records: readonly Record<string, unknown>[]): void => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(records, null, 2)}\n`, 'utf8')
}

/** 可注入 CloudBase runner 的同步編排，測試不會觸發真實 CLI 或檔案寫入。 */
export const runSync = async (input: RunSyncInput): Promise<RunSyncResult> => {
  const approved = input.approved
    ? parseApprovedRecords(input.approved)
    : await fetchApprovedSubmissions(input.syncToken ?? '', input.invoke)
  const latest = latestApprovedRecords(approved)
  const existing = input.existing ?? readExisting(input.outputFile)
  const customOfficers = buildCustomOfficerMaster(approved, existing)

  const downloaded: ApprovedPortraitDownload[] = []
  if (input.stagingDir) {
    for (const record of latest) {
      downloaded.push(
        await downloadApprovedPortrait(record, input.syncToken ?? '', {
          invoke: input.invoke,
          outputDir: input.stagingDir,
        }),
      )
    }
  }

  if (input.outputFile) writeMaster(input.outputFile, customOfficers)

  const markVersion =
    typeof input.markPublished === 'string' ? input.markPublished : input.datasetVersion
  const markAction =
    typeof input.markPublished === 'function'
      ? input.markPublished
      : (input.markPublishedAction ??
        (async (submissionId: string, revision: number, datasetVersion: string) => {
          cloudData(
            await invoke(input.invoke, {
              action: 'markPublished',
              syncToken: input.syncToken ?? '',
              submissionId,
              revision,
              datasetVersion,
            }),
            'markPublished',
          )
        }))
  const published: string[] = []
  if (markVersion) {
    for (const record of latest) {
      await markAction(record.submissionId, record.revision, markVersion)
      published.push(record.submissionId)
    }
  }

  return { approved: latest, customOfficers, downloaded, published }
}

const runCli = async (): Promise<void> => {
  const args = process.argv.slice(2)
  const markRequested = args.includes('--mark-published')
  const versionIndex = args.indexOf('--dataset-version')
  const datasetVersion = versionIndex >= 0 ? asNonEmptyString(args[versionIndex + 1]) : ''
  if (markRequested && !datasetVersion) {
    throw new Error('使用 --mark-published 時必須同時提供 --dataset-version <version>')
  }

  console.log('[sync:custom-officers] 開始同步 approved 投稿...')
  const result = await runSync({
    syncToken: process.env.OFFICER_SYNC_TOKEN ?? '',
    outputFile: OUTPUT_FILE,
    stagingDir: STAGING_DIR,
    markPublished: markRequested ? datasetVersion : undefined,
  })
  console.log(`  approved 投稿：${result.approved.length} 筆`)
  console.log(`  已寫入：${result.customOfficers.length} 筆 custom 航海士`)
  console.log(`  已下載：${result.downloaded.length} 張頭像`)
  if (result.published.length > 0) console.log(`  已標記 published：${result.published.length} 筆`)
  console.log('')
  console.log('後續步驟：')
  console.log('  1. npm run assets:setup')
  console.log('  2. npm run assets:publish')
  console.log('  3. npm run data:generate')
  console.log('  4. npm run verify')
  console.log('  5. 發布小程序')
  if (!markRequested) {
    console.log('  6. npm run sync:custom-officers -- --mark-published --dataset-version <version>')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  runCli().catch((error) => {
    console.error('同步失敗:', error)
    process.exit(1)
  })
}
