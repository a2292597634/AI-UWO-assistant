import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  applyApprovedWorkOrders,
  runMaintenanceSync,
  type MaintenanceMaster,
  type ApprovedWorkOrder,
} from '../../tools/sync-maintenance-work-orders'
import { buildMaintenanceReferenceData } from '../../tools/data-pipeline/build-officer-reference-data'
import type { MaintenanceOfficerData } from '../../miniprogram/contracts/officer-maintenance'

const directories: string[] = []
afterEach(() => directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true })))

const data: MaintenanceOfficerData = {
  name: '既有航海士',
  rarityId: 'rarity_5',
  visualGradeId: 'grade_6',
  typeId: 'type_1',
  genderId: 'gender_f',
  jobId: 'job_1',
  nationalityId: 'nationality_1',
  languages: [{ languageId: 'language_1', level: 1 }],
  skills: [],
  recruitment: { cityIds: [], requirementId: null, requiredOfficerIds: [], note: null },
  portraitId: null,
  displayOrder: 1,
}
const master = (): MaintenanceMaster => ({
  officers: [
    {
      ...structuredClone(data),
      languages: [{ languageId: 'language_1', level: 1 }],
      skills: [],
      recruitment: { cityIds: [], requirementId: null, requiredOfficerIds: [], note: null },
      id: 'officer_9',
      sourceRefs: { voyageTw: 'existing' },
    },
  ],
  skills: [],
  dictionaries: Object.fromEntries(
    [
      ['rarities', 'rarity_5'],
      ['types', 'type_1'],
      ['genders', 'gender_f'],
      ['jobs', 'job_1'],
      ['nationalities', 'nationality_1'],
      ['languages', 'language_1'],
      ['skillCategories', 'skill_category_1'],
    ].map(([group, id]) => [
      group,
      [{ id, name: id, displayOrder: 0, sourceRefs: { voyageTw: id } }],
    ]),
  ),
  dataset: {
    schemaVersion: '1.0.0',
    contentVersion: 'v1',
    updatedAt: '2026-09-01T00:00:00.000Z',
    sourceSnapshot: 'fixture',
    counts: { officers: 1, skills: 0, assets: 0, dictionaryItems: 7 },
  },
})
const order = (overrides: Partial<ApprovedWorkOrder> = {}): ApprovedWorkOrder => ({
  workOrderId: 'wo_1',
  revision: 2,
  updatedAt: '2026-09-09T00:00:00.000Z',
  status: 'approvedPendingPublish',
  operation: 'updateOfficer',
  targetOfficerId: 'officer_9',
  baseDataVersion: 'v1',
  baseSnapshot: structuredClone(data),
  reviewedData: { ...structuredClone(data), name: '修訂航海士' },
  referenceCandidates: [],
  ...overrides,
})
const create = (id = 'wo_2'): ApprovedWorkOrder =>
  order({
    workOrderId: id,
    operation: 'createOfficer',
    targetOfficerId: null,
    baseDataVersion: null,
    baseSnapshot: null,
    reviewedData: { ...structuredClone(data), name: `新航海士${id}` },
  })
const directory = () => {
  const dir = mkdtempSync(join(tmpdir(), 'uwo-maintenance-sync-'))
  directories.push(dir)
  for (const [name, value] of Object.entries(master()))
    writeFileSync(join(dir, `${name}.json`), JSON.stringify(value))
  return dir
}

const sourceStyleData: MaintenanceOfficerData = {
  name: '既有來源航海士',
  rarityId: 'rarity_5',
  visualGradeId: 'grade_5',
  typeId: 'type_class_2',
  genderId: 'gender_f',
  jobId: 'job_jobchasT089',
  nationalityId: 'nationality_ctn_swe',
  languages: [{ languageId: 'language_lang70', level: 1 }],
  skills: [],
  recruitment: { cityIds: [], requirementId: null, requiredOfficerIds: [], note: null },
  portraitId: null,
  displayOrder: 1,
}

const sourceStyleMaster = (): MaintenanceMaster => ({
  officers: [
    {
      ...structuredClone(sourceStyleData),
      languages: sourceStyleData.languages.map((item) => ({ ...item })),
      skills: sourceStyleData.skills.map((item) => ({ ...item })),
      recruitment: {
        ...sourceStyleData.recruitment,
        cityIds: [...sourceStyleData.recruitment.cityIds],
        requiredOfficerIds: [...sourceStyleData.recruitment.requiredOfficerIds],
      },
      id: 'officer_chast089',
      sourceRefs: { voyageTw: 'chasT089' },
    },
  ],
  skills: [],
  dictionaries: Object.fromEntries(
    [
      ['rarities', ['rarity_5', '★★★★★']],
      ['types', ['type_class_2', '交易']],
      ['genders', ['gender_f', '女性']],
      ['jobs', ['job_jobchasT089', '北方的工藝家']],
      ['nationalities', ['nationality_ctn_swe', '瑞典']],
      ['languages', ['language_lang70', '瑞典語']],
      ['skillCategories', ['skill_category_trade', '貿易']],
    ].map(([group, [id, name]]) => [
      group,
      [{ id, name, displayOrder: 0, sourceRefs: { voyageTw: id } }],
    ]),
  ),
  dataset: {
    schemaVersion: '1.0.0',
    contentVersion: 'v1',
    updatedAt: '2026-09-01T00:00:00.000Z',
    sourceSnapshot: 'fixture',
    counts: { officers: 1, skills: 0, assets: 0, dictionaryItems: 7 },
  },
})

describe('核准工單純轉換', () => {
  it('新資料 ID 以維護來源前綴追蹤工單，不退化為數字序號', () => {
    const candidateOrder = create('wo_source_style')
    candidateOrder.reviewedData = {
      ...structuredClone(sourceStyleData),
      name: '新來源航海士',
      jobId: 'candidate_job',
      nationalityId: 'candidate_nationality',
      languages: [{ languageId: 'candidate_language', level: 1 }],
      skills: [
        {
          skillId: 'candidate_skill',
          kind: 'passive',
          sourceGroup: 'sk0',
          slot: 0,
          unlockLevel: 1,
          level: 1,
        },
      ],
    }
    candidateOrder.referenceCandidates = [
      {
        key: 'candidate_skill',
        kind: 'skill',
        name: '新來源技能',
        aliases: [],
        categoryId: 'skill_category_trade',
        description: '說明',
      },
      { key: 'candidate_job', kind: 'job', name: '新來源職業', aliases: [] },
      { key: 'candidate_language', kind: 'language', name: '新來源語言', aliases: [] },
      { key: 'candidate_nationality', kind: 'nationality', name: '新來源國籍', aliases: [] },
    ]

    const result = applyApprovedWorkOrders(sourceStyleMaster(), [candidateOrder])

    expect(result.officers[1]?.id).toBe('officer_maintenance_wo_source_style')
    expect(result.skills[0]?.id).toBe('skill_maintenance_wo_source_style_candidate_skill')
    expect(result.dictionaries.jobs?.[1]?.id).toBe('job_maintenance_wo_source_style_candidate_job')
    expect(result.dictionaries.languages?.[1]?.id).toBe(
      'language_maintenance_wo_source_style_candidate_language',
    )
    expect(result.dictionaries.nationalities?.[1]?.id).toBe(
      'nationality_maintenance_wo_source_style_candidate_nationality',
    )
    expect(result.officers[1]?.id).not.toMatch(/_(?:1|2)$/)
  })

  it('以真實 data/master 樣本新增資料時保留來源式正式 ID', () => {
    const realMaster = Object.fromEntries(
      ['officers', 'skills', 'dictionaries', 'dataset'].map((name) => [
        name,
        JSON.parse(readFileSync(`data/master/${name}.json`, 'utf8')),
      ]),
    ) as unknown as MaintenanceMaster
    const sample = realMaster.officers[0]
    if (!sample) throw new Error('缺少真實航海士樣本')
    const { id: _id, sourceRefs: _sourceRefs, ...sampleData } = sample
    const newOrder = create('wo_real_master_sample')
    newOrder.reviewedData = { ...sampleData, name: '真實資料新增樣本' }

    const result = applyApprovedWorkOrders(realMaster, [newOrder])

    expect(result.officers.map((item) => item.id)).toContain('officer_chast089')
    expect(result.officers.find((item) => item.name === '真實資料新增樣本')).toMatchObject({
      id: 'officer_maintenance_wo_real_master_sample',
      sourceRefs: { workOrderId: 'wo_real_master_sample' },
    })
  })

  it('修改航海士保留既有 ID 與來源，完整輸入保持不變', () => {
    const input = master()
    const before = structuredClone(input)
    const result = applyApprovedWorkOrders(input, [order()])
    expect(result.officers[0]).toMatchObject({
      id: 'officer_9',
      name: '修訂航海士',
      sourceRefs: { voyageTw: 'existing' },
    })
    expect(input).toEqual(before)
  })

  it('系統欄位由同步工具設定：修改保留既有值，新增分配下一個顯示排序', () => {
    const input = master()
    const update = order({
      reviewedData: {
        ...structuredClone(data),
        name: '修訂航海士',
        visualGradeId: 'grade_2',
        portraitId: '不應由工單寫入',
        displayOrder: 999,
      },
    })
    const createOrder = create('wo_system-fields')
    createOrder.reviewedData = {
      ...createOrder.reviewedData!,
      visualGradeId: 'grade_6',
      portraitId: '不應由工單寫入',
      displayOrder: 999,
    }
    const result = applyApprovedWorkOrders(input, [update, createOrder])
    expect(result.officers[0]).toMatchObject({
      visualGradeId: 'grade_6',
      portraitId: null,
      displayOrder: 1,
    })
    expect(result.officers[1]).toMatchObject({
      visualGradeId: 'grade_2',
      portraitId: null,
      displayOrder: 2,
    })
  })

  it('同步允許 kind 與 sourceGroup 依真實分類混合，不把來源組當成主被動規則', () => {
    const input = master()
    input.skills.push(
      {
        id: 'skill_navigation',
        name: '航海技能',
        categoryId: 'skill_category_1',
        description: '說明',
        levelInfo: '',
        iconId: null,
        sourceRefs: { voyageTw: 'skill-1' },
      },
      {
        id: 'skill_navigation_2',
        name: '航海技能二',
        categoryId: 'skill_category_1',
        description: '說明',
        levelInfo: '',
        iconId: null,
        sourceRefs: { voyageTw: 'skill-2' },
      },
    )
    const mixed = {
      ...structuredClone(data),
      skills: [
        {
          skillId: 'skill_navigation',
          kind: 'active' as const,
          sourceGroup: 'sk0' as const,
          slot: 0,
          unlockLevel: 1,
          level: 1,
        },
        {
          skillId: 'skill_navigation_2',
          kind: 'passive' as const,
          sourceGroup: 'sk2' as const,
          slot: 0,
          unlockLevel: 1,
          level: 1,
        },
      ],
    }
    const result = applyApprovedWorkOrders(input, [order({ reviewedData: mixed })])
    expect(result.officers[0]!.skills).toEqual(mixed.skills)
  })

  it('同名相同候選技能只產生一次正式 ID 並回填各工單引用，輸入次序不影響輸出', () => {
    const candidate = {
      key: 'candidate_a',
      kind: 'skill' as const,
      name: '新技能',
      aliases: [],
      categoryId: 'skill_category_1',
      description: '技能效果',
      levelInfo: '等級一',
    }
    const a = create('wo_a')
    const b = create('wo_b')
    for (const item of [a, b]) {
      item.referenceCandidates = [candidate]
      item.reviewedData = {
        ...item.reviewedData!,
        skills: [
          {
            skillId: candidate.key,
            kind: 'passive',
            sourceGroup: 'sk0',
            slot: 0,
            unlockLevel: 1,
            level: 1,
          },
        ],
      }
    }
    const result = applyApprovedWorkOrders(master(), [b, a])
    expect(result.skills).toEqual([
      {
        id: 'skill_maintenance_wo_a_candidate_a',
        name: '新技能',
        categoryId: 'skill_category_1',
        description: '技能效果',
        levelInfo: '等級一',
        iconId: null,
        sourceRefs: { workOrderId: 'wo_a' },
      },
    ])
    expect(result.officers.slice(1).map((item) => [item.id, item.skills[0]?.skillId])).toEqual([
      ['officer_maintenance_wo_a', 'skill_maintenance_wo_a_candidate_a'],
      ['officer_maintenance_wo_b', 'skill_maintenance_wo_a_candidate_a'],
    ])
    expect(applyApprovedWorkOrders(master(), [a, b])).toEqual(result)
  })

  it('候選職業、語言與國籍轉為正式 ID 並可由既有名稱重用 ID', () => {
    const item = create()
    item.referenceCandidates = [
      { key: 'job_new', kind: 'job', name: '新職業', aliases: [] },
      { key: 'lang_new', kind: 'language', name: '新語言', aliases: [] },
      { key: 'country', kind: 'nationality', name: 'nationality_1', aliases: [] },
    ]
    item.reviewedData = {
      ...item.reviewedData!,
      jobId: 'job_new',
      nationalityId: 'country',
      languages: [{ languageId: 'lang_new', level: 1 }],
    }
    const result = applyApprovedWorkOrders(master(), [item])
    expect(result.officers[1]).toMatchObject({
      jobId: 'job_maintenance_wo_2_job_new',
      nationalityId: 'nationality_1',
      languages: [{ languageId: 'language_maintenance_wo_2_lang_new', level: 1 }],
    })
    expect(result.dictionaries.nationalities).toHaveLength(1)
  })

  it.each([
    ['過期資料版本', () => order({ baseDataVersion: 'old' })],
    ['基準快照衝突', () => order({ baseSnapshot: { ...data, name: '不同快照' } })],
    ['未核准工單', () => order({ status: 'pendingReview' })],
    ['同名航海士', () => ({ ...create(), reviewedData: data })],
    [
      '非法欄位',
      () => order({ reviewedData: { ...data, unexpected: true } as MaintenanceOfficerData }),
    ],
    ['不存在引用', () => order({ reviewedData: { ...data, jobId: 'missing' } })],
  ])('%s 時拒絕整批轉換', (_label, makeOrder) => {
    expect(() => applyApprovedWorkOrders(master(), [makeOrder()])).toThrow()
  })

  it('拒絕既有正式 ID 衝突、重複工單與同時修改同一航海士', () => {
    const input = master()
    input.officers.push(structuredClone(input.officers[0]!))
    expect(() => applyApprovedWorkOrders(input, [order()])).toThrow(/ID/)
    expect(() => applyApprovedWorkOrders(master(), [order(), order()])).toThrow(/工單/)
    expect(() =>
      applyApprovedWorkOrders(master(), [order(), order({ workOrderId: 'wo_other' })]),
    ).toThrow(/目標/)
  })

  it('相同候選名稱效果不一致或別名指向多個正式項目時拒絕', () => {
    const a = create('wo_a')
    a.referenceCandidates = [
      {
        key: 'a',
        kind: 'skill',
        name: '重名',
        aliases: [],
        categoryId: 'skill_category_1',
        description: '效果一',
      },
    ]
    const b = create('wo_b')
    b.referenceCandidates = [{ ...a.referenceCandidates[0]!, description: '效果二' }]
    expect(() => applyApprovedWorkOrders(master(), [a, b])).toThrow(/衝突/)
    const input = master()
    input.dictionaries.jobs!.push({
      id: 'job_2',
      name: '第二職業',
      displayOrder: 1,
      sourceRefs: { voyageTw: '2' },
    })
    a.referenceCandidates = [{ key: 'a', kind: 'job', name: 'job_1', aliases: ['第二職業'] }]
    expect(() => applyApprovedWorkOrders(input, [a])).toThrow(/衝突/)
  })

  it('版本由實際結果確定，計數更新且空工單不改版本', () => {
    const input = master()
    expect(applyApprovedWorkOrders(input, [])).toEqual(input)
    const result = applyApprovedWorkOrders(input, [create()])
    expect(result.dataset.contentVersion).not.toBe('v1')
    expect(result.dataset.counts.officers).toBe(2)
    expect(result.dataset.updatedAt).toBe('2026-09-09T00:00:00.000Z')
  })

  it('本地已同步但仍待發布的同一批工單重跑保留 ID、計數與版本', () => {
    const orders = [order(), create()]
    orders[1]!.updatedAt = '2026-09-08T00:00:00.000Z'
    const first = applyApprovedWorkOrders(master(), orders)
    expect(applyApprovedWorkOrders(first, orders)).toEqual(first)
    expect(applyApprovedWorkOrders(first, [orders[1]!])).toEqual(first)
  })

  it('工單來源必須唯一且不能與快照來源混用', () => {
    const input = master()
    input.officers[0]!.sourceRefs = { voyageTw: 'existing', workOrderId: 'wo_fake' } as never
    expect(() => applyApprovedWorkOrders(input, [])).toThrow(/schema/)
  })

  it('同步保留完整正式 master 的既有 ID，校驗不要求修改既有審計 metadata', () => {
    const input = Object.fromEntries(
      ['officers', 'skills', 'dictionaries', 'dataset'].map((name) => [
        name,
        JSON.parse(readFileSync(`data/master/${name}.json`, 'utf8')),
      ]),
    ) as unknown as MaintenanceMaster
    const before = input.officers.map((item) => item.id)
    expect(applyApprovedWorkOrders(input, []).officers.map((item) => item.id)).toEqual(before)
  })
})

describe('同步寫入與發布門禁', () => {
  it('schema 或引用失敗不寫入任一 master 檔案', async () => {
    for (const patch of [{ jobId: 'missing' }, { displayOrder: 'bad' }]) {
      const dir = directory()
      const before = readdirSync(dir).map((name) => [name, readFileSync(join(dir, name), 'utf8')])
      await expect(
        runMaintenanceSync({
          masterDir: dir,
          approved: [order({ reviewedData: { ...data, ...patch } as MaintenanceOfficerData })],
        }),
      ).rejects.toThrow()
      expect(readdirSync(dir).map((name) => [name, readFileSync(join(dir, name), 'utf8')])).toEqual(
        before,
      )
    }
  })

  it('依序完成 data:check、生成、資產檢查與發布後，才以相同版本及工單 revision 標記發布', async () => {
    const dir = directory()
    const events: string[] = []
    let publishedVersion = ''
    const result = await runMaintenanceSync({
      masterDir: dir,
      approved: [order()],
      syncToken: 'secret',
      runGate: async (name) => {
        events.push(name)
      },
      publish: async (version) => {
        events.push('publish')
        publishedVersion = version
      },
      invoke: async (payload) => {
        expect(payload).toMatchObject({
          action: 'markPublished',
          syncToken: 'secret',
          workOrderId: 'wo_1',
          revision: 2,
          updatedAt: '2026-09-09T00:00:00.000Z',
          datasetVersion: publishedVersion,
        })
        events.push('markPublished')
        return { ok: true, data: { status: 'published' } }
      },
    })
    expect(events).toEqual([
      'data:check',
      'data:generate',
      'assets:manifest:check',
      'verify',
      'publish',
      'markPublished',
    ])
    expect(result.published).toEqual(['wo_1'])
    expect(JSON.parse(readFileSync(join(dir, 'dataset.json'), 'utf8')).contentVersion).toBe(
      publishedVersion,
    )
  })

  it.each(['data:check', 'data:generate', 'assets:manifest:check', 'verify', 'publish'])(
    '%s 失敗時不標記發布，門禁失敗回復 master',
    async (failure) => {
      const dir = directory()
      const before = readFileSync(join(dir, 'officers.json'), 'utf8')
      const marked: unknown[] = []
      await expect(
        runMaintenanceSync({
          masterDir: dir,
          approved: [order()],
          syncToken: 'secret',
          runGate: async (name) => {
            if (name === failure) throw new Error('門禁失敗')
          },
          publish: async () => {
            if (failure === 'publish') throw new Error('發布失敗')
          },
          invoke: async (payload) => {
            marked.push(payload)
            return { ok: true }
          },
        }),
      ).rejects.toThrow()
      expect(marked).toEqual([])
      expect(readFileSync(join(dir, 'officers.json'), 'utf8')).toBe(before)
    },
  )

  it('預設同步只完成本地門禁，沒有發布器時維持待發布', async () => {
    const dir = directory()
    const result = await runMaintenanceSync({
      masterDir: dir,
      approved: [order()],
      runGate: async () => {},
    })
    expect(result.published).toEqual([])
    expect(result.master.officers[0]?.name).toBe('修訂航海士')
  })

  it('發布已完成但回寫失敗時保留已發布 master，重試可補標記且不重建 ID', async () => {
    const dir = directory()
    const approved = [order(), create()]
    await expect(
      runMaintenanceSync({
        masterDir: dir,
        approved,
        syncToken: 'secret',
        runGate: async () => {},
        publish: async () => {},
        invoke: async () => ({ ok: false, code: 'conflict' }),
      }),
    ).rejects.toThrow(/雲端同步失敗/)
    const before = readFileSync(join(dir, 'officers.json'), 'utf8')
    expect(JSON.parse(before)).toHaveLength(2)
    const retried = await runMaintenanceSync({
      masterDir: dir,
      approved,
      syncToken: 'secret',
      runGate: async () => {},
      publish: async () => {},
      invoke: async () => ({ ok: true }),
    })
    expect(retried.published).toEqual(['wo_1', 'wo_2'])
    expect(readFileSync(join(dir, 'officers.json'), 'utf8')).toBe(before)
  })

  it('部分回寫失敗後伺服端只返回剩餘工單時，沿用已寫入版本並只補標記', async () => {
    const dir = directory()
    const approved = [order(), create()]
    const firstEvents: string[] = []
    await expect(
      runMaintenanceSync({
        masterDir: dir,
        approved,
        syncToken: 'secret',
        runGate: async () => {},
        publish: async () => {
          firstEvents.push('publish')
        },
        invoke: async (payload) => {
          if (payload.action !== 'markPublished') return { ok: true, data: [] }
          firstEvents.push(`mark:${payload.workOrderId}`)
          return payload.workOrderId === 'wo_2'
            ? { ok: false, code: 'conflict' }
            : { ok: true, data: { status: 'published' } }
        },
      }),
    ).rejects.toThrow(/雲端同步失敗/)
    const afterFirstRun = readFileSync(join(dir, 'officers.json'), 'utf8')

    const retryEvents: string[] = []
    const retried = await runMaintenanceSync({
      masterDir: dir,
      syncToken: 'secret',
      runGate: async () => {},
      publish: async () => {
        retryEvents.push('publish')
      },
      invoke: async (payload) => {
        if (payload.action === 'listApprovedForSync') return { ok: true, data: [approved[1]] }
        retryEvents.push(`mark:${payload.workOrderId}`)
        return { ok: true, data: { status: 'published' } }
      },
    })

    expect(retried.published).toEqual(['wo_2'])
    expect(retryEvents).toEqual(['mark:wo_2'])
    expect(readFileSync(join(dir, 'officers.json'), 'utf8')).toBe(afterFirstRun)
  })

  it('實際同步從伺服端核准清單取工單，未核准資料不進入 master', async () => {
    const dir = directory()
    const requests: unknown[] = []
    const result = await runMaintenanceSync({
      masterDir: dir,
      syncToken: 'secret',
      runGate: async () => {},
      invoke: async (payload) => {
        requests.push(payload)
        return { ok: true, data: [order()] }
      },
    })
    expect(requests).toEqual([{ action: 'listApprovedForSync', syncToken: 'secret' }])
    expect(result.master.officers[0]?.name).toBe('修訂航海士')
  })

  it('生成維護 reference-data 保留語言前綴並包含資料版本、技能分類與工單來源航海士', async () => {
    const dir = directory()
    const result = await runMaintenanceSync({
      masterDir: dir,
      approved: [create()],
      runGate: async () => {},
    })
    const reference = buildMaintenanceReferenceData(dir)
    expect(reference).toMatchObject({
      dataVersion: result.master.dataset.contentVersion,
      languageIds: ['language_1'],
      skillCategoryIds: ['skill_category_1'],
      officerIds: ['officer_9', 'officer_maintenance_wo_2'],
    })
  })
})
