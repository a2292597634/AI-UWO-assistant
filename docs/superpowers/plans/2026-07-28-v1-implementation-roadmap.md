# UWO Assistant V1 Implementation Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each phase plan task-by-task.

**Goal:** Deliver the confirmed Traditional Chinese, fully local Uncharted Waters Origin officer catalog as a sequence of independently testable phases.

**Architecture:** Keep the immutable voyage.tw snapshot, editable canonical data, and generated mini-program runtime data as separate layers. Complete platform and package-feasibility work before committing the UI to an asset-loading strategy.

**Tech Stack:** Native WeChat Mini Program, TypeScript, Vitest, ESLint, Prettier, Node.js data tools, local Git

## Global Constraints

- Native WeChat Mini Program with TypeScript.
- Traditional Chinese display and search content only in V1.
- No login, cloud database, remote image URL, `wx.request`, hosted backend, or paid runtime service.
- All business data, portraits, rarity art, and skill icons ship locally.
- Canonical data under `data/master` is the only editable source of truth.
- Generated runtime data must never be edited manually.
- Feature and data logic follows TDD.
- Every phase ends with `npm run verify` and a focused Git commit.

---

## Phase Order

1. **Development foundation and TypeScript migration**
   - Plan: `docs/superpowers/plans/2026-07-28-development-foundation.md`
   - Exit: clean `miniprogram/` source root, TypeScript compilation enabled, lint/format/typecheck/test commands passing, no template login or remote avatar code.
2. **Source audit and canonical schema**
   - Exit: a field inventory, audited `sk0`–`sk5` mapping, schemas for officers/skills/dictionaries/assets, and representative fixtures.
3. **One-time voyage.tw importer**
   - Exit: reproducible source snapshot, provenance manifest, complete record-accounting report, and validated canonical candidate data.
4. **Local asset pipeline and package experiment**
   - Exit: deterministic optimized assets, rarity overlays, package-budget report, and verified portrait loading in DevTools, Android, and iOS.
5. **Runtime projection and query engine**
   - Exit: generated catalog/index/detail shards and tested AND/OR/ALL filter semantics with deterministic ordering.
6. **Mini-program catalog experience**
   - Exit: module-port home, dense officer catalog, four-page filter flow, skill sheet, reverse lookup, and skill-first detail page.
7. **Release verification**
   - Exit: all automated checks pass; record counts, package budgets, offline-data constraints, Android, iOS, and DevTools core flows are signed off.

## Dependency Rules

- Phase 2 consumes the Phase 1 toolchain.
- Phase 3 cannot start full import until Phase 2 has no unresolved source-field or skill-kind mapping.
- Phase 4 must finish its cross-subpackage image experiment before production catalog rows are finalized.
- Phase 5 consumes only validated canonical data and generated asset manifests.
- Phase 6 consumes Phase 5 public query interfaces and must not read `data/master` directly.
- Phase 7 cannot waive failed data-accounting, missing-image, or package-budget checks.
