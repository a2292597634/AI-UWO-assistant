// Generated detail lookup — single source of truth for shard algorithm.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const loadDetail = require('../../detail-loaders') as (
  id: string,
  index: Record<string, number>,
) => Record<string, unknown> | null
// eslint-disable-next-line @typescript-eslint/no-require-imports
const detailIndex = require('../../detail-index') as Record<string, number>
// Skills data bridged through detail-loaders (avoids direct page→generated/ require)
const skillsData = (loadDetail as unknown as Record<string, unknown>).skills as Record<
  string,
  { li?: string; d?: string; n?: string }
>

// ── View model types (inline — no cross-file imports needed) ──

interface DetailLanguage {
  languageId: string
  level: number
  name: string
}

interface DetailSkill {
  skillId: string
  kind: string
  unlockLevel: number
  level: number
  name: string
  iconPath: string
  description: string
  levelInfo: string
}

interface OfficerView {
  name: string
  rarityName: string
  typeName: string
  genderName: string
  jobName: string
  nationalityName: string
  portraitPath: string
  languages: DetailLanguage[]
  recruitment: {
    cityText: string
    requirementName: string | null
    note: string | null
  }
}

// ── Presenter (inline, pure function) ──

interface DetailState {
  officer: OfficerView | null
  portraitFail: boolean
  activeSkills: DetailSkill[]
  passiveSkills: DetailSkill[]
  tooltipSkill: DetailSkill | null
}

function presentDetail(raw: Record<string, unknown>): DetailState {
  const ss = (raw.ss as Array<Record<string, unknown>>) || []
  const ls = (raw.ls as Array<Record<string, unknown>>) || []
  const rc = (raw.rc as Record<string, unknown>) || {}

  const activeSkills: DetailSkill[] = []
  const passiveSkills: DetailSkill[] = []

  for (const s of ss) {
    const skill: DetailSkill = {
      skillId: s.si as string,
      kind: s.k as string,
      unlockLevel: s.ul as number,
      level: s.lv as number,
      name: s.n as string,
      iconPath: s.ip as string,
      description: (s.d as string) || '',
      levelInfo: (s.li as string) || '',
    }
    // Patch name, description, levelInfo from shared skills data (not stored in detail shards)
    const skExtra = skillsData[skill.skillId]
    if (skExtra) {
      if (!skill.name) skill.name = skExtra.n || skill.skillId
      if (!skill.description) skill.description = skExtra.d || ''
      if (!skill.levelInfo) skill.levelInfo = skExtra.li || ''
    }

    if (skill.kind === 'active') {
      activeSkills.push(skill)
    } else {
      passiveSkills.push(skill)
    }
  }

  const cityNames = (rc.cn as string[]) || []
  const cityText = cityNames.length > 0 ? cityNames.join('、') : '無'

  const officer: OfficerView = {
    name: raw.n as string,
    rarityName: raw.rn as string,
    typeName: raw.tn as string,
    genderName: raw.gn as string,
    jobName: raw.jn as string,
    nationalityName: raw.nn as string,
    portraitPath: raw.pp as string,
    languages: ls.map(function (l) {
      return {
        languageId: l.li as string,
        level: l.lv as number,
        name: l.n as string,
      }
    }),
    recruitment: {
      cityText: cityText,
      requirementName: (rc.rn as string) || null,
      note: (rc.nt as string) || null,
    },
  }

  return {
    officer: officer,
    portraitFail: false,
    activeSkills: activeSkills,
    passiveSkills: passiveSkills,
    tooltipSkill: null,
  }
}

// ── Page ──

Page({
  data: {
    officer: null,
    portraitFail: false,
    activeSkills: [],
    passiveSkills: [],
    tooltipSkill: null,
  } as DetailState,

  onLoad: function (options: Record<string, string | undefined>) {
    const id = options.id
    if (!id) return

    const raw = loadDetail(id, detailIndex)
    if (!raw) return

    const state = presentDetail(raw)

    this.setData(state)
    wx.setNavigationBarTitle({ title: state.officer ? state.officer.name : '' })
  },

  onPortraitError: function () {
    this.setData({ portraitFail: true })
  },

  onSkillTap: function (e: { currentTarget: { dataset: Record<string, string> } }) {
    const ds = e.currentTarget.dataset
    const skillId = ds.skillId
    const allSkills = this.data.activeSkills.concat(this.data.passiveSkills)
    for (const skill of allSkills) {
      if (skill.skillId === skillId) {
        // tap same skill → dismiss
        if (this.data.tooltipSkill && this.data.tooltipSkill.skillId === skillId) {
          this.setData({ tooltipSkill: null })
        } else {
          this.setData({ tooltipSkill: skill })
        }
        return
      }
    }
  },

  onTooltipDismiss: function () {
    this.setData({ tooltipSkill: null })
  },
})
