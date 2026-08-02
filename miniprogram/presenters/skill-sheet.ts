import type { RuntimeSkill } from '../contracts/runtime-data'

export type SkillKind = 'active' | 'passive'

export interface SkillLevelRow {
  level: number
  label: string
  description: string
  missing: boolean
}

export interface SkillSheetView {
  id: string
  name: string
  iconPath: string
  kind: SkillKind
  kindLabel: '主動技能' | '被動技能'
  category: string
  description: string
  levels: SkillLevelRow[]
}

const MISSING_LEVEL_DESCRIPTION = '此等級暫無資料'
const LEVEL_COUNT = 10
const LEVEL_SEGMENT = /^Lv\.?\s*(\d{1,2})\s*[:：]\s*(.*?)\s*$/i
const VALUE_TOKEN = /^(-?\d+(?:\.\d+)?)\s*([%％])?$/

export const parseLevelInfo = (levelInfo: string): Map<number, string[]> => {
  const levels = new Map<number, string[]>()

  for (const segment of levelInfo.split('|')) {
    const match = LEVEL_SEGMENT.exec(segment.trim())
    if (!match) continue

    const level = Number(match[1])
    const values = match[2]
      ?.split('/')
      .map((value) => value.trim())
      .filter(Boolean)

    if (level >= 1 && level <= LEVEL_COUNT && values && values.length > 0) {
      levels.set(level, values)
    }
  }

  return levels
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

interface ValueReplacement {
  start: number
  end: number
  text: string
}

const findValueReplacement = (
  sentence: string,
  sourceValue: string,
  targetValue: string,
  usedRanges: ValueReplacement[],
): ValueReplacement | null => {
  const source = VALUE_TOKEN.exec(sourceValue)
  const target = VALUE_TOKEN.exec(targetValue)
  if (!source || !target) return null

  const sourceNumber = escapeRegExp(source[1]!)
  const needsPercent = Boolean(source[2])
  const pattern = needsPercent
    ? new RegExp(`(^|[^\\d.])(${sourceNumber})([%％])`, 'g')
    : new RegExp(`(^|[^\\d.])(${sourceNumber})(?!\\d|\\.\\d)`, 'g')

  for (const match of sentence.matchAll(pattern)) {
    const prefix = match[1] ?? ''
    const start = (match.index ?? 0) + prefix.length
    const matchedPercent = needsPercent ? (match[3] ?? '') : ''
    const end = start + (match[2] ?? '').length + matchedPercent.length
    const overlapsUsedRange = usedRanges.some((range) => start < range.end && end > range.start)
    if (overlapsUsedRange) continue

    return {
      start,
      end,
      text: `${target[1]}${target[2] ? matchedPercent || target[2] : ''}`,
    }
  }

  return null
}

const buildLevelDescription = (
  description: string,
  templateValues: string[],
  levelValues: string[],
): string | null => {
  if (levelValues.length < templateValues.length) return null

  const replacements: ValueReplacement[] = []

  for (let index = 0; index < templateValues.length; index += 1) {
    const replacement = findValueReplacement(
      description,
      templateValues[index]!,
      levelValues[index]!,
      replacements,
    )
    if (!replacement) return null
    replacements.push(replacement)
  }

  replacements.sort((left, right) => left.start - right.start)

  let sentence = ''
  let cursor = 0
  for (const replacement of replacements) {
    sentence += description.slice(cursor, replacement.start) + replacement.text
    cursor = replacement.end
  }

  return sentence + description.slice(cursor)
}

export const buildSkillLevelRows = (description: string, levelInfo: string): SkillLevelRow[] => {
  const parsedLevels = parseLevelInfo(levelInfo)
  const templateValues = parsedLevels.get(1)

  return Array.from({ length: LEVEL_COUNT }, (_, index) => {
    const level = index + 1
    const levelValues = parsedLevels.get(level)
    const completeDescription =
      templateValues && levelValues
        ? buildLevelDescription(description, templateValues, levelValues)
        : null

    return {
      level,
      label: `Lv.${level}`,
      description: completeDescription ?? MISSING_LEVEL_DESCRIPTION,
      missing: completeDescription === null,
    }
  })
}

export const buildSkillSheet = (skill: RuntimeSkill, kind: SkillKind): SkillSheetView => ({
  id: skill.id,
  name: skill.n,
  iconPath: skill.ip,
  kind,
  kindLabel: kind === 'active' ? '主動技能' : '被動技能',
  category: skill.cn,
  description: skill.d,
  levels: buildSkillLevelRows(skill.d, skill.li),
})
