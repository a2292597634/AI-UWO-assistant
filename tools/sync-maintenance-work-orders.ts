/** 核准維護工單同步：完整記憶體轉換、驗證、可回復原子替換與發布門禁。 */
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  openSync,
  closeSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import type {
  MaintenanceOfficerData,
  ReferenceCandidate,
  MaintenanceOperation,
} from '../miniprogram/contracts/officer-maintenance'
import type {
  CanonicalOfficer,
  CanonicalSkill,
  DictionaryItem,
  CanonicalDatasetHeader,
} from './import/types'
import { createSchemaValidator } from './data-audit/create-schema-validator'

export interface MaintenanceMaster {
  officers: CanonicalOfficer[]
  skills: CanonicalSkill[]
  dictionaries: Record<string, DictionaryItem[]>
  dataset: CanonicalDatasetHeader
}
export interface ApprovedWorkOrder {
  workOrderId: string
  revision: number
  updatedAt: string
  status: string
  operation: MaintenanceOperation
  targetOfficerId: string | null
  baseDataVersion: string | null
  baseSnapshot: MaintenanceOfficerData | null
  reviewedData: MaintenanceOfficerData | null
  referenceCandidates: readonly ReferenceCandidate[]
  portraitFileId?: string | null
}
type Invoker = (payload: Record<string, unknown>) => Promise<unknown> | unknown
type Gate = 'data:check' | 'data:generate' | 'assets:manifest:check' | 'verify'
export type MaintenanceReleaseCommand = 'assets:setup' | 'assets:publish' | 'data:generate'
export interface MaintenanceSyncOptions {
  masterDir?: string
  approved?: readonly ApprovedWorkOrder[]
  syncToken?: string
  invoke?: Invoker
  runGate?: (name: Gate) => Promise<void> | void
  publish?: (datasetVersion: string) => Promise<void> | void
  portraitLoader?: (order: ApprovedWorkOrder) => Promise<Buffer>
  assetStagingDir?: string
  rollbackPaths?: readonly string[]
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T
const label = (value: string) => value.trim().normalize('NFKC')
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const plain = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const canonicalFields = (officer: CanonicalOfficer): MaintenanceOfficerData => {
  const { id: _id, sourceRefs: _sourceRefs, ...data } = officer
  return data
}
const candidateGroup = {
  skill: 'skills',
  job: 'jobs',
  language: 'languages',
  nationality: 'nationalities',
} as const

// sk2 中的醫術與修理是可執行的戰鬥行動，不能因技能名稱未包含「主動」而歸為被動。
const sk2ActionCategoryIds = new Set(['skill_category_medicine', 'skill_category_repair'])

/** 新資料沿用匯入器的正式 ID 前綴；來源值則由工單與候選 key 組成。 */
const canonicalIdPrefix = {
  officer: 'officer_',
  skill: 'skill_',
  job: 'job_',
  language: 'language_',
  nationality: 'nationality_',
} as const

const idSegment = (value: string, lowercase = false): string => {
  const segment = label(value)
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
  const result =
    segment || `key_${createHash('sha256').update(label(value)).digest('hex').slice(0, 12)}`
  return lowercase ? result.toLowerCase() : result
}

const allocateId = (
  kind: keyof typeof canonicalIdPrefix,
  sourceValue: string,
  used: Set<string>,
): string => {
  const base = `${canonicalIdPrefix[kind]}${idSegment(sourceValue, kind === 'officer')}`
  let id = base
  let suffix = 2
  while (used.has(id)) id = `${base}_${suffix++}`
  used.add(id)
  return id
}

const sourceRefValue = (order: ApprovedWorkOrder, candidateKey?: string): string =>
  candidateKey ? `${order.workOrderId}:${candidateKey}` : order.workOrderId

const sourceRefsFor = (order: ApprovedWorkOrder, candidateKey?: string) => ({
  workOrderId: sourceRefValue(order, candidateKey),
})

const validateMaster = (master: MaintenanceMaster): void => {
  const validator = createSchemaValidator()
  const findings = [
    ...validator.validate('officers', master.officers),
    ...validator.validate('dictionaries', master.dictionaries),
    // 現有 schema 尚未收錄既有 levelInfo；單獨檢查它並沿用其餘 schema 邊界。
    ...validator.validate(
      'skills',
      master.skills.map(({ levelInfo: _levelInfo, ...skill }) => skill),
    ),
  ]
  if (findings.length)
    throw new Error(
      `schema 校驗失敗：${findings[0]!.entityType}${findings[0]!.path} ${findings[0]!.message}`,
    )
  const ids = new Set<string>()
  for (const item of [
    ...master.officers,
    ...master.skills,
    ...Object.values(master.dictionaries).flat(),
  ]) {
    if (ids.has(item.id)) throw new Error(`正式 ID 衝突：${item.id}`)
    ids.add(item.id)
  }
  const groupIds = (group: string) =>
    new Set((master.dictionaries[group] ?? []).map((item) => item.id))
  const skillIds = new Set(master.skills.map((item) => item.id))
  const officerIds = new Set(master.officers.map((item) => item.id))
  const requireRef = (id: string, allowed: Set<string>) => {
    if (!allowed.has(id)) throw new Error(`正式引用不存在：${id}`)
  }
  for (const officer of master.officers) {
    for (const [field, group] of [
      ['rarityId', 'rarities'],
      ['typeId', 'types'],
      ['genderId', 'genders'],
      ['jobId', 'jobs'],
      ['nationalityId', 'nationalities'],
    ] as const)
      requireRef(officer[field], groupIds(group))
    for (const item of officer.languages) requireRef(item.languageId, groupIds('languages'))
    for (const item of officer.skills) requireRef(item.skillId, skillIds)
    for (const id of officer.recruitment.cityIds) requireRef(id, groupIds('cities'))
    if (officer.recruitment.requirementId !== null)
      requireRef(officer.recruitment.requirementId, groupIds('requirements'))
    for (const id of officer.recruitment.requiredOfficerIds) requireRef(id, officerIds)
  }
  for (const skill of master.skills) {
    requireRef(skill.categoryId, groupIds('skillCategories'))
    if (skill.levelInfo !== undefined && typeof skill.levelInfo !== 'string')
      throw new Error('技能 levelInfo 格式無效')
  }

  const skillCategories = new Map(master.skills.map((skill) => [skill.id, skill.categoryId]))
  for (const officer of master.officers) {
    for (const relation of officer.skills) {
      if (
        relation.sourceGroup === 'sk2' &&
        sk2ActionCategoryIds.has(skillCategories.get(relation.skillId) ?? '') &&
        relation.kind !== 'active'
      )
        throw new Error(`技能類型與來源分類不符：${officer.id}/${relation.skillId}`)
    }
  }
}

const validateReviewed = (data: MaintenanceOfficerData): void => {
  if (
    !plain(data) ||
    !data.name?.trim() ||
    !Number.isInteger(data.displayOrder) ||
    data.displayOrder < 0
  )
    throw new Error('審核資料格式無效')
  if (!Array.isArray(data.languages) || !Array.isArray(data.skills))
    throw new Error('語言或技能格式無效')
  const seenLanguages = new Set<string>()
  for (const item of data.languages) {
    if (!Number.isInteger(item.level) || item.level < 1 || seenLanguages.has(item.languageId))
      throw new Error('語言等級或重複引用無效')
    seenLanguages.add(item.languageId)
  }
  const slots = new Set<string>()
  const skills = new Set<string>()
  for (const item of data.skills) {
    const slot = `${item.sourceGroup}:${item.slot}`
    if (
      slots.has(slot) ||
      skills.has(item.skillId) ||
      !['active', 'passive'].includes(item.kind) ||
      !Number.isInteger(item.slot) ||
      item.slot < 0 ||
      !Number.isInteger(item.unlockLevel) ||
      item.unlockLevel < 1 ||
      !Number.isInteger(item.level) ||
      item.level < 1
    )
      throw new Error('技能槽位、類型或等級無效')
    slots.add(slot)
    skills.add(item.skillId)
  }
}

/** 不修改輸入；候選 key 僅在所屬工單內解析，完成整批後才校驗所有引用。 */
export const applyApprovedWorkOrders = (
  input: MaintenanceMaster,
  orders: readonly ApprovedWorkOrder[],
): MaintenanceMaster => {
  validateMaster(input)
  const output = structuredClone(input)
  if (orders.length === 0) return output
  const ordered = [...orders].sort((a, b) => compare(a.workOrderId, b.workOrderId))
  const workOrderIds = new Set<string>()
  const targets = new Set<string>()
  const used = new Set(
    [...output.officers, ...output.skills, ...Object.values(output.dictionaries).flat()].map(
      (item) => item.id,
    ),
  )
  const aliases = new Map<string, Set<string>>()
  const remember = (kind: string, name: string, id: string) => {
    const key = `${kind}:${label(name)}`
    const matches = aliases.get(key) ?? new Set<string>()
    matches.add(id)
    aliases.set(key, matches)
  }
  for (const [kind, group] of Object.entries(candidateGroup)) {
    for (const item of group === 'skills' ? output.skills : (output.dictionaries[group] ?? []))
      remember(kind, item.name, item.id)
  }
  for (const order of ordered) {
    if (
      !order.workOrderId?.trim() ||
      workOrderIds.has(order.workOrderId) ||
      order.status !== 'approvedPendingPublish' ||
      !Number.isInteger(order.revision) ||
      order.revision < 1 ||
      !Number.isFinite(Date.parse(order.updatedAt)) ||
      !order.reviewedData
    )
      throw new Error('工單狀態、版本或審核資料無效')
    if (order.operation === 'createOfficer' && !order.portraitFileId?.trim())
      throw new Error('新增航海士缺少已上傳頭像')
    workOrderIds.add(order.workOrderId)
    let existing: CanonicalOfficer | undefined
    let baseConflict = false
    if (order.operation === 'updateOfficer') {
      if (targets.has(order.targetOfficerId!)) throw new Error('同一目標航海士有多份核准工單')
      targets.add(order.targetOfficerId!)
      existing = input.officers.find((item) => item.id === order.targetOfficerId)
      if (!existing) throw new Error('修改目標正式 ID 不存在')
      baseConflict =
        order.baseDataVersion !== input.dataset.contentVersion ||
        !isDeepStrictEqual(canonicalFields(existing), order.baseSnapshot)
    } else if (
      order.operation !== 'createOfficer' ||
      order.targetOfficerId !== null ||
      order.baseSnapshot !== null ||
      order.baseDataVersion !== null
    )
      throw new Error('工單操作或新增基準無效')
    else existing = input.officers.find((item) => item.sourceRefs.workOrderId === order.workOrderId)
    const candidateIds = new Map<string, { kind: ReferenceCandidate['kind']; id: string }>()
    if (!Array.isArray(order.referenceCandidates)) throw new Error('候選資料格式無效')
    for (const candidate of [...(order.referenceCandidates as readonly ReferenceCandidate[])].sort(
      (a, b) => compare(`${a.kind}:${a.name}:${a.key}`, `${b.kind}:${b.name}:${b.key}`),
    )) {
      if (
        !plain(candidate) ||
        !(candidate.kind in candidateGroup) ||
        !candidate.name?.trim() ||
        !candidate.key?.trim() ||
        used.has(candidate.key) ||
        candidateIds.has(candidate.key) ||
        !Array.isArray(candidate.aliases) ||
        candidate.aliases.some((alias) => typeof alias !== 'string' || !alias.trim())
      )
        throw new Error('候選名稱、key 或別名衝突')
      const names = [candidate.name, ...candidate.aliases]
      if (new Set(names.map(label)).size !== names.length) throw new Error('候選別名衝突')
      const matches = new Set(
        names.flatMap((name) => [...(aliases.get(`${candidate.kind}:${label(name)}`) ?? [])]),
      )
      if (matches.size > 1) throw new Error('候選名稱或別名衝突')
      let id = [...matches][0]
      if (candidate.kind === 'skill') {
        if (
          !candidate.description?.trim() ||
          !output.dictionaries.skillCategories?.some((item) => item.id === candidate.categoryId)
        )
          throw new Error('候選技能分類或說明無效')
        if (id) {
          const skill = output.skills.find((item) => item.id === id)!
          if (
            skill.categoryId !== candidate.categoryId ||
            skill.description !== candidate.description ||
            (skill.levelInfo ?? '') !== (candidate.levelInfo ?? '')
          )
            throw new Error('同名候選技能內容衝突')
        } else {
          id = allocateId('skill', sourceRefValue(order, candidate.key), used)
          output.skills.push({
            id,
            name: candidate.name.trim(),
            categoryId: candidate.categoryId!,
            description: candidate.description,
            levelInfo: candidate.levelInfo ?? '',
            iconId: null,
            sourceRefs: sourceRefsFor(order, candidate.key),
          })
        }
      } else if (!id) {
        id = allocateId(candidate.kind, sourceRefValue(order, candidate.key), used)
        const group = candidateGroup[candidate.kind]
        const items = output.dictionaries[group] ?? (output.dictionaries[group] = [])
        items.push({
          id,
          name: candidate.name.trim(),
          displayOrder: Math.max(-1, ...items.map((item) => item.displayOrder)) + 1,
          sourceRefs: sourceRefsFor(order, candidate.key),
        })
      }
      candidateIds.set(candidate.key, { kind: candidate.kind, id: id! })
      for (const name of names) remember(candidate.kind, name, id!)
    }
    const resolveCandidate = (value: string, kind: ReferenceCandidate['kind']): string => {
      const candidate = candidateIds.get(value)
      if (candidate && candidate.kind !== kind) throw new Error('候選引用類型不符')
      return candidate?.id ?? value
    }
    const reviewed = structuredClone(order.reviewedData)
    validateReviewed(reviewed)
    const systemOfficerFields = existing
      ? {
          visualGradeId: existing.visualGradeId,
          portraitId: existing.portraitId,
          displayOrder: existing.displayOrder,
        }
      : {
          visualGradeId: 'grade_2' as const,
          portraitId: null,
          displayOrder: Math.max(-1, ...output.officers.map((item) => item.displayOrder)) + 1,
        }
    const officer: CanonicalOfficer = {
      ...reviewed,
      ...systemOfficerFields,
      jobId: resolveCandidate(reviewed.jobId, 'job'),
      nationalityId: resolveCandidate(reviewed.nationalityId, 'nationality'),
      languages: reviewed.languages.map((item) => ({
        ...item,
        languageId: resolveCandidate(item.languageId, 'language'),
      })),
      skills: reviewed.skills.map((item) => ({
        ...item,
        skillId: resolveCandidate(item.skillId, 'skill'),
      })),
      recruitment: {
        ...reviewed.recruitment,
        cityIds: [...reviewed.recruitment.cityIds],
        requiredOfficerIds: [...reviewed.recruitment.requiredOfficerIds],
      },
      id: existing?.id ?? allocateId('officer', sourceRefValue(order), used),
      sourceRefs: existing?.sourceRefs ?? sourceRefsFor(order),
    }
    validateReviewed(officer)
    // 本地生成成功但尚未標記發布時可重跑；只允許結果完全相同的已套用資料。
    if (
      existing &&
      (baseConflict || order.operation === 'createOfficer') &&
      !isDeepStrictEqual(canonicalFields(existing), canonicalFields(officer))
    )
      throw new Error('基準資料版本或快照衝突')
    if (
      output.officers.some(
        (item) => item.id !== officer.id && label(item.name) === label(officer.name),
      )
    )
      throw new Error('航海士名稱衝突')
    if (existing)
      output.officers[output.officers.findIndex((item) => item.id === existing.id)] = officer
    else output.officers.push(officer)
  }
  validateMaster(output)
  if (isDeepStrictEqual(output, input)) return output
  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        officers: output.officers,
        skills: output.skills,
        dictionaries: output.dictionaries,
      }),
    )
    .digest('hex')
    .slice(0, 16)
  output.dataset = {
    ...output.dataset,
    contentVersion: `maintenance-${digest}`,
    updatedAt: ordered.map((item) => item.updatedAt).sort()[ordered.length - 1]!,
    counts: {
      ...output.dataset.counts,
      officers: output.officers.length,
      skills: output.skills.length,
      dictionaryItems: Object.values(output.dictionaries).reduce(
        (sum, items) => sum + items.length,
        0,
      ),
    },
  }
  return output
}

const cloudData = (response: unknown): unknown => {
  if (!plain(response) || response.ok !== true)
    throw new Error(
      `雲端同步失敗：${plain(response) ? (response.message ?? response.code ?? '未知錯誤') : '回應格式無效'}`,
    )
  return response.data
}
const defaultInvoke: Invoker = (payload) =>
  JSON.parse(
    execFileSync(
      'tcb',
      ['fn', 'invoke', 'officer-maintenance', '--params', JSON.stringify(payload)],
      { cwd: ROOT, encoding: 'utf8', windowsHide: true },
    ),
  )
const defaultGate = (name: Gate) => {
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', name], {
    cwd: ROOT,
    stdio: 'inherit',
    windowsHide: true,
    shell: process.platform === 'win32',
  })
}
type MaintenanceCommand = (
  name: MaintenanceReleaseCommand,
  env?: Record<string, string>,
) => Promise<void> | void

const defaultCommand: MaintenanceCommand = (name, env = {}) => {
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', name], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    windowsHide: true,
    shell: process.platform === 'win32',
  })
}

/** CLI 真正的資產與資料發布階段；成功返回後才允許同步器回寫 published。 */
export const runMaintenanceRelease = async (
  datasetVersion: string,
  command: MaintenanceCommand = defaultCommand,
): Promise<void> => {
  await command('assets:setup')
  await command('assets:publish', { CLOUDBASE_CONTENT_VERSION: datasetVersion })
  await command('data:generate')
}

const portraitFromCloud = async (
  order: ApprovedWorkOrder,
  syncToken: string,
  invoke: Invoker,
): Promise<Buffer> => {
  const data = cloudData(
    await invoke({
      action: 'getPortraitDownloadUrl',
      syncToken,
      workOrderId: order.workOrderId,
      revision: order.revision,
      updatedAt: order.updatedAt,
    }),
  )
  const url = plain(data) && typeof data.tempFileURL === 'string' ? data.tempFileURL : ''
  if (!url) throw new Error(`工單 ${order.workOrderId} 缺少頭像下載地址`)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`工單 ${order.workOrderId} 頭像下載失敗`)
  return Buffer.from(await response.arrayBuffer())
}

const stagePortraits = async (
  result: MaintenanceMaster,
  orders: readonly ApprovedWorkOrder[],
  stagingDir: string,
  loader: (order: ApprovedWorkOrder) => Promise<Buffer>,
): Promise<void> => {
  const portraitOrders = orders.filter(
    (order) => order.operation === 'createOfficer' || order.portraitFileId,
  )
  if (portraitOrders.length === 0) return
  mkdirSync(stagingDir, { recursive: true })
  for (const order of portraitOrders) {
    const officer =
      result.officers.find((item) => item.sourceRefs.workOrderId === order.workOrderId) ??
      (order.operation === 'updateOfficer'
        ? result.officers.find((item) => item.id === order.targetOfficerId)
        : undefined)
    if (!officer) throw new Error(`工單 ${order.workOrderId} 找不到正式航海士 ID`)
    const input = await loader(order)
    const metadata = await sharp(input).metadata()
    const width = metadata.width ?? 0
    const height = metadata.height ?? 0
    if (!width || !height || Math.max(width, height) > 512)
      throw new Error(`工單 ${order.workOrderId} 頭像最長邊不可超過 512 px`)
    const png = await sharp(input).png({ compressionLevel: 9, effort: 10 }).toBuffer()
    if (png.length > 512 * 1024) throw new Error(`工單 ${order.workOrderId} 頭像不可超過 512 KB`)
    writeFileSync(join(stagingDir, `${officer.id}.png`), png)
  }
}
const MASTER_NAMES = ['officers', 'skills', 'dictionaries', 'dataset'] as const

const DEFAULT_ROLLBACK_PATHS = [
  join(ROOT, 'data/assets/staging'),
  join(ROOT, 'data/assets/cloudbase-manifest.json'),
  join(ROOT, 'data/assets/asset-dependencies.json'),
  join(ROOT, 'miniprogram/generated'),
  join(ROOT, 'miniprogram/subpkg-detail'),
  join(ROOT, 'miniprogram/subpkg-trade'),
  join(ROOT, 'miniprogram/subpkg-maintenance/maintenance-officers.js'),
  join(ROOT, 'cloudfunctions/officer-custom/reference-data.json'),
  join(ROOT, 'cloudfunctions/officer-maintenance/reference-data.json'),
] as const

interface RollbackSnapshot {
  sourcePath: string
  backupPath: string
  existed: boolean
}

const snapshotPaths = (paths: readonly string[]): { root: string; entries: RollbackSnapshot[] } => {
  const root = mkdtempSync(join(tmpdir(), 'uwo-maintenance-rollback-'))
  const entries = paths.map((sourcePath, index) => {
    const backupPath = join(root, String(index))
    const existed = existsSync(sourcePath)
    if (existed) {
      if (statSync(sourcePath).isDirectory()) cpSync(sourcePath, backupPath, { recursive: true })
      else copyFileSync(sourcePath, backupPath)
    }
    return { sourcePath, backupPath, existed }
  })
  return { root, entries }
}

const restorePaths = (snapshot: { entries: readonly RollbackSnapshot[] }): void => {
  for (const entry of snapshot.entries) {
    rmSync(entry.sourcePath, { recursive: true, force: true })
    if (!entry.existed) continue
    if (statSync(entry.backupPath).isDirectory())
      cpSync(entry.backupPath, entry.sourcePath, { recursive: true })
    else {
      mkdirSync(dirname(entry.sourcePath), { recursive: true })
      copyFileSync(entry.backupPath, entry.sourcePath)
    }
  }
}

/** 所有暫存檔先寫完才替換；失敗時回復已替換檔案，鎖防止同步器並行覆寫。 */
export const runMaintenanceSync = async (options: MaintenanceSyncOptions = {}) => {
  const masterDir = resolve(options.masterDir ?? join(ROOT, 'data/master'))
  const invoke = options.invoke ?? defaultInvoke
  if ((options.approved === undefined || options.publish) && !options.syncToken?.trim())
    throw new Error('缺少 OFFICER_SYNC_TOKEN')
  const fetched =
    options.approved ??
    cloudData(await invoke({ action: 'listApprovedForSync', syncToken: options.syncToken }))
  if (!Array.isArray(fetched)) throw new Error('核准工單清單格式無效')
  const lockPath = join(masterDir, '.maintenance-sync.lock')
  const lock = openSync(lockPath, 'wx')
  const transaction = randomUUID()
  const replacements: { path: string; temp: string; backup: string; replaced: boolean }[] = []
  const rollbackPaths =
    options.rollbackPaths ??
    (masterDir === resolve(join(ROOT, 'data/master')) ? DEFAULT_ROLLBACK_PATHS : [])
  const workspaceSnapshot = snapshotPaths(rollbackPaths)
  let publishedSuccessfully = false
  try {
    const master = Object.fromEntries(
      MASTER_NAMES.map((name) => [name, readJson(join(masterDir, `${name}.json`))]),
    ) as unknown as MaintenanceMaster
    const result = applyApprovedWorkOrders(master, fetched as ApprovedWorkOrder[])
    if (fetched.length === 0) return { master: result, published: [] as string[] }
    const dataChanged = !isDeepStrictEqual(result, master)
    const portraitOrders = (fetched as ApprovedWorkOrder[]).filter(
      (order) => order.operation === 'createOfficer' || order.portraitFileId,
    )
    if (portraitOrders.length > 0) {
      const loader =
        options.portraitLoader ??
        (masterDir === resolve(join(ROOT, 'data/master'))
          ? (order: ApprovedWorkOrder) => portraitFromCloud(order, options.syncToken!, invoke)
          : undefined)
      if (!loader) throw new Error('新增航海士同步缺少頭像下載器')
      await stagePortraits(
        result,
        fetched as ApprovedWorkOrder[],
        resolve(options.assetStagingDir ?? join(ROOT, 'data/assets/staging')),
        loader,
      )
    }
    for (const name of MASTER_NAMES) {
      const path = join(masterDir, `${name}.json`)
      const temp = `${path}.${transaction}.tmp`
      const backup = `${path}.${transaction}.backup`
      replacements.push({ path, temp, backup, replaced: false })
      writeFileSync(temp, JSON.stringify(result[name], null, 2) + '\n', { flag: 'wx' })
      writeFileSync(backup, readFileSync(path), { flag: 'wx' })
    }
    for (const file of replacements) {
      renameSync(file.temp, file.path)
      file.replaced = true
    }
    const gate = options.runGate ?? defaultGate
    await gate('data:check')
    if (options.publish && dataChanged) {
      await options.publish(result.dataset.contentVersion)
      await gate('assets:manifest:check')
      await gate('verify')
      publishedSuccessfully = true
    } else if (options.publish) {
      // 剩餘工單若已在上一輪寫入，重試只需驗證並補回寫，不重複發布資產。
      await gate('assets:manifest:check')
      await gate('verify')
      publishedSuccessfully = true
    } else {
      await gate('data:generate')
      await gate('assets:manifest:check')
      await gate('verify')
    }
    const published: string[] = []
    if (options.publish) {
      for (const order of [...(fetched as ApprovedWorkOrder[])].sort((a, b) =>
        compare(a.workOrderId, b.workOrderId),
      )) {
        cloudData(
          await invoke({
            action: 'markPublished',
            syncToken: options.syncToken,
            workOrderId: order.workOrderId,
            revision: order.revision,
            updatedAt: order.updatedAt,
            datasetVersion: result.dataset.contentVersion,
          }),
        )
        published.push(order.workOrderId)
      }
    }
    return { master: result, published }
  } catch (error) {
    if (!publishedSuccessfully) {
      restorePaths(workspaceSnapshot)
      for (const file of [...replacements].reverse())
        if (file.replaced) renameSync(file.backup, file.path)
    }
    throw error
  } finally {
    for (const file of replacements)
      for (const path of [file.temp, file.backup]) if (existsSync(path)) unlinkSync(path)
    closeSync(lock)
    unlinkSync(lockPath)
    rmSync(workspaceSnapshot.root, { recursive: true, force: true })
  }
}

// CLI 是正式 maintenance 發布入口：資產、生成與完整門禁成功後才回寫 published。
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runMaintenanceSync({
    syncToken: process.env.OFFICER_SYNC_TOKEN,
    publish: (datasetVersion) => runMaintenanceRelease(datasetVersion),
  })
    .then((result) => {
      console.log(
        `同步完成：${result.master.dataset.contentVersion}；標記發布 ${result.published.length} 份工單`,
      )
    })
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}
