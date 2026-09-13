import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { parseOfficers } from './parse-officers'
import { isVoyageTwOfficerSourceRefs } from './types'
import type { CanonicalOfficer, SourceOfficer } from './types'

const ARCHIVE_SOURCE_PATH = 'archive/voyage-tw-2026052501/raw-data/json_char.js'
const MASTER_OUTPUT_PATH = 'data/master/officers.json'

type SourceSkillValue = number | string | null

const parseSourceSkillValue = (
  value: SourceSkillValue | undefined,
  fallback: number | undefined,
  context: string,
): number | undefined => {
  if (value === undefined || value === null) return fallback
  const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10)
  if (!Number.isInteger(parsed)) throw new Error(`SKILL_LEVEL_SOURCE_INVALID: ${context}`)
  return parsed
}

const sourceRelationLevels = (sourceOfficer: SourceOfficer, sourceId: string) => {
  const unlockLevels = new Map<string, number>()
  for (const [group, groupSkills] of Object.entries(sourceOfficer.skill)) {
    if (!groupSkills) continue
    for (const [skillId, value] of Object.entries(groupSkills)) {
      const unlockLevel = parseSourceSkillValue(value, 1, `${sourceId}/skill.${group}.${skillId}`)
      if (unlockLevel === undefined) continue
      if (unlockLevels.has(skillId)) {
        throw new Error(`SKILL_LEVEL_SOURCE_DUPLICATE: ${sourceId}/${skillId}`)
      }
      unlockLevels.set(skillId, unlockLevel)
    }
  }

  const skillLevels = new Map<string, number>()
  for (const [skillId, value] of Object.entries(sourceOfficer.slv ?? {})) {
    const skillLevel = parseSourceSkillValue(value, undefined, `${sourceId}/slv.${skillId}`)
    if (skillLevel === undefined) continue
    skillLevels.set(skillId, skillLevel)
  }

  return { unlockLevels, skillLevels }
}

/** 依据唯读原始快照修正旧航海士的技能等级语义；手动记录保持不变。 */
export const migrateSkillLevelSemantics = (
  canonical: CanonicalOfficer[],
  source: Record<string, SourceOfficer>,
): CanonicalOfficer[] =>
  canonical.map((officer) => {
    if (!isVoyageTwOfficerSourceRefs(officer.sourceRefs)) return officer

    const sourceId = officer.sourceRefs.voyageTw
    const sourceOfficer = source[sourceId]
    if (!sourceOfficer) throw new Error(`SKILL_LEVEL_SOURCE_MISSING: ${sourceId}`)
    const { unlockLevels, skillLevels } = sourceRelationLevels(sourceOfficer, sourceId)

    return {
      ...officer,
      skills: officer.skills.map((relation) => {
        const sourceSkillId = relation.skillId.replace(/^skill_/, '')
        const unlockLevel = unlockLevels.get(sourceSkillId)
        if (unlockLevel === undefined) {
          throw new Error(`SKILL_LEVEL_SOURCE_RELATION_MISSING: ${sourceId}/${sourceSkillId}`)
        }

        return {
          ...relation,
          unlockLevel,
          level: skillLevels.get(sourceSkillId) ?? 1,
        }
      }),
    }
  })

type TextSpan = { start: number; end: number }
type TextReplacement = TextSpan & { replacement: string }

/** 找出文本中花括号深度为 0 的对象；可用于根数组或 skills 数组。 */
const findTopLevelObjectSpans = (text: string): TextSpan[] => {
  const spans: TextSpan[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') {
      if (depth === 0) start = index
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth < 0 || start < 0) throw new Error('SKILL_LEVEL_TEXT_BRACE_INVALID')
      if (depth === 0) {
        spans.push({ start, end: index + 1 })
        start = -1
      }
    }
  }

  if (inString || depth !== 0 || start >= 0) throw new Error('SKILL_LEVEL_TEXT_BRACE_INVALID')
  return spans
}

/** 从一个数组或对象起点找到对应的结束括号，忽略字符串中的括号。 */
const findMatchingDelimiter = (text: string, start: number): number => {
  const opening = text[start]
  const closingByOpening: Record<string, string> = { '{': '}', '[': ']' }
  if (opening !== '{' && opening !== '[') throw new Error('SKILL_LEVEL_TEXT_DELIMITER_INVALID')

  const stack = [opening]
  let inString = false
  let escaped = false
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{' || char === '[') {
      stack.push(char)
    } else if (char === '}' || char === ']') {
      const expectedOpening = Object.entries(closingByOpening).find(
        ([, closing]) => closing === char,
      )?.[0]
      if (stack.pop() !== expectedOpening) throw new Error('SKILL_LEVEL_TEXT_DELIMITER_INVALID')
      if (stack.length === 0) return index
    }
  }

  throw new Error('SKILL_LEVEL_TEXT_DELIMITER_INVALID')
}

const findSkillsArraySpan = (officerText: string): TextSpan => {
  const keyIndex = officerText.indexOf('"skills"')
  if (keyIndex < 0) throw new Error('SKILL_LEVEL_TEXT_SKILLS_MISSING')
  const start = officerText.indexOf('[', keyIndex)
  if (start < 0) throw new Error('SKILL_LEVEL_TEXT_SKILLS_MISSING')
  return { start, end: findMatchingDelimiter(officerText, start) + 1 }
}

const findFieldValueSpan = (relationText: string, field: 'unlockLevel' | 'level'): TextSpan => {
  const pattern = new RegExp(`("${field}"\\s*:\\s*)(-?\\d+)`, 'g')
  const matches = [...relationText.matchAll(pattern)]
  const match = matches[0]
  if (matches.length !== 1 || match?.index === undefined || match[1] === undefined) {
    throw new Error(`SKILL_LEVEL_TEXT_FIELD_INVALID: ${field}`)
  }
  const start = match.index + match[1].length
  return { start, end: start + (match[2]?.length ?? 0) }
}

/**
 * 在不重排主数据既有格式的前提下替换技能关系数值。
 * 只按带 voyageTw 来源的航海士对象定位关系，避免误改手动记录。
 */
export const migrateSkillLevelSemanticsText = (
  canonicalText: string,
  source: Record<string, SourceOfficer>,
): string => {
  const canonical = JSON.parse(canonicalText) as CanonicalOfficer[]
  const migrated = migrateSkillLevelSemantics(canonical, source)
  const officerSpans = findTopLevelObjectSpans(canonicalText)
  if (officerSpans.length !== canonical.length)
    throw new Error('SKILL_LEVEL_OFFICER_COUNT_MISMATCH')

  const replacements: TextReplacement[] = []
  for (const [officerIndex, officer] of canonical.entries()) {
    if (!isVoyageTwOfficerSourceRefs(officer.sourceRefs)) continue
    const migratedOfficer = migrated[officerIndex]
    const officerSpan = officerSpans[officerIndex]
    if (!migratedOfficer || !officerSpan) throw new Error('SKILL_LEVEL_OFFICER_COUNT_MISMATCH')

    const officerText = canonicalText.slice(officerSpan.start, officerSpan.end)
    const skillsSpan = findSkillsArraySpan(officerText)
    const skillsText = officerText.slice(skillsSpan.start, skillsSpan.end)
    const relationSpans = findTopLevelObjectSpans(skillsText)
    if (relationSpans.length !== officer.skills.length) {
      throw new Error('SKILL_LEVEL_RELATION_COUNT_MISMATCH')
    }

    for (const [skillIndex, relationSpan] of relationSpans.entries()) {
      const migratedRelation = migratedOfficer.skills[skillIndex]
      if (!migratedRelation) throw new Error('SKILL_LEVEL_RELATION_COUNT_MISMATCH')
      const relationText = skillsText.slice(relationSpan.start, relationSpan.end)
      for (const field of ['unlockLevel', 'level'] as const) {
        const fieldSpan = findFieldValueSpan(relationText, field)
        replacements.push({
          start: officerSpan.start + skillsSpan.start + relationSpan.start + fieldSpan.start,
          end: officerSpan.start + skillsSpan.start + relationSpan.start + fieldSpan.end,
          replacement: String(migratedRelation[field]),
        })
      }
    }
  }

  let migratedText = canonicalText
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    migratedText =
      migratedText.slice(0, replacement.start) +
      replacement.replacement +
      migratedText.slice(replacement.end)
  }
  return migratedText
}

const migrateMasterOfficers = (): void => {
  const source = parseOfficers(readFileSync(ARCHIVE_SOURCE_PATH, 'utf8'))
  const canonicalText = readFileSync(MASTER_OUTPUT_PATH, 'utf8')
  writeFileSync(MASTER_OUTPUT_PATH, migrateSkillLevelSemanticsText(canonicalText, source))
}

const entryFile = process.argv[1]
if (entryFile && resolve(entryFile) === fileURLToPath(import.meta.url)) {
  migrateMasterOfficers()
}
