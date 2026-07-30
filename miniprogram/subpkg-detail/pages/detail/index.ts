// Generated detail lookup — single source of truth for shard algorithm.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const loadDetail = require('../../detail-loaders') as (
  id: string,
  index: Record<string, number>,
) => Record<string, unknown> | null
// eslint-disable-next-line @typescript-eslint/no-require-imports
const detailIndex = require('../../detail-index') as Record<string, number>

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
  }
}

// ── Page ──

Page({
  data: {
    officer: null,
    portraitFail: false,
    activeSkills: [],
    passiveSkills: [],
  } as DetailState,

  onLoad: function (options: Record<string, string | undefined>) {
    var id = options.id
    if (!id) return

    var raw = loadDetail(id, detailIndex)
    if (!raw) return

    var state = presentDetail(raw)

    this.setData(state)
    wx.setNavigationBarTitle({ title: state.officer ? state.officer.name : '' })
  },

  onPortraitError: function () {
    this.setData({ portraitFail: true })
  },
})
