/**
 * Detail Presenter
 *
 * Pure TypeScript transformation: compact RuntimeDetailRecord → WXML
 * ViewModel. No dependency on wx, Page, or the filesystem.
 */

import type { RuntimeDetailRecord } from '../../contracts/runtime-data'

// ── View Model Types ──

export interface DetailLanguageView {
  languageId: string
  level: number
  name: string
}

export interface DetailSkillView {
  skillId: string
  kind: 'active' | 'passive'
  unlockLevel: number
  level: number
  name: string
  iconPath: string
  description: string
  levelInfo: string
}

export interface DetailRecruitmentView {
  cityText: string
  requirementName: string | null
  note: string | null
}

export interface DetailViewModel {
  name: string
  rarityName: string
  typeName: string
  genderName: string
  jobName: string
  nationalityName: string
  portraitPath: string
  languages: DetailLanguageView[]
  recruitment: DetailRecruitmentView
}

export interface DetailPageState {
  officer: DetailViewModel | null
  portraitFail: boolean
  activeSkills: DetailSkillView[]
  passiveSkills: DetailSkillView[]
}

// ── Constants ──

const EMPTY_STATE: DetailPageState = {
  officer: null,
  portraitFail: false,
  activeSkills: [],
  passiveSkills: [],
}

// ── Public API ──

/** Transform a compact detail record into a WXML-ready ViewModel. */
export function presentDetail(record: RuntimeDetailRecord): DetailPageState {
  const activeSkills: DetailSkillView[] = []
  const passiveSkills: DetailSkillView[] = []

  for (const s of record.ss) {
    const skill: DetailSkillView = {
      skillId: s.si,
      kind: s.k,
      unlockLevel: s.ul,
      level: s.lv,
      name: s.n,
      iconPath: s.ip,
      description: s.d,
      levelInfo: s.li,
    }
    if (s.k === 'active') {
      activeSkills.push(skill)
    } else {
      passiveSkills.push(skill)
    }
  }

  const cityText = record.rc.cn && record.rc.cn.length > 0 ? record.rc.cn.join('、') : '無'

  const officer: DetailViewModel = {
    name: record.n,
    rarityName: record.rn,
    typeName: record.tn,
    genderName: record.gn,
    jobName: record.jn,
    nationalityName: record.nn,
    portraitPath: record.pp,
    languages: record.ls.map((l) => ({
      languageId: l.li,
      level: l.lv,
      name: l.n,
    })),
    recruitment: {
      cityText,
      requirementName: record.rc.rn,
      note: record.rc.nt,
    },
  }

  return {
    officer,
    portraitFail: false,
    activeSkills,
    passiveSkills,
  }
}

/** Return an empty state for missing/invalid IDs. */
export function emptyDetailState(): DetailPageState {
  return EMPTY_STATE
}
