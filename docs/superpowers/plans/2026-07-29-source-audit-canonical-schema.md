# Source Audit and Canonical Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a bounded, reproducible voyage.tw source audit with approved field dispositions, audited `sk0`–`sk5` mappings, executable canonical JSON Schemas, representative fixtures, asset metadata, and deterministic reports without performing the full import.

**Architecture:** Treat fixed source samples, machine-readable audit decisions, canonical fixtures, and generated human reports as separate layers. A bounded sampler may read only whitelisted byte ranges and entity IDs; JSON Schema validates record shapes, while TypeScript contract validators enforce cross-file references, audit coverage, mapping completeness, and deterministic ordering.

**Tech Stack:** Native Node.js `fetch`, TypeScript 6, Vitest 4, JSON Schema Draft 2020-12, Ajv 8.20.0, ajv-formats 3.0.1, TSX, local Git

## Global Constraints

- The source is `https://voyage.tw/`.
- Pin the observed data version to `2026052501` and language version to `1779690379`.
- Audit 8 officers and exactly 20 selected skills; never exceed 12 officers or 25 skills.
- Source script reads must use HTTP `Range` and stay below 192 KiB per source file.
- Download only the explicitly listed representative assets; never crawl asset directories.
- Do not create or populate `data/master`.
- Do not download the complete `json_char.js`, `lang_1.js`, or `json.js`.
- Do not implement the full voyage.tw importer.
- Do not define `alias` or `aliases` in audit records, canonical records, schemas, or fixtures.
- Every observed source field must have exactly one disposition: `canonical`, `derived`, `archive-only`, or `rejected`.
- Unknown fields, unknown enums, unresolved mappings, broken references, and unaccounted records are blocking errors.
- All audit reports and canonical serialization must be deterministic.
- Feature and data logic follows TDD.
- Every task ends with focused tests and a focused Git commit.

---

## File Structure

### Source audit tools

- `tools/data-audit/source-config.ts`: pinned source URLs, versions, whitelisted IDs, byte ranges, and hard limits.
- `tools/data-audit/extract-js-value.ts`: pure brace-aware extraction of whitelisted JSON-compatible values from partial JavaScript.
- `tools/data-audit/capture-source-samples.ts`: bounded HTTP range capture and sample projection CLI.
- `tools/data-audit/types.ts`: shared audit record, mapping, finding, and report types.
- `tools/data-audit/validate-audit-inventory.ts`: field, enum, sample coverage, and disposition validation.
- `tools/data-audit/validate-skill-mappings.ts`: `sk0`–`sk5` mapping completeness and conflict validation.
- `tools/data-audit/create-schema-validator.ts`: strict Ajv 2020-12 setup and normalized error conversion.
- `tools/data-audit/validate-canonical-dataset.ts`: cross-file IDs, references, uniqueness, counts, and mapping checks.
- `tools/data-audit/collect-asset-metadata.ts`: bounded representative image download and metadata/hash collection.
- `tools/data-audit/render-audit-docs.ts`: deterministic Markdown generation from machine-readable audit data.
- `tools/data-audit/run-data-audit.ts`: one command that runs all Phase 2 gates and writes the report.

### Machine-readable audit decisions

- `data/audit/sample-selection.json`: fixed officer, skill, and asset sample IDs with coverage reasons.
- `data/audit/source-field-inventory.json`: observed fields and their dispositions.
- `data/audit/source-enum-inventory.json`: observed enum values and canonical dictionary IDs.
- `data/audit/skill-group-mapping.json`: approved group/category to `kind` and `categoryId` decisions.
- `data/audit/asset-sample-manifest.json`: bounded source asset URLs and expected observation status.

### Canonical schemas

- `data/schema/dataset.schema.json`
- `data/schema/officers.schema.json`
- `data/schema/skills.schema.json`
- `data/schema/dictionaries.schema.json`
- `data/schema/assets.schema.json`

### Fixed fixtures

- `tests/fixtures/source-audit/officers.json`: eight projected source officer samples.
- `tests/fixtures/source-audit/skills.json`: twenty projected source skill samples.
- `tests/fixtures/source-audit/source-metadata.json`: versions, URLs, byte ranges, timestamps, and hashes.
- `tests/fixtures/source-audit/assets/`: only successful representative image samples.
- `tests/fixtures/canonical/dataset.json`
- `tests/fixtures/canonical/officers.json`
- `tests/fixtures/canonical/skills.json`
- `tests/fixtures/canonical/dictionaries.json`
- `tests/fixtures/canonical/assets.json`
- `tests/fixtures/invalid/`: one minimal JSON fixture per blocking error.

### Tests and reports

- `tests/data-audit/extract-js-value.test.ts`
- `tests/data-audit/capture-source-samples.test.ts`
- `tests/data-contract/audit-inventory.test.ts`
- `tests/data-contract/skill-mapping.test.ts`
- `tests/data-contract/schema-validation.test.ts`
- `tests/data-contract/canonical-relations.test.ts`
- `tests/data-audit/asset-metadata.test.ts`
- `tests/data-audit/report-determinism.test.ts`
- `docs/data-audit/source-field-inventory.md`
- `docs/data-audit/source-enum-inventory.md`
- `docs/data-audit/skill-group-mapping.md`
- `docs/data-audit/audit-report-format.md`
- `docs/data-audit/phase-2-audit-report.md`

---

### Task 1: Add the bounded source sampler

**Files:**

- Create: `tools/data-audit/source-config.ts`
- Create: `tools/data-audit/extract-js-value.ts`
- Create: `tools/data-audit/capture-source-samples.ts`
- Create: `tests/data-audit/extract-js-value.test.ts`
- Create: `tests/data-audit/capture-source-samples.test.ts`
- Create: `data/audit/sample-selection.json`
- Modify: `package.json`

**Interfaces:**

- Consumes: HTTP endpoints supporting `Range`, fixed source and language versions.
- Produces: `extractJsValue<T>(source: string, key: string): T`, `extractJsString(source: string, key: string): string`, `captureSourceSamples(fetcher?: typeof fetch, selection?: Partial<SourceSelection>): Promise<CapturedSourceSamples>`.

- [ ] **Step 1: Write failing extraction tests**

Create `tests/data-audit/extract-js-value.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { extractJsString, extractJsValue } from '../../tools/data-audit/extract-js-value'

describe('extractJsValue', () => {
  const source =
    'var json_char={"chasT089":{"cht":"達納·卡洛斯","lang":{"lang70":"5"}},"next":{"x":1}}'

  it('extracts one complete object without evaluating JavaScript', () => {
    expect(extractJsValue(source, 'chasT089')).toEqual({
      cht: '達納·卡洛斯',
      lang: { lang70: '5' },
    })
  })

  it('extracts a JSON string containing punctuation', () => {
    expect(extractJsString('lang_js[1]={"skill100043":"神之手腕"}', 'skill100043')).toBe('神之手腕')
  })

  it('rejects missing and truncated values', () => {
    expect(() => extractJsValue(source, 'missing')).toThrow('AUDIT_SOURCE_KEY_MISSING')
    expect(() => extractJsValue('{"chasT089":{"cht":"達納', 'chasT089')).toThrow(
      'AUDIT_SOURCE_VALUE_TRUNCATED',
    )
  })
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
npm.cmd test -- tests/data-audit/extract-js-value.test.ts
```

Expected: FAIL because `tools/data-audit/extract-js-value.ts` does not exist.

- [ ] **Step 3: Implement the non-evaluating extractor**

Create `tools/data-audit/extract-js-value.ts` with a scanner that locates the exact JSON-quoted key, skips whitespace after the colon, tracks string escaping and `{`/`[` depth, then passes only the isolated JSON value to `JSON.parse`.

```ts
const locateValueStart = (source: string, key: string): number => {
  const marker = `${JSON.stringify(key)}:`
  const markerIndex = source.indexOf(marker)
  if (markerIndex < 0) throw new Error(`AUDIT_SOURCE_KEY_MISSING:${key}`)
  let index = markerIndex + marker.length
  while (/\s/.test(source[index] ?? '')) index += 1
  return index
}

export const extractJsValue = <T>(source: string, key: string): T => {
  const start = locateValueStart(source, key)
  const opening = source[start]
  if (opening !== '{' && opening !== '[') {
    throw new Error(`AUDIT_SOURCE_VALUE_NOT_STRUCTURED:${key}`)
  }

  const closing = opening === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === opening) depth += 1
    else if (char === closing) {
      depth -= 1
      if (depth === 0) return JSON.parse(source.slice(start, index + 1)) as T
    }
  }

  throw new Error(`AUDIT_SOURCE_VALUE_TRUNCATED:${key}`)
}

export const extractJsString = (source: string, key: string): string => {
  const start = locateValueStart(source, key)
  if (source[start] !== '"') throw new Error(`AUDIT_SOURCE_VALUE_NOT_STRING:${key}`)

  let escaped = false
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index]
    if (escaped) escaped = false
    else if (char === '\\') escaped = true
    else if (char === '"') return JSON.parse(source.slice(start, index + 1)) as string
  }

  throw new Error(`AUDIT_SOURCE_VALUE_TRUNCATED:${key}`)
}
```

- [ ] **Step 4: Run the extraction tests**

Run:

```powershell
npm.cmd test -- tests/data-audit/extract-js-value.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Define exact limits and sample IDs**

Create `tools/data-audit/source-config.ts`:

```ts
export const sourceConfig = {
  origin: 'https://voyage.tw',
  dataVersion: '2026052501',
  languageVersion: '1779690379',
  officerScript: '/js/json_char.js?v=2026052501',
  languageScript: '/js/lang_1.js?v=1779690379',
  officerRanges: [[0, 32767]],
  languageRanges: [
    [47238, 88188],
    [92126, 178363],
  ],
  limits: {
    bytesPerFile: 192 * 1024,
    officers: 12,
    skills: 25,
    assets: 12,
    assetBytes: 256 * 1024,
  },
  officerIds: [
    'chasT089',
    'chasT090',
    'chasT096',
    'chasT098',
    'chasT099',
    'chasT100',
    'chasT101',
    'chasab001',
  ],
  skillIds: [
    'skill200681',
    'skill203826',
    'skill200921',
    'skill203306',
    'skill500436',
    'skill100043',
    'skill203426',
    'skill100051',
    'skill509998406',
    'skill400591',
    'skill400581',
    'skill300001',
    'skillT0218',
    'skillT0219',
    'skillT0220',
    'skillT0221',
    'skillT0053',
    'skillT0073',
    'skill400861',
    'skill300004',
  ],
} as const
```

The language ranges are fixed raw UTF-8 byte offsets: names use `47238-88188` (40951 bytes) and descriptions use `92126-178363` (86238 bytes), for 127189 bytes total. The obsolete ranges were derived from decoded-string character positions; multi-byte UTF-8 characters therefore shifted the requested byte positions and left selected names outside the capture. The sampler must accumulate each selected skill's name and description across the fixed range responses, verify each body length matches its requested range, and keep the actual byte total for each source file strictly below `bytesPerFile`.

Create `data/audit/sample-selection.json` with the same IDs and these coverage reasons:

- `chasT089`: all `sk0`–`sk5`, `req_char`, `boss`, note, multiple languages.
- `chasT090`: missing `sk4`, relationship-level skill overrides.
- `chasT096`: `char_reqs`, `sk4`, male, combat type.
- `chasT098`: rank 3, single language, no `slv`.
- `chasT099`: rank 4, adventure type.
- `chasT100`: empty country and coded note.
- `chasT101`: missing note and anomalous non-town value inside `city`.
- `chasab001`: missing inline `cht`, null skill values, `char_reqs`.

Define the capture boundary types in `capture-source-samples.ts`:

```ts
export interface SourceSelection {
  officerIds: readonly string[]
  skillIds: readonly string[]
}

export interface CapturedSkillSample {
  name: string
  description: string
  sourceCategoryId: string | null
}

export interface CapturedSourceSamples {
  officers: Record<string, Record<string, unknown>>
  skills: Record<string, CapturedSkillSample>
  metadata: Array<{
    url: string
    range: string
    contentRange: string
    lastModified: string | null
    sha256: string
  }>
}
```

- [ ] **Step 6: Write failing sampler tests**

Create `tests/data-audit/capture-source-samples.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { captureSourceSamples } from '../../tools/data-audit/capture-source-samples'

describe('captureSourceSamples', () => {
  it('uses bounded Range requests and projects only whitelisted IDs', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('var json_char={"chasT089":{"cht":"達納·卡洛斯","skill":{"sk0":{}}}}', {
          status: 206,
          headers: { 'content-range': 'bytes 0-32767/567976' },
        }),
      )
      .mockResolvedValue(
        new Response(
          'lang_js[1]={"chasT089":"達納·卡洛斯","skill200681":"砲擊術","skill200681des":"說明"}',
          { status: 206, headers: { 'content-range': 'bytes 0-16383/337759' } },
        ),
      )

    await expect(
      captureSourceSamples(fetcher, {
        officerIds: ['chasT089'],
        skillIds: ['skill200681'],
      }),
    ).resolves.toMatchObject({
      officers: { chasT089: { cht: '達納·卡洛斯' } },
      skills: { skill200681: { name: '砲擊術', description: '說明' } },
    })

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('json_char.js'),
      expect.objectContaining({ headers: { Range: expect.stringMatching(/^bytes=/) } }),
    )
  })

  it('rejects full responses and sample counts above the phase limits', async () => {
    const fullResponse = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{}', { status: 200 }))
    await expect(captureSourceSamples(fullResponse)).rejects.toThrow('AUDIT_RANGE_REQUIRED')
  })
})
```

- [ ] **Step 7: Implement bounded capture**

Implement `captureSourceSamples` so it:

1. Rejects officer, skill, asset, or byte totals above `sourceConfig.limits`.
2. Sends only explicit `Range: bytes=<start>-<end>` requests.
3. Requires HTTP 206 and a matching `Content-Range`.
4. Extracts only whitelisted officer IDs.
5. Extracts only `<skillId>` and `<skillId>des` language strings.
6. Records source URL, version, byte range, `Last-Modified`, and SHA-256 of each returned range.
7. Writes JSON with sorted object keys and a final newline.

Add to `package.json`:

```json
{
  "scripts": {
    "data:audit:capture": "tsx tools/data-audit/capture-source-samples.ts"
  }
}
```

- [ ] **Step 8: Run focused tests and capture fixed source samples**

Run:

```powershell
npm.cmd test -- tests/data-audit/extract-js-value.test.ts tests/data-audit/capture-source-samples.test.ts
npm.cmd run data:audit:capture
```

Expected:

- Tests pass.
- Capture writes eight officers, twenty skills, and source metadata.
- Every HTTP request is 206.
- No source file read exceeds 192 KiB.
- The command prints `Source audit capture: 8 officers, 20 skills`.

- [ ] **Step 9: Commit**

```powershell
git add package.json tools/data-audit/source-config.ts tools/data-audit/extract-js-value.ts tools/data-audit/capture-source-samples.ts data/audit/sample-selection.json tests/data-audit tests/fixtures/source-audit
git commit -m "feat: add bounded source audit sampler"
```

---

### Task 2: Build the source field and enum inventories

**Files:**

- Create: `tools/data-audit/types.ts`
- Create: `tools/data-audit/validate-audit-inventory.ts`
- Create: `tests/data-contract/audit-inventory.test.ts`
- Create: `data/audit/source-field-inventory.json`
- Create: `data/audit/source-enum-inventory.json`

**Interfaces:**

- Consumes: fixed source officer and skill fixtures from Task 1.
- Produces: `validateAuditInventory(input: AuditInventoryInput): AuditFinding[]`.

- [ ] **Step 1: Define shared types**

Create `tools/data-audit/types.ts`:

```ts
export type FieldDisposition = 'canonical' | 'derived' | 'archive-only' | 'rejected'
export type FindingSeverity = 'error' | 'warning'

export interface SourceFieldRecord {
  entity: 'officer' | 'skill' | 'asset' | 'dataset'
  sourcePath: string
  observedTypes: Array<'array' | 'boolean' | 'null' | 'number' | 'object' | 'string'>
  optional: boolean
  nullable: boolean
  disposition: FieldDisposition
  canonicalPath: string | null
  transform: string | null
  reason: string
  evidenceOfficerIds: string[]
}

export interface SourceEnumValue {
  sourcePath: string
  sourceValue: string
  canonicalId: string
  evidenceOfficerIds: string[]
}

export interface SkillMappingRecord {
  sourceGroup: 'sk0' | 'sk1' | 'sk2' | 'sk3' | 'sk4' | 'sk5'
  sourceCategoryId: string
  kind: 'active' | 'passive'
  categoryId: string
  evidenceSkillIds: string[]
  evidence: string[]
  status: 'approved'
}

export interface AuditFinding {
  severity: FindingSeverity
  code: string
  entityType: string
  entityId: string
  path: string
  observedValue: unknown
  message: string
  suggestedAction: string
}
```

- [ ] **Step 2: Write failing inventory coverage tests**

Create `tests/data-contract/audit-inventory.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { SourceEnumValue, SourceFieldRecord } from '../../tools/data-audit/types'
import {
  listObservedOfficerPaths,
  validateAuditInventory,
} from '../../tools/data-audit/validate-audit-inventory'

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

describe('source field inventory', () => {
  it('accounts for every observed source field exactly once', () => {
    const officers = readJson<Record<string, unknown>>('tests/fixtures/source-audit/officers.json')
    const fields = readJson<SourceFieldRecord[]>('data/audit/source-field-inventory.json')
    const enums = readJson<SourceEnumValue[]>('data/audit/source-enum-inventory.json')

    expect(validateAuditInventory({ officers, fields, enums })).toEqual([])
  })

  it('detects the known source paths without treating dynamic IDs as new schemas', () => {
    const paths = listObservedOfficerPaths({
      chasT089: {
        cht: '達納·卡洛斯',
        lang: { lang70: '5' },
        skill: { sk0: { skill200681: '10' } },
      },
    })

    expect(paths).toEqual(['cht', 'lang.*', 'skill.sk0.*'])
  })

  it('rejects alias fields and missing dispositions', () => {
    const findings = validateAuditInventory({
      officers: { officer_1: { aliases: [] } },
      fields: [],
      enums: [],
    })
    expect(findings.map((finding) => finding.code)).toContain('AUDIT_ALIAS_FIELD_FORBIDDEN')
    expect(findings.map((finding) => finding.code)).toContain('AUDIT_FIELD_UNACCOUNTED')
  })
})
```

- [ ] **Step 3: Run the test and verify failure**

Run:

```powershell
npm.cmd test -- tests/data-contract/audit-inventory.test.ts
```

Expected: FAIL because the validator and inventories do not exist.

- [ ] **Step 4: Implement field-path normalization and validation**

Create `tools/data-audit/validate-audit-inventory.ts` with:

```ts
import type { AuditFinding, SourceEnumValue, SourceFieldRecord } from './types'

const dynamicSegments = /^(?:skill[A-Za-z0-9]+|lang\d+)$/

export const listObservedOfficerPaths = (officers: Record<string, unknown>): string[] => {
  const paths = new Set<string>()

  const visit = (value: unknown, segments: string[]): void => {
    if (value === null || typeof value !== 'object') {
      paths.add(segments.join('.'))
      return
    }
    if (Array.isArray(value)) {
      paths.add(segments.join('.'))
      return
    }
    for (const [key, child] of Object.entries(value)) {
      const normalized =
        segments.length === 0 && /^skill[A-Za-z0-9]+$/.test(key)
          ? 'skill*'
          : dynamicSegments.test(key)
            ? '*'
            : key
      visit(child, [...segments, normalized])
    }
  }

  for (const officer of Object.values(officers)) visit(officer, [])
  return [...paths].sort()
}

export interface AuditInventoryInput {
  officers: Record<string, unknown>
  fields: SourceFieldRecord[]
  enums: SourceEnumValue[]
}
export const validateAuditInventory = (input: AuditInventoryInput): AuditFinding[] => {
  const findings: AuditFinding[] = []
  const observed = listObservedOfficerPaths(input.officers)
  const inventoried = new Map(input.fields.map((field) => [field.sourcePath, field]))

  for (const path of observed) {
    if (path === 'alias' || path === 'aliases') {
      findings.push({
        severity: 'error',
        code: 'AUDIT_ALIAS_FIELD_FORBIDDEN',
        entityType: 'officer',
        entityId: '*',
        path,
        observedValue: null,
        message: 'Alias fields are outside the approved schema.',
        suggestedAction: 'Remove the field from audit and canonical data.',
      })
    }
    if (!inventoried.has(path)) {
      findings.push({
        severity: 'error',
        code: 'AUDIT_FIELD_UNACCOUNTED',
        entityType: 'officer',
        entityId: '*',
        path,
        observedValue: null,
        message: 'Observed source field has no disposition.',
        suggestedAction: 'Add exactly one approved field inventory record.',
      })
    }
  }

  return findings.sort((a, b) =>
    [a.code, a.entityType, a.entityId, a.path]
      .join('\0')
      .localeCompare([b.code, b.entityType, b.entityId, b.path].join('\0')),
  )
}
```

Extend the implementation to reject duplicate inventory paths, invalid disposition/target combinations, missing evidence, and enum values without canonical IDs.

- [ ] **Step 5: Populate the exact observed source fields**

Create `data/audit/source-field-inventory.json` with one decision for each observed normalized path:

```text
cht
rank
type
job
country
lang.*
skill*
skill.sk0.*
skill.sk1.*
skill.sk2.*
skill.sk3.*
skill.sk4.*
skill.sk5.*
slv.*
city
req
need
gender
note
req_char
char_reqs
new
boss
```

Use these decisions:

- `cht`, `rank`, `type`, `job`, `country`, `lang.*`, `skill.sk0.*` through `skill.sk5.*`, `slv.*`, `city`, `req`, `need`, `gender`, `note`, `req_char`, and `char_reqs`: `canonical` or `derived`, with exact target paths.
- Dynamic top-level `skill*`: `derived`; audit whether it represents the displayed duel skill level and map it without duplicating the relationship.
- `new` and `boss`: `archive-only` unless representative evidence proves a V1 domain meaning.
- No alias path may appear.

Create `data/audit/source-enum-inventory.json` for every observed value of:

- `rank`
- `type`
- `gender`
- `country`
- `job`
- language IDs
- city IDs
- requirement IDs

Empty strings and `null` are absence forms, not dictionary values.

- [ ] **Step 6: Run the inventory tests**

Run:

```powershell
npm.cmd test -- tests/data-contract/audit-inventory.test.ts
```

Expected: PASS, including zero unaccounted fields and zero alias fields.

- [ ] **Step 7: Commit**

```powershell
git add tools/data-audit/types.ts tools/data-audit/validate-audit-inventory.ts data/audit/source-field-inventory.json data/audit/source-enum-inventory.json tests/data-contract/audit-inventory.test.ts
git commit -m "feat: add source field audit inventory"
```

---

### Task 3: Audit `sk0`–`sk5` mappings

**Files:**

- Create: `tools/data-audit/validate-skill-mappings.ts`
- Create: `tests/data-contract/skill-mapping.test.ts`
- Create: `data/audit/skill-group-mapping.json`
- Modify: `tools/data-audit/source-config.ts`
- Modify: `tools/data-audit/capture-source-samples.ts`
- Modify: `tests/fixtures/source-audit/skills.json`
- Modify: `tests/fixtures/source-audit/source-metadata.json`

**Interfaces:**

- Consumes: source officer and skill fixtures, enum inventory.
- Produces: `validateSkillMappings(input: SkillMappingInput): AuditFinding[]`, `resolveSkillMapping(sourceGroup: SourceGroup, sourceCategoryId: string): SkillMappingRecord`.

- [ ] **Step 1: Write failing mapping tests**

Create `tests/data-contract/skill-mapping.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  resolveSkillMapping,
  validateSkillMappings,
} from '../../tools/data-audit/validate-skill-mappings'

describe('skill group mapping', () => {
  it('requires all six source groups to have approved evidence-backed mappings', () => {
    expect(
      validateSkillMappings({ officers: {}, skills: {}, mappings: [] }).map((item) => item.code),
    ).toEqual([
      'AUDIT_SKILL_GROUP_UNMAPPED',
      'AUDIT_SKILL_GROUP_UNMAPPED',
      'AUDIT_SKILL_GROUP_UNMAPPED',
      'AUDIT_SKILL_GROUP_UNMAPPED',
      'AUDIT_SKILL_GROUP_UNMAPPED',
      'AUDIT_SKILL_GROUP_UNMAPPED',
    ])
  })

  it('rejects conflicting kind decisions for one group/category pair', () => {
    const findings = validateSkillMappings({
      officers: {},
      skills: {},
      mappings: [
        {
          sourceGroup: 'sk2',
          sourceCategoryId: 'menuskt5',
          kind: 'active',
          categoryId: 'skill_category_melee_active',
          evidenceSkillIds: ['skill400591'],
          evidence: ['source metadata'],
          status: 'approved',
        },
        {
          sourceGroup: 'sk2',
          sourceCategoryId: 'menuskt5',
          kind: 'passive',
          categoryId: 'skill_category_melee_active',
          evidenceSkillIds: ['skill400591'],
          evidence: ['conflicting guess'],
          status: 'approved',
        },
      ],
    })
    expect(findings.map((item) => item.code)).toContain('AUDIT_SKILL_MAPPING_CONFLICT')
  })

  it('resolves only an approved exact group/category pair', () => {
    expect(() => resolveSkillMapping('sk2', 'unknown')).toThrow('AUDIT_SKILL_MAPPING_UNRESOLVED')
  })
})
```

- [ ] **Step 2: Run the tests and verify failure**

Run:

```powershell
npm.cmd test -- tests/data-contract/skill-mapping.test.ts
```

Expected: FAIL because the mapping validator does not exist.

- [ ] **Step 3: Implement strict mapping validation**

Create `tools/data-audit/validate-skill-mappings.ts`:

```ts
import mappingsJson from '../../data/audit/skill-group-mapping.json'
import type { AuditFinding, SkillMappingRecord } from './types'

type SourceGroup = SkillMappingRecord['sourceGroup']
const requiredGroups: SourceGroup[] = ['sk0', 'sk1', 'sk2', 'sk3', 'sk4', 'sk5']

export interface SkillMappingInput {
  officers: Record<string, unknown>
  skills: Record<string, unknown>
  mappings: SkillMappingRecord[]
}

export const validateSkillMappings = (input: SkillMappingInput): AuditFinding[] => {
  const findings: AuditFinding[] = []
  for (const group of requiredGroups) {
    if (!input.mappings.some((mapping) => mapping.sourceGroup === group)) {
      findings.push({
        severity: 'error',
        code: 'AUDIT_SKILL_GROUP_UNMAPPED',
        entityType: 'skill-mapping',
        entityId: group,
        path: 'sourceGroup',
        observedValue: group,
        message: 'Source skill group has no approved mapping.',
        suggestedAction: 'Add evidence-backed mappings for every observed category in this group.',
      })
    }
  }
  return findings.sort((a, b) =>
    [a.code, a.entityId, a.path].join('\0').localeCompare([b.code, b.entityId, b.path].join('\0')),
  )
}

const approvedMappings = mappingsJson as SkillMappingRecord[]

export const resolveSkillMapping = (
  sourceGroup: SourceGroup,
  sourceCategoryId: string,
): SkillMappingRecord => {
  const matches = approvedMappings.filter(
    (mapping) =>
      mapping.sourceGroup === sourceGroup && mapping.sourceCategoryId === sourceCategoryId,
  )
  if (matches.length !== 1) {
    throw new Error(`AUDIT_SKILL_MAPPING_UNRESOLVED:${sourceGroup}:${sourceCategoryId}`)
  }
  return matches[0]
}
```

Extend validation to reject duplicate pairs, conflicting `kind`, empty evidence, non-approved status, missing sample skill evidence, and source relationships with no exact mapping.

- [ ] **Step 4: Inspect only the selected twenty skills and write approved mappings**

For each selected skill:
Use a bounded 4 KiB window search for the selected skill IDs in `json.js?v=2026052501`. Stop as soon as every selected skill has a `skill_arr` metadata object or total reads reach 192 KiB. After discovery, replace the search windows with the exact successful ranges in `source-config.ts`; normal capture runs must never scan dynamically. Store each selected skill's observed category key, image override `i` when present, and metadata source range in the fixed skill fixture.

1. Read its source group from the eight officer fixtures.
2. Read its source category identifier from the bounded source metadata.
3. Confirm the displayed category name from `lang_1.js`.
4. Confirm active/passive meaning using the game screenshot and at least one source category label.
5. Record the exact `sourceGroup + sourceCategoryId` pair, `kind`, canonical category ID, evidence skill IDs, and evidence text.

Create `data/audit/skill-group-mapping.json`. It must:

- Include all observed pairs across `sk0`–`sk5`.
- Use only status `approved`.
- Contain no “unknown”, “pending”, empty evidence, or guessed mapping.
- Keep active/passive only in relationship mappings, never in skill entities.

If any selected skill lacks category metadata within the 192 KiB source limit, replace that skill with another skill from the same group and record the replacement reason in `sample-selection.json`; do not increase the byte limit or download the full source file.

- [ ] **Step 5: Run the mapping tests**

Run:

```powershell
npm.cmd test -- tests/data-contract/skill-mapping.test.ts
```

Expected: PASS with all six groups covered and no conflict or unresolved pair.

- [ ] **Step 6: Commit**

```powershell
git add tools/data-audit/validate-skill-mappings.ts data/audit/skill-group-mapping.json data/audit/sample-selection.json tests/data-contract/skill-mapping.test.ts
git commit -m "feat: audit source skill group mappings"
```

---

### Task 4: Add executable canonical JSON Schemas

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tools/data-audit/create-schema-validator.ts`
- Create: `data/schema/dataset.schema.json`
- Create: `data/schema/officers.schema.json`
- Create: `data/schema/skills.schema.json`
- Create: `data/schema/dictionaries.schema.json`
- Create: `data/schema/assets.schema.json`
- Create: `tests/data-contract/schema-validation.test.ts`
- Create: `tests/fixtures/invalid/schema-extra-property.json`
- Create: `tests/fixtures/invalid/schema-alias-field.json`
- Create: `tests/fixtures/invalid/schema-required-field.json`

**Interfaces:**

- Consumes: JSON Schema Draft 2020-12 files and JSON values.
- Produces: `createSchemaValidator(): AuditSchemaValidator`.

- [ ] **Step 1: Install pinned validators**

Run:

```powershell
npm.cmd install --save-dev ajv@8.20.0 ajv-formats@3.0.1
```

Expected: `package.json` and `package-lock.json` record the exact requested versions.

- [ ] **Step 2: Write failing Schema tests**

Create `tests/data-contract/schema-validation.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createSchemaValidator } from '../../tools/data-audit/create-schema-validator'

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown

describe('canonical JSON Schemas', () => {
  const validator = createSchemaValidator()

  it.each(['dataset', 'officers', 'skills', 'dictionaries', 'assets'])(
    'accepts the canonical %s fixture',
    (name) => {
      expect(validator.validate(name, readJson(`tests/fixtures/canonical/${name}.json`))).toEqual(
        [],
      )
    },
  )

  it('rejects undeclared and alias fields', () => {
    expect(
      validator
        .validate('officers', readJson('tests/fixtures/invalid/schema-extra-property.json'))
        .map((finding) => finding.code),
    ).toContain('SCHEMA_ADDITIONAL_PROPERTY')
    expect(
      validator
        .validate('officers', readJson('tests/fixtures/invalid/schema-alias-field.json'))
        .map((finding) => finding.code),
    ).toContain('SCHEMA_ADDITIONAL_PROPERTY')
  })
})
```

- [ ] **Step 3: Run the test and verify failure**

Run:

```powershell
npm.cmd test -- tests/data-contract/schema-validation.test.ts
```

Expected: FAIL because the validator, Schemas, and canonical fixtures do not exist.

- [ ] **Step 4: Implement Ajv 2020-12 validation**

Create `tools/data-audit/create-schema-validator.ts`:

```ts
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import type { AuditFinding } from './types'

const schemaNames = ['dataset', 'officers', 'skills', 'dictionaries', 'assets'] as const
type SchemaName = (typeof schemaNames)[number]

export interface AuditSchemaValidator {
  validate(name: SchemaName, value: unknown): AuditFinding[]
}

export const createSchemaValidator = (): AuditSchemaValidator => {
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)

  for (const name of schemaNames) {
    const schema = JSON.parse(readFileSync(`data/schema/${name}.schema.json`, 'utf8')) as Record<
      string,
      unknown
    >
    ajv.addSchema(schema, name)
  }

  return {
    validate(name, value) {
      const valid = ajv.validate(name, value)
      if (valid) return []
      return (ajv.errors ?? [])
        .map((error): AuditFinding => ({
          severity: 'error',
          code: `SCHEMA_${error.keyword.replaceAll('-', '_').toUpperCase()}`,
          entityType: name,
          entityId: '*',
          path: error.instancePath || '/',
          observedValue: (error as { data?: unknown }).data ?? null,
          message: error.message ?? 'Schema validation failed.',
          suggestedAction: 'Correct the record to match the canonical schema.',
        }))
        .sort((a, b) => [a.code, a.path].join('\0').localeCompare([b.code, b.path].join('\0')))
    },
  }
}
```

- [ ] **Step 5: Create the five strict Schemas**

Every Schema must set:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "additionalProperties": false
}
```

Define these exact record contracts:

| Schema          | Required record fields                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dataset         | `schemaVersion`, `contentVersion`, `updatedAt`, `sourceSnapshot`, `counts`                                                                                 |
| officer         | `id`, `name`, `rarityId`, `typeId`, `genderId`, `jobId`, `nationalityId`, `languages`, `skills`, `recruitment`, `portraitId`, `displayOrder`, `sourceRefs` |
| skill           | `id`, `name`, `categoryId`, `description`, `iconId`, `sourceRefs`                                                                                          |
| dictionary item | `id`, `name`, `displayOrder`, `sourceRefs`                                                                                                                 |
| asset           | `id`, `kind`, `ownerType`, `ownerId`, `source`                                                                                                             |

Officer nested contracts:

- `languages`: unique objects with required `languageId` and integer `level`; uniqueness by `languageId` is enforced in Task 5.
- `skills`: objects with required `skillId`, `kind`, `sourceGroup`, `slot`, `unlockLevel`, and `level`.
- `kind`: only `active` or `passive`.
- `sourceGroup`: only `sk0` through `sk5`.
- `recruitment.cityIds` and `requiredOfficerIds`: always arrays.
- `recruitment.requirementId` and `note`: string or `null`.
- Optional `maintenanceNote`: non-empty string when present.
- `sourceRefs`: requires non-empty `voyageTw`.
- No alias field.

Asset nested contracts:

- `source`: requires URL, original filename, MIME type, byte size, SHA-256, width, and height.
- Optional `output`: when present, requires path, MIME type, byte size, SHA-256, width, height, processing rule version, and shard ID.
- `output` is omitted before Phase 4; it is never `null`.

Dataset `updatedAt` must be RFC 3339 UTC and comes from fixture metadata; validators must not replace it with the current time.

- [ ] **Step 6: Add minimal invalid fixtures and temporary minimal valid fixtures**

Create the three invalid files so each isolates one Schema error:

```json
{
  "schema-alias-field.json": {
    "id": "officer_test",
    "aliases": []
  },
  "schema-extra-property.json": {
    "id": "officer_test",
    "unexpected": true
  },
  "schema-required-field.json": {}
}
```

Store each object in its own named file. Add the smallest complete canonical fixture files necessary for the five positive tests; Task 5 replaces them with representative fixtures.

- [ ] **Step 7: Run focused Schema tests**

Run:

```powershell
npm.cmd test -- tests/data-contract/schema-validation.test.ts
```

Expected: PASS; canonical fixtures validate and all three invalid fixtures fail with stable codes.

- [ ] **Step 8: Commit**

```powershell
git add package.json package-lock.json tools/data-audit/create-schema-validator.ts data/schema tests/data-contract/schema-validation.test.ts tests/fixtures/canonical tests/fixtures/invalid
git commit -m "feat: add canonical data schemas"
```

---

### Task 5: Audit representative source assets

**Files:**

- Create: `tools/data-audit/collect-asset-metadata.ts`
- Create: `tests/data-audit/asset-metadata.test.ts`
- Create: `data/audit/asset-sample-manifest.json`
- Create: `tests/fixtures/source-audit/assets/`

**Interfaces:**

- Consumes: fixed source sample configuration and bounded `fetch`.
- Produces: `collectAssetMetadata(entries: AssetSampleEntry[], fetcher?: typeof fetch): Promise<AssetObservation[]>`.

- [ ] **Step 1: Create the exact asset manifest**

Create `data/audit/asset-sample-manifest.json` with these nine URLs:

```json
[
  {
    "ownerType": "officer",
    "ownerSourceId": "chasT089",
    "url": "https://voyage.tw/img/char/uwo_chasT089.png",
    "expectedStatus": 200
  },
  {
    "ownerType": "officer",
    "ownerSourceId": "chasT096",
    "url": "https://voyage.tw/img/char/uwo_chasT096.png",
    "expectedStatus": 200
  },
  {
    "ownerType": "officer",
    "ownerSourceId": "chasab001",
    "url": "https://voyage.tw/img/char/uwo_chasab001.png",
    "expectedStatus": 200
  },
  {
    "ownerType": "skill",
    "ownerSourceId": "skill400591",
    "url": "https://voyage.tw/img/skill/uwo_skill400591.png",
    "expectedStatus": 200
  },
  {
    "ownerType": "skill",
    "ownerSourceId": "skill300001",
    "url": "https://voyage.tw/img/skill/uwo_skill300001.png",
    "expectedStatus": "observe"
  },
  {
    "ownerType": "skill",
    "ownerSourceId": "skill203426",
    "url": "https://voyage.tw/img/skill/uwo_skill203426.png",
    "expectedStatus": "observe"
  },
  {
    "ownerType": "skill",
    "ownerSourceId": "skill100043",
    "url": "https://voyage.tw/img/skill/uwo_skill100043.png",
    "expectedStatus": "observe"
  },
  {
    "ownerType": "skill",
    "ownerSourceId": "skillT0218",
    "url": "https://voyage.tw/img/skill/uwo_skillT0218.png",
    "expectedStatus": 404
  },
  {
    "ownerType": "skill",
    "ownerSourceId": "skill509998406",
    "url": "https://voyage.tw/img/skill/uwo_skill509998406.png",
    "expectedStatus": 404
  }
]
```

The two known 404s are observations to explain through source asset indirection; they are not silently converted to placeholder images.

- [ ] **Step 2: Write failing asset tests**

Create `tests/data-audit/asset-metadata.test.ts`:

```ts
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { collectAssetMetadata } from '../../tools/data-audit/collect-asset-metadata'

describe('collectAssetMetadata', () => {
  it('hashes bounded PNG content and records dimensions', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex')
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(png, {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': String(png.length) },
      }),
    )

    const [result] = await collectAssetMetadata(
      [{ ownerType: 'officer', ownerSourceId: 'chasT089', url: 'https://voyage.tw/a.png' }],
      fetcher,
    )

    expect(result).toMatchObject({
      status: 200,
      mimeType: 'image/png',
      width: 1,
      height: 1,
      sha256: createHash('sha256').update(png).digest('hex'),
    })
  })

  it('records 404 without writing a fake asset', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }))
    const [result] = await collectAssetMetadata(
      [{ ownerType: 'skill', ownerSourceId: 'skillT0218', url: 'https://voyage.tw/missing.png' }],
      fetcher,
    )
    expect(result).toMatchObject({ status: 404, sha256: null, localFixturePath: null })
  })
})
```

- [ ] **Step 3: Run the test and verify failure**

Run:

```powershell
npm.cmd test -- tests/data-audit/asset-metadata.test.ts
```

Expected: FAIL because the collector does not exist.

Define the exact collector types:

```ts
export interface AssetSampleEntry {
  ownerType: 'officer' | 'skill'
  ownerSourceId: string
  url: string
}

export interface AssetObservation {
  ownerType: 'officer' | 'skill'
  ownerSourceId: string
  url: string
  status: number
  mimeType: string | null
  byteSize: number | null
  width: number | null
  height: number | null
  sha256: string | null
  duplicateOf: string | null
  localFixturePath: string | null
}
```

- [ ] **Step 4: Implement bounded image inspection**

Implement `collectAssetMetadata` with:

- At most 12 manifest entries.
- At most 256 KiB per successful body.
- Only `https://voyage.tw/` URLs.
- Only `image/png` for the observed Phase 2 source path.
- PNG signature and IHDR width/height parsing.
- SHA-256 of exact source bytes.
- Duplicate-content detection by SHA-256.
- Stable output order by owner type, owner source ID, and URL.
- No local file for non-200 responses.

The CLI may write only successful samples under `tests/fixtures/source-audit/assets/`, using stable source IDs as filenames.

- [ ] **Step 5: Run tests and collect nine observations**

Run:

```powershell
npm.cmd test -- tests/data-audit/asset-metadata.test.ts
npx.cmd tsx tools/data-audit/collect-asset-metadata.ts
```

Expected:

- Three portrait URLs remain bounded and return PNG observations.
- `skill400591` returns a PNG observation.
- `skillT0218` and `skill509998406` remain explicit 404 observations unless the audited indirection rule resolves them to a different exact source image ID.
- Successful assets have byte size, SHA-256, width, height, and local fixture path.
- No more than nine URLs are requested.

- [ ] **Step 6: Resolve source image indirection without fabricating assets**

For every direct 404, inspect only the bounded metadata for that selected skill and apply the observed `skill_arr[skillId].i` image-ID override plus the source rule that truncates skill image IDs longer than 11 characters. Record the exact rule and evidence in the asset observation.

If an image still cannot be resolved inside the 192 KiB metadata limit, replace that skill with another skill from the same `sk0`–`sk5` group and approved category. Keep the total at exactly twenty, update `sample-selection.json`, source skill fixtures, and `skill-group-mapping.json`, and record the replacement reason. Do not increase the byte limit.

- [ ] **Step 7: Run asset and mapping tests**

Run:

```powershell
npm.cmd test -- tests/data-audit/asset-metadata.test.ts tests/data-contract/skill-mapping.test.ts
```

Expected: PASS; all final selected skills have either a successfully observed icon or a documented same-group replacement, with no unresolved mapping.

- [ ] **Step 8: Commit**

```powershell
git add tools/data-audit/collect-asset-metadata.ts data/audit/asset-sample-manifest.json data/audit/sample-selection.json data/audit/skill-group-mapping.json tests/data-audit/asset-metadata.test.ts tests/fixtures/source-audit/assets tests/fixtures/source-audit/skills.json
git commit -m "feat: audit representative source assets"
```

---

### Task 6: Normalize representative fixtures and validate relationships

**Files:**

- Create: `tools/data-audit/validate-canonical-dataset.ts`
- Create: `tests/data-contract/canonical-relations.test.ts`
- Modify: `tests/fixtures/canonical/dataset.json`
- Modify: `tests/fixtures/canonical/officers.json`
- Modify: `tests/fixtures/canonical/skills.json`
- Modify: `tests/fixtures/canonical/dictionaries.json`
- Modify: `tests/fixtures/canonical/assets.json`
- Create: `tests/fixtures/invalid/broken-skill-reference.json`
- Create: `tests/fixtures/invalid/duplicate-language.json`
- Create: `tests/fixtures/invalid/duplicate-skill-slot.json`
- Create: `tests/fixtures/invalid/count-mismatch.json`

**Interfaces:**

- Consumes: approved Schemas, inventories, mappings, source fixtures, and successful asset observations from Task 5.
- Produces: `validateCanonicalDataset(dataset: CanonicalDataset): AuditFinding[]`.

- [ ] **Step 1: Write failing relationship tests**

Create `tests/data-contract/canonical-relations.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateCanonicalDataset } from '../../tools/data-audit/validate-canonical-dataset'

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

describe('canonical data relationships', () => {
  it('accepts the representative canonical dataset', () => {
    expect(
      validateCanonicalDataset({
        dataset: readJson('tests/fixtures/canonical/dataset.json'),
        officers: readJson('tests/fixtures/canonical/officers.json'),
        skills: readJson('tests/fixtures/canonical/skills.json'),
        dictionaries: readJson('tests/fixtures/canonical/dictionaries.json'),
        assets: readJson('tests/fixtures/canonical/assets.json'),
      }),
    ).toEqual([])
  })

  it.each([
    ['broken-skill-reference.json', 'DATA_REFERENCE_MISSING'],
    ['duplicate-language.json', 'DATA_LANGUAGE_DUPLICATE'],
    ['duplicate-skill-slot.json', 'DATA_SKILL_SLOT_DUPLICATE'],
    ['count-mismatch.json', 'DATA_COUNT_MISMATCH'],
  ])('rejects %s with %s', (fixture, code) => {
    const invalid = readJson<Parameters<typeof validateCanonicalDataset>[0]>(
      `tests/fixtures/invalid/${fixture}`,
    )
    expect(validateCanonicalDataset(invalid).map((finding) => finding.code)).toContain(code)
  })
})
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```powershell
npm.cmd test -- tests/data-contract/canonical-relations.test.ts
```

Expected: FAIL because the relationship validator and representative fixtures are incomplete.

- [ ] **Step 3: Implement cross-file validation**

Create `tools/data-audit/validate-canonical-dataset.ts` with a `CanonicalDataset` interface and deterministic checks for:

```ts
export interface CanonicalDataset {
  dataset: {
    counts: { officers: number; skills: number; assets: number; dictionaryItems: number }
  }
  officers: Array<{
    id: string
    languages: Array<{ languageId: string; level: number }>
    skills: Array<{
      skillId: string
      kind: 'active' | 'passive'
      sourceGroup: `sk${0 | 1 | 2 | 3 | 4 | 5}`
      slot: number
      unlockLevel: number
      level: number
    }>
    recruitment: {
      cityIds: string[]
      requirementId: string | null
      requiredOfficerIds: string[]
      note: string | null
    }
    portraitId: string
  }>
  skills: Array<{ id: string; categoryId: string; iconId: string }>
  dictionaries: Record<string, Array<{ id: string }>>
  assets: Array<{ id: string; ownerType: 'officer' | 'skill'; ownerId: string }>
}
```

Checks:

- Unique IDs within every entity and dictionary collection.
- All dictionary, skill, officer, and asset references exist.
- One language relationship per officer/language.
- One skill relationship per officer/sourceGroup/slot.
- Relationship `kind` and `categoryId` match the approved mapping.
- Dataset counts equal actual counts.
- No `alias` or `aliases` key at any depth.
- Findings sort by code, entity type, entity ID, and path.

- [ ] **Step 4: Normalize the eight officers**

Create canonical officers for exactly the selected source IDs. Use stable IDs such as `officer_chast089`, preserve `sourceRefs.voyageTw`, trim the trailing whitespace observed in the `chasT096` display name through an explicit derived-field rule, and represent empty source strings as the approved `null` or empty-array form.

For `chasT101`, do not treat `chasT051` inside the source `city` array as a city. Record it as a blocking source anomaly unless source evidence proves it is a misplaced prerequisite officer, then map it through the documented transform.

For `chasab001`, obtain the official Traditional Chinese name from the pinned language dictionary because inline `cht` is absent. Record this as a derived-field rule, not as an alias.

- [ ] **Step 5: Normalize the twenty skills and required dictionaries**

Create exactly twenty canonical skill records from the final post-asset-audit selection. Deduplicate shared skill IDs across officers. Each selected skill must have a successfully observed or source-indirection-resolved icon. Each skill must have:

- Stable internal ID.
- Official Traditional Chinese name.
- Official Traditional Chinese description.
- Approved category ID.
- Sampled icon asset ID only when the source asset was successfully retrieved.
- Source reference.

Create every dictionary item referenced by the eight officers and twenty skills. Do not include unrelated full-site dictionaries.

- [ ] **Step 6: Create the four isolated invalid datasets**

Each invalid fixture must copy the minimal valid dataset and introduce exactly one defect:

- Missing skill reference.
- Duplicate language ID in one officer.
- Duplicate source group and slot in one officer.
- Dataset count mismatch.

- [ ] **Step 7: Run Schema and relationship tests**

Run:

```powershell
npm.cmd test -- tests/data-contract/schema-validation.test.ts tests/data-contract/canonical-relations.test.ts
```

Expected: PASS; representative fixtures pass both layers and each invalid dataset fails only for its intended contract.

- [ ] **Step 8: Commit**

```powershell
git add tools/data-audit/validate-canonical-dataset.ts tests/data-contract/canonical-relations.test.ts tests/fixtures/canonical tests/fixtures/invalid
git commit -m "test: add canonical data contract fixtures"
```

---

### Task 7: Generate deterministic reports and add the Phase 2 gate

**Files:**

- Create: `tools/data-audit/render-audit-docs.ts`
- Create: `tools/data-audit/run-data-audit.ts`
- Create: `tests/data-audit/report-determinism.test.ts`
- Create: `docs/data-audit/source-field-inventory.md`
- Create: `docs/data-audit/source-enum-inventory.md`
- Create: `docs/data-audit/skill-group-mapping.md`
- Create: `docs/data-audit/audit-report-format.md`
- Create: `docs/data-audit/phase-2-audit-report.md`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-28-v1-implementation-roadmap.md`

**Interfaces:**

- Consumes: all Phase 2 audit JSON, Schemas, fixtures, and validators.
- Produces: `renderAuditDocs(input: AuditDocInput): Record<string, string>`, CLI scripts `data:audit:check`, `data:schema:check`, and `data:check`.

- [ ] **Step 1: Write failing report determinism tests**

Create `tests/data-audit/report-determinism.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { renderAuditDocs } from '../../tools/data-audit/render-audit-docs'

describe('audit reports', () => {
  it('sorts findings independently of input order', () => {
    const input = {
      fields: [],
      enums: [],
      mappings: [],
      assets: [],
      findings: [
        {
          severity: 'warning',
          code: 'Z',
          entityType: 'test',
          entityId: '2',
          path: '/b',
          observedValue: null,
          message: 'z',
          suggestedAction: 'review',
        },
        {
          severity: 'error',
          code: 'A',
          entityType: 'test',
          entityId: '1',
          path: '/a',
          observedValue: null,
          message: 'a',
          suggestedAction: 'fix',
        },
      ],
    }
    const reversed = { ...input, findings: [...input.findings].reverse() }
    expect(renderAuditDocs(input)).toEqual(renderAuditDocs(reversed))
  })

  it('contains no placeholder or alias field', () => {
    const output = Object.values(
      renderAuditDocs({ fields: [], enums: [], mappings: [], assets: [], findings: [] }),
    ).join('\n')
    expect(output).not.toMatch(/\b(?:TBD|TODO|FIXME)\b/)
    expect(output).not.toMatch(/^\|\s*(?:alias|aliases)\s*\|/m)
  })
})
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```powershell
npm.cmd test -- tests/data-audit/report-determinism.test.ts
```

Expected: FAIL because the renderer does not exist.

- [ ] **Step 3: Implement deterministic Markdown rendering**

Define `AuditDocInput` in `render-audit-docs.ts`:

```ts
import type { AuditFinding, SkillMappingRecord, SourceEnumValue, SourceFieldRecord } from './types'
import type { AssetObservation } from './collect-asset-metadata'

export interface AuditDocInput {
  fields: SourceFieldRecord[]
  enums: SourceEnumValue[]
  mappings: SkillMappingRecord[]
  assets: AssetObservation[]
  findings: AuditFinding[]
}
```

Implement `renderAuditDocs` so:

- Field rows sort by entity and source path.
- Enum rows sort by source path and source value.
- Mapping rows sort by `sk0`–`sk5`, then source category ID.
- Asset rows sort by owner type and source ID.
- Findings sort by severity, code, entity type, entity ID, and path.
- Output uses LF, UTF-8, and one final newline.
- Generated files contain concrete counts and no current-time value.

`audit-report-format.md` must document the stable finding fields:

```text
severity
code
entityType
entityId
path
observedValue
message
suggestedAction
```

- [ ] **Step 4: Implement the combined Phase 2 gate**

Create `tools/data-audit/run-data-audit.ts` that:

1. Loads all machine-readable audit inputs.
2. Runs inventory validation.
3. Runs skill mapping validation.
4. Runs all five JSON Schemas.
5. Runs canonical cross-file validation.
6. Confirms exactly eight officers and twenty skills.
7. Confirms no source read exceeded the byte limits.
8. Confirms all asset manifest entries have observations.
9. Writes deterministic Markdown reports.
10. Exits nonzero if any error finding exists.

Add scripts:

```json
{
  "scripts": {
    "data:audit:check": "tsx tools/data-audit/run-data-audit.ts --check",
    "data:schema:check": "vitest run tests/data-contract",
    "data:check": "npm run data:audit:check && npm run data:schema:check",
    "verify": "npm run format:check && npm run lint && npm run typecheck && npm test && npm run check:runtime-network && npm run data:check"
  }
}
```

- [ ] **Step 5: Generate and inspect the reports**

Run:

```powershell
npx.cmd tsx tools/data-audit/run-data-audit.ts --write
npm.cmd run data:check
```

Expected:

- `phase-2-audit-report.md` states eight officers, twenty skills, all six source groups covered, and the exact asset success/404 counts.
- Every field has one disposition.
- Every observed enum has a canonical ID.
- No mapping is unresolved.
- No alias field exists.
- The command prints `Phase 2 data audit: PASS`.

- [ ] **Step 6: Prove generated reports are deterministic**

Run:

```powershell
git diff --exit-code -- docs/data-audit
npx.cmd tsx tools/data-audit/run-data-audit.ts --write
git diff --exit-code -- docs/data-audit
```

Expected: both diff checks exit 0 after the first generated report set has been reviewed and staged.

- [ ] **Step 7: Document the local workflow and roadmap exit**

Update `README.md` with:

```powershell
npm.cmd run data:check
```

Document that sample capture is an explicit, networked maintainer operation, while `data:check` is fully local and consumes committed fixtures.

Update Phase 2 in the roadmap with links to the audit report and Schema directory. Do not mark Phase 3 started.

- [ ] **Step 8: Run the complete verification**

Run:

```powershell
npm.cmd run data:check
npm.cmd run verify
```

Expected:

- All data-audit and data-contract tests pass.
- Existing formatting, ESLint, TypeScript, Vitest, and runtime-network checks pass.
- Runtime code still contains no remote URL or network API.

- [ ] **Step 9: Self-review the Phase 2 deliverables**

Run:

```powershell
rg -n "TBD|TODO|FIXME|pending|unknown" data/audit data/schema docs/data-audit tests/fixtures
rg -n "\"aliases?\"|\\baliases?\\b" data/audit data/schema docs/data-audit tests/fixtures
git diff --check
git status --short
```

Expected:

- The placeholder scan returns no unresolved decision.
- Alias matches appear only in negative test fixtures or explicit prohibition prose.
- `git diff --check` exits 0.
- No `data/master` files exist.

- [ ] **Step 10: Commit**

```powershell
git add package.json package-lock.json README.md tools/data-audit data/audit data/schema tests/data-audit tests/data-contract tests/fixtures docs/data-audit docs/superpowers/plans/2026-07-28-v1-implementation-roadmap.md
git commit -m "docs: complete source audit and schema phase"
```

## Plan Self-Review

- Spec coverage: bounded source sampling, field dispositions, no aliases, `sk0`–`sk5` evidence, five Schemas, representative fixtures, asset observations, error reporting, cross-file validation, deterministic output, and Phase 2/3/4 boundaries each have a named task.
- Scope: the plan never creates `data/master`, never captures full source scripts, and never performs the full import or asset pipeline.
- Type consistency: `AuditFinding`, `SkillMappingRecord`, `CanonicalDataset`, Schema names, script names, and file paths are defined once and consumed consistently.
- TDD: every pure parser, validator, collector, and renderer starts with a failing focused test.
- No placeholder data is accepted as an end state; research outcomes must be evidence-backed and the combined gate rejects unresolved decisions.
