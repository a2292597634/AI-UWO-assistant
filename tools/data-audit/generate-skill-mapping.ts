import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import type { SkillMappingRecord } from './types'

// 1. Read lang_1.js range files and extract menuskt entries using regex
const ranges: string[] = []
for (let i = 0; i < 4; i++) {
  const path = `archive/voyage-tw-2026052501/raw-data/lang_1_ranges/r${i}.txt`
  if (existsSync(path)) ranges.push(readFileSync(path, 'utf8'))
}
const combined = ranges.join('')

// Extract "menuskt<N>":"<name>" pairs using regex (avoids full JSON parse issues)
const catNames: Record<string, string> = {}
const re = /"menuskt(\d+)"\s*:\s*"([^"]+)"/g
let match
while ((match = re.exec(combined)) !== null) {
  catNames[`menuskt${match[1]}`] = match[2]
}
// Also handle the Chinese-named category "證書相關技能"
const chineseRe = /"證書相關技能"\s*:\s*"([^"]+)"/g
// (just check if it exists as a category ID in skill_arr)

console.log('Category names from lang data:')
for (const [k, v] of Object.entries(catNames).sort()) {
  console.log(`  ${k}: ${v}`)
}

// 2. Determine active/passive from category name
function determineKind(catName: string): 'active' | 'passive' {
  if (catName.includes('主動')) return 'active'
  if (catName.includes('被動')) return 'passive'
  if (catName.includes('提督')) return 'active'
  return 'passive'
}

function genCategoryId(menusktId: string): string {
  return `skill_category_${menusktId}`
}

// 3. ALL groups — any category can appear in any group.
// Kind is determined by category name (主動/被動), not by group convention.
const allGroups = ['sk0', 'sk1', 'sk2', 'sk3', 'sk4', 'sk5']

// 4. Read existing approved mapping
const existing = JSON.parse(
  readFileSync('data/audit/skill-group-mapping.json', 'utf8'),
) as SkillMappingRecord[]

const existingKeys = new Set(existing.map((e) => `${e.sourceGroup}\0${e.sourceCategoryId}`))

// 5. Generate missing entries
const newMappings: SkillMappingRecord[] = []
for (const [catId, catName] of Object.entries(catNames).sort()) {
  const kind = determineKind(catName)
  for (const group of allGroups) {
    const key = `${group}\0${catId}`
    if (!existingKeys.has(key)) {
      newMappings.push({
        sourceGroup: group,
        sourceCategoryId: catId,
        kind,
        categoryId: genCategoryId(catId),
        evidenceSkillIds: [],
        evidence: [
          `Auto-generated: category "${catName}" + group ${group} convention → ${kind}`,
        ],
        status: 'auto',
      })
    }
  }
}

// 6. Also handle the Chinese-named category "證書相關技能"
// This category appears in source but might not be in lang data with a menuskt key
const extraCategories: Array<{ id: string; kind: 'active' | 'passive' }> = [
  { id: '證書相關技能', kind: 'passive' },
]
for (const extra of extraCategories) {
  for (const group of allGroups) {
    const key = `${group}\0${extra.id}`
    if (!existingKeys.has(key)) {
      newMappings.push({
        sourceGroup: group,
        sourceCategoryId: extra.id,
        kind: extra.kind,
        categoryId: `skill_category_certificate`,
        evidenceSkillIds: [],
        evidence: [
          `Auto-generated: certificate-related skills, group ${group} → ${extra.kind}`,
        ],
        status: 'auto',
      })
    }
  }
}

console.log(`\nNew auto-generated mappings: ${newMappings.length}`)
for (const m of newMappings.slice(0, 30)) {
  console.log(`  ${m.sourceGroup}/${m.sourceCategoryId} → ${m.kind} (${m.categoryId})`)
}
if (newMappings.length > 30) console.log(`  ... and ${newMappings.length - 30} more`)

// 7. Merge and write
const merged = [...existing, ...newMappings]
writeFileSync('data/audit/skill-group-mapping.json', JSON.stringify(merged, null, 2) + '\n')

console.log(`\nWritten: ${merged.length} total (${existing.length} approved, ${newMappings.length} auto)`)
