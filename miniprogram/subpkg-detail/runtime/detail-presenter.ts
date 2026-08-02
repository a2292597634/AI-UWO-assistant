/**
 * Detail Presenter
 *
 * Pure TypeScript transformation: compact RuntimeDetailRecord → WXML
 * ViewModel. No dependency on wx, Page, or the filesystem.
 */

import type { RuntimeDetailRecord, RuntimeSkill } from '../../contracts/runtime-data'
import { buildOfficerVisuals } from '../../presenters/officer-visuals'
import type { OfficerVisualPaths } from '../../presenters/officer-visuals'
import { buildSkillSheet } from '../../presenters/skill-sheet'
import type { SkillSheetView } from '../../presenters/skill-sheet'

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
  sheet: SkillSheetView
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
  visuals: OfficerVisualPaths
  languageSummary: string
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
export function presentDetail(
  record: RuntimeDetailRecord,
  skills: Record<string, RuntimeSkill> = {},
): DetailPageState {
  const activeSkills: DetailSkillView[] = []
  const passiveSkills: DetailSkillView[] = []

  for (const s of record.ss) {
    const sharedSkill = skills[s.si]
    const runtimeSkill: RuntimeSkill = {
      id: s.si,
      n: s.n || sharedSkill?.n || s.si,
      cat: sharedSkill?.cat || '',
      cn: sharedSkill?.cn || '未分類',
      ip: s.ip || sharedSkill?.ip || '',
      d: s.d || sharedSkill?.d || '',
      li: s.li || sharedSkill?.li || '',
    }
    const skill: DetailSkillView = {
      skillId: s.si,
      kind: s.k,
      unlockLevel: s.ul,
      level: s.lv,
      name: runtimeSkill.n,
      iconPath: runtimeSkill.ip,
      description: runtimeSkill.d,
      levelInfo: runtimeSkill.li,
      sheet: buildSkillSheet(runtimeSkill, s.k),
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
    visuals: buildOfficerVisuals({
      visualGradeId: record.vg,
      typeId: record.ti,
      genderId: record.gi,
    }),
    languageSummary:
      record.ls.length > 0
        ? record.ls.map((language) => `${language.n} Lv.${language.lv}`).join('、')
        : '無',
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
