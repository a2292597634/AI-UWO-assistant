/**
 * Type declarations for generated CommonJS runtime data modules.
 *
 * These modules are produced by tools/data-pipeline/generate.ts and
 * consumed via static `require()` in the mini program runtime stores.
 * The `.d.ts` provides minimal type information for TypeScript compilation
 * without pulling the large data files into the type checker.
 */

declare module '../../generated/dataset-meta' {
  interface DatasetMeta {
    officerCount: number
    skillCount: number
    contentVersion: string
    updatedAt: string
    sourceSnapshot: string
  }
  const meta: DatasetMeta
  export = meta
}

declare module '../../generated/catalog' {
  interface CatalogEntry {
    id: string
    name: string
    rarityId: string
    rarityName: string
    rarityClass: string
    typeId: string
    typeName: string
    genderId: string
    genderLabel: string
    jobId: string
    jobName: string
    portraitPath: string
    languages: string[]
    activeSkills: string[]
    passiveSkills: string[]
    skillLevels?: Record<string, number>
    skillUnlockLevels?: Record<string, number>
    searchAliases: string[]
    activeSkillIcons?: Record<string, string>
    passiveSkillIcons?: Record<string, string>
    portraitFail?: boolean
  }
  const catalog: CatalogEntry[]
  export = catalog
}

declare module '../../generated/skills' {
  interface RuntimeSkill {
    id: string
    n: string
    cat: string
    cn: string
    ip: string
    d: string
    li: string
  }
  const skills: Record<string, RuntimeSkill>
  export = skills
}

declare module '../trade-goods' {
  interface TradeGoodIndexEntry {
    id: string
    name: string
    categoryId: string
    categoryName: string
    rank: number | null
    salesMode: 'fixed-port' | 'barter' | 'special'
    salesPortCount: number
    peakSeasonIds: string[]
    lowSeasonIds: string[]
    searchAliases: string[]
  }
  const tradeGoods: TradeGoodIndexEntry[]
  export = tradeGoods
}

declare module '../trade-reference' {
  interface TradeReference {
    tradeTypes: Array<{
      id: string
      name: string
      peakSeasonIds: string[]
      lowSeasonIds: string[]
    }>
    ports: Array<{
      id: string
      name: string
      regionName: string | null
      seasonProfileId: string
    }>
    seasonProfiles: Array<{ id: string; monthSeasonIds: string[] }>
    seasonNames: Record<string, string>
    glyphs: {
      season: Record<string, string>
      status: { peak: string; low: string; normal: string }
    }
  }
  const reference: TradeReference
  export = reference
}

declare module '../../generated/dictionaries' {
  interface DictItem {
    id: string
    name: string
  }
  interface Dictionaries {
    rarities: DictItem[]
    types: DictItem[]
    genders: DictItem[]
    jobs: DictItem[]
    languages: DictItem[]
    skillCategories: DictItem[]
  }
  const dicts: Dictionaries
  export = dicts
}

declare module '../detail-index' {
  const index: Record<string, number>
  export = index
}

declare module '../detail-loaders' {
  function loadDetail(id: string, index: Record<string, number>): Record<string, unknown> | null
  export = loadDetail
}

declare module '../trade-detail-index' {
  const index: Record<string, number>
  export = index
}

declare module '../trade-detail-loaders' {
  function loadDetail(id: string, index: Record<string, number>): Record<string, unknown> | null
  export = loadDetail
}
