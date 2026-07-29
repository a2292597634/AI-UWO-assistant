# Task 3 report: audited skill-group mappings

Date: 2026-07-29

## Outcome

- Approved 10 exact `sourceGroup + sourceCategoryId` mappings covering all machine-observed pairs across `sk0`–`sk5`.
- All mapping rows have `status: approved`, non-empty representative skill IDs, concrete source/category/screenshot evidence, and stable semantic category IDs.
- `kind` remains relationship data only; the fixed skill entities contain no active/passive field.
- The strict validator rejects missing groups, duplicate/conflicting pairs, incomplete or unapproved evidence, missing evidence skills, evidence-category and evidence-group mismatches, missing selected relationship fixtures, unmapped selected relationships, and unresolved exact lookups.

## Discovery history and root cause

The original Task 3 plan incorrectly directed the bounded metadata search to `json.js?v=2026052501`. The selected skill objects were not there. The source's `skill_arr` is in the later dynamic section of `json_char.js?v=2026052501`, after the officer records.

The completed bounded discovery was reduced to the 13 exact successful 4 KiB metadata ranges referenced by the 20 fixed skills. Normal capture reads only those explicit non-contiguous ranges; it contains no dynamic scan and fetches none of the discarded discovery windows. With officer range `bytes=0-32767`, the `json_char.js` total is 86016 bytes. The three fixed `lang_1.js` ranges are `bytes=0-47237`, `bytes=47238-88188`, and `bytes=92126-178363`, totaling 174427 bytes. Both totals are below the per-file 192 KiB limit.

The final normal fixed capture ran once after pruning the discovery windows and succeeded with 8 officers and 20 skills. Its artifacts record exact `Content-Range`, `Last-Modified`, and SHA-256 values for 17 responses (1 officer, 13 skill metadata, and 3 language ranges). This recovery did not repeat network discovery.

## Minimal sample replacements

The original `sk1` skill and four original `sk4` skills have relationship and language text but no exact object in the bounded `skill_arr` segment. The inspected `map.js` evidence contains neither ID normalization nor a category fallback, so category values cannot be inferred.

- `skill509998406` → `skill509998139` in `sk1`, exact `menuskt19` metadata.
- `skillT0218` → `skill400973` in `sk4`, exact `menuskt18` metadata.
- `skillT0219` → `skill400974` in `sk4`, exact `menuskt18` metadata.
- `skillT0220` → `skill100063` in `sk4`, exact `menuskt18` metadata.
- `skillT0221` → `skill100064` in `sk4`, exact `menuskt18` metadata.
- `chasT090` → `chasab012`, the single minimal officer substitution that supplies two complete `sk4` examples while retaining eight-officer field/anomaly coverage.

All replacements and reasons are recorded in `data/audit/sample-selection.json`. Related enum inventory drift was limited to the observed country/job/language/city/requirement changes.

## Approved mapping decisions

| Source pair | Kind | Canonical category ID | Representative fixed evidence |
| --- | --- | --- | --- |
| `sk0 + menuskt1` | passive | `skill_category_trade_expertise` | `skill203826`; source label `交易用取引技`; learned trade effect in the game effect view |
| `sk0 + menuskt13` | passive | `skill_category_naval_passive_other` | `skill500436`; source label `海戰／被動（其他）` |
| `sk0 + menuskt16` | passive | `skill_category_adventure` | `skill200921`; source label `冒險相關技能`; adventure effect aggregation in the game view |
| `sk0 + menuskt2` | passive | `skill_category_trade_price_adjustment` | `skill200681`, `skill203306`, `skill203426`; source label and passive trade screenshot |
| `sk0 + menuskt3` | passive | `skill_category_barter` | `skill100043`, `skill100051`; source label and passive barter screenshot |
| `sk1 + menuskt19` | passive | `skill_category_innate_buff` | `skill509998139`; source label `天生效果／增益`; game view `天生效果` section |
| `sk2 + menuskt11` | active | `skill_category_naval_active_enhancement` | `skill400581`, `skill400591`, `skill400861`; source label `海戰／主動（強化系）` |
| `sk3 + menuskt22` | active | `skill_category_combat_other` | `skill300001`, `skill300004`; single combat-action slot and game combat-technique grouping |
| `sk4 + menuskt18` | active | `skill_category_admiral` | `skill100063`, `skill100064`, `skill400973`, `skill400974`; commander slots and timed battle actions |
| `sk5 + menuskt2` | passive | `skill_category_trade_price_adjustment` | `skillT0053`, `skillT0073`; exact image overrides, source label, and passive trade/professional-knowledge grouping |

The evidence strings in `data/audit/skill-group-mapping.json` name the exact fixture relationships, `skill_arr` categories, `lang_1.js` labels, and the relevant existing screenshots (`游戏内菜单图.png` and `游戏内被动技能查询截图.png`).

## Task 1/2 fixture synchronization

- Added fixed skill metadata fields: `sourceCategoryId`, `sourceCategoryName`, `imageOverrideId`, and `metadataSourceRange`.
- Added standalone `skills.json` and `source-metadata.json`; both exactly mirror the corresponding sections of `source-samples.json`.
- Updated the field inventory for string category IDs, human-review category labels, nullable image overrides, metadata range provenance, and the observed numeric/string `slv.*` forms.
- Updated the enum inventory for the minimal officer substitution.
- Updated capture tests so their fake fetcher returns complete fixed-range responses rather than depending on the pre-metadata request order.
- Removed the temporary `tools/data-audit/analyze-sk4-candidates.ts` discovery helper.

## TDD and verification evidence

RED history:

- Initial mapping run: 6 tests, 1 expected failure because `skill-group-mapping.json` was empty and all sampled exact pairs were unmapped.
- Added evidence-category negative test: 7 tests, 2 expected failures (missing `AUDIT_SKILL_MAPPING_SAMPLE_MISMATCH` plus the empty positive mapping fixture).
- Initial Task 1/2 focused run: 16 tests, 5 failures caused by stale range mocks and field-inventory drift.
- Reviewer wrong-group regression: the test failed once for the intended missing `AUDIT_SKILL_MAPPING_SAMPLE_GROUP_MISMATCH`, then passed after exact group indexing.
- Reviewer range and relationship-fixture regressions: 2 files/16 tests first had 2 expected failures (28 ranges instead of 13; silent missing fixture), then all 16 passed after the minimal fixes.

GREEN evidence after implementation and formatting:

- `npm.cmd test -- tests/data-audit/capture-source-samples.test.ts tests/data-contract/audit-inventory.test.ts tests/data-contract/audit-inventory-fix.test.ts tests/data-contract/skill-mapping.test.ts`: 4 files, 26 tests passed.
- `npm.cmd test`: 6 files, 34 tests passed inside the final aggregate verification.
- `npm.cmd run verify`: formatting, lint, typecheck, all 34 tests, and runtime network boundary passed.
- `git diff --check`: no whitespace errors.

No network scan, full source download, runtime network path, placeholder category, or unresolved mapping was introduced.

## Controller review fix round 1

- The public `SkillMappingInput` contract now requires `selectedSkillIds`.
- Relationship validation uses the complete eight-officer fixture but projects validation to the explicit selection boundary. A selected ID absent from `skills` still emits `AUDIT_SKILL_RELATIONSHIP_SAMPLE_MISSING`.
- Duplicate, unknown, and relationship-free selected IDs are blocking findings: `AUDIT_SKILL_SELECTION_DUPLICATE`, `AUDIT_SKILL_SELECTION_UNKNOWN`, and `AUDIT_SKILL_SELECTION_RELATIONSHIP_MISSING`.
- Mapping evidence validation continues to inspect the complete officer fixture, independently of relationship selection.
- The tests no longer privately prefilter officer relationships and now include a direct `AUDIT_SKILL_MAPPING_SAMPLE_MISSING` assertion.

Review-fix RED evidence:

- `npm.cmd test -- tests/data-contract/skill-mapping.test.ts`: 11 tests, 2 expected failures. The selection-contract test lacked all three selection findings, and the full eight-officer positive fixture produced 97 unselected relationship-missing findings.

Review-fix GREEN evidence:

- Focused skill-mapping suite: 11 tests passed.
- Combined Task 1-3 suite: 4 files, 28 tests passed.
- `npm.cmd run verify`: formatting, lint, typecheck, 6 files/36 tests, and runtime network boundary passed.
