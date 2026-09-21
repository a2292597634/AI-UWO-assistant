import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'

type Skill = {
  id: string
  name: string
  categoryId: string
  description: string
  levelInfo: string
  iconId: string | null
  sourceRefs: { workOrderId?: string; voyageTw?: string }
}

type Relation = {
  skillId: string
  kind: string
  sourceGroup: string
  slot: number
  unlockLevel: number
  level: number
}

type Officer = {
  id: string
  skills: Relation[]
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

const levelInfo =
  'Lv1: 3 | Lv2: 5 | Lv3: 6 | Lv4: 7 | Lv5: 9 | Lv6: 10 | Lv7: 11 | Lv8: 12 | Lv9: 13 | Lv10: 15'

const definitions = [
  {
    id: 'skill_wo_offline_adventure_collect_hazard',
    name: '採集險地',
    description: '探險中採集力增加3。',
    iconFile: 'skill_wo_offline_adventure_collect_hazard.png',
    officerIds: ['officer_chabbd046', 'officer_chaabd005'],
  },
  {
    id: 'skill_wo_offline_adventure_battle_hazard',
    name: '平定險地',
    description: '探險中戰鬥力增加3。',
    iconFile: 'skill_wo_offline_adventure_battle_hazard.png',
    officerIds: ['officer_custom_piyale', 'officer_chaabd009', 'officer_chaabd010'],
  },
  {
    id: 'skill_wo_offline_adventure_observation_hazard',
    name: '觀察險地',
    description: '探險中觀察力增加3。',
    iconFile: 'skill_wo_offline_adventure_observation_hazard.png',
    officerIds: ['officer_chasbd003', 'officer_chacbd017', 'officer_chast099'],
  },
] as const

const skills = readJson<Skill[]>('data/master/skills.json')
const officers = [
  ...readJson<Officer[]>('data/master/officers.json'),
  ...readJson<Officer[]>('data/master/custom-officers.json'),
]

describe('新增冒險被動技能 Canonical 資料', () => {
  it('包含正確的三個技能實體與十級效果', () => {
    for (const definition of definitions) {
      expect(skills).toContainEqual({
        id: definition.id,
        name: definition.name,
        categoryId: 'skill_category_adventure',
        description: definition.description,
        levelInfo,
        iconId: null,
        sourceRefs: { workOrderId: expect.any(String) },
      })
    }
  })

  it('把每项技能追加为目标航海士冒险技能组的最后一项', () => {
    for (const definition of definitions) {
      for (const officerId of definition.officerIds) {
        const officer = officers.find((item) => item.id === officerId)
        expect(officer).toBeDefined()

        const relation = officer!.skills.find((item) => item.skillId === definition.id)
        expect(relation).toEqual({
          skillId: definition.id,
          kind: 'passive',
          sourceGroup: 'sk5',
          slot: 2,
          unlockLevel: 1,
          level: 1,
        })
        const adventureSkills = officer!.skills.filter((item) => item.sourceGroup === 'sk5')
        expect(adventureSkills[adventureSkills.length - 1]).toBe(relation)
      }
    }
  })

  it('包含三個可解碼的 64x64 PNG 技能圖標', async () => {
    for (const definition of definitions) {
      const metadata = await sharp(`data/assets/staging/${definition.iconFile}`).metadata()
      expect(metadata.format).toBe('png')
      expect(metadata.width).toBe(64)
      expect(metadata.height).toBe(64)
    }
  })
})
