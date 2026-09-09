import { describe, expect, it } from 'vitest'
import type { MaintenanceEntityOption } from '../../miniprogram/presenters/maintenance-option-presenter'
import { searchMaintenanceOptions } from '../../miniprogram/presenters/maintenance-option-presenter'

const options: readonly MaintenanceEntityOption[] = [
  {
    id: 'nationality_portugal',
    name: '葡萄牙',
    aliases: ['葡國'],
    meta: '國籍',
    searchableText: '葡萄牙 葡國 nationality_portugal 國籍',
  },
  {
    id: 'nationality_france',
    name: '法國',
    aliases: ['法蘭西'],
    meta: '國籍',
    searchableText: '法國 法蘭西 nationality_france 國籍',
  },
  {
    id: 'skill_navigation',
    name: '導航術',
    aliases: ['navigation'],
    meta: '技能 · 航海',
    searchableText: '導航術 navigation skill_navigation 技能 航海',
  },
  {
    id: 'nation_marker',
    name: '國家標記',
    aliases: [],
    meta: '技能',
    searchableText: '國家標記 nation_marker 技能',
  },
]

describe('航海士維護選項 Presenter', () => {
  it('以名稱、別名或 ID 搜尋，並將名稱前綴命中排在前方', () => {
    expect(searchMaintenanceOptions(options, '葡')).toMatchObject([
      { id: 'nationality_portugal', name: '葡萄牙' },
    ])
    expect(searchMaintenanceOptions(options, '葡國')).toContainEqual(
      expect.objectContaining({ id: 'nationality_portugal', meta: '國籍' }),
    )
    expect(searchMaintenanceOptions(options, 'nation')).toContainEqual(
      expect.objectContaining({ id: 'nationality_portugal' }),
    )
  })

  it('搜尋查詢以 NFKC 與大小寫不敏感規則比對', () => {
    expect(searchMaintenanceOptions(options, ' ＮＡＶＩＧＡＴＩＯＮ ')).toContainEqual(
      expect.objectContaining({ id: 'skill_navigation' }),
    )
  })

  it('同時命中時將名稱前綴排在別名或 ID 命中之前，並按名稱穩定排序', () => {
    const result = searchMaintenanceOptions(
      [
        {
          id: 'nationality_portugal',
          name: '葡萄牙',
          aliases: ['葡國'],
          meta: '國籍',
          searchableText: '葡萄牙 葡國 nationality_portugal 國籍',
        },
        {
          id: 'skill_nation',
          name: '航海技能',
          aliases: ['葡'],
          meta: '技能 · 航海',
          searchableText: '航海技能 葡 skill_nation 技能 航海',
        },
      ],
      '葡',
    )

    expect(result.map((option) => option.id)).toEqual(['nationality_portugal', 'skill_nation'])
  })

  it('空白查詢只回傳受限首批結果，且不改寫輸入選項', () => {
    const manyOptions = Array.from({ length: 81 }, (_, index) => ({
      id: `skill_${String(index).padStart(3, '0')}`,
      name: `技能${String(index).padStart(3, '0')}`,
      aliases: [],
      meta: '技能',
      searchableText: `技能${String(index).padStart(3, '0')} skill_${String(index).padStart(3, '0')} 技能`,
    }))
    const before = structuredClone(manyOptions)

    const result = searchMaintenanceOptions(manyOptions, '  ')

    expect(result).toHaveLength(80)
    expect(result[0]).toEqual(manyOptions[0])
    expect(manyOptions).toEqual(before)
  })
})
