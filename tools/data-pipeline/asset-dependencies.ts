import type { CanonicalOfficer, CanonicalSkill } from '../import/types'
import { writeFileSync } from 'node:fs'
import type {
  RuntimeAssetDependencyIndex,
  RuntimeAssetReference,
  RuntimeAssetRootDependency,
} from '../../miniprogram/contracts/runtime-data'

export const ASSET_GROUP_SIZE = 100
export const ASSET_ROOT_PREFIX = 'subpkg-assets-'

export type AssetRootDependency = RuntimeAssetRootDependency
export type AssetReference = RuntimeAssetReference
export type AssetDependencyIndex = RuntimeAssetDependencyIndex

interface AssetDependencyOptions {
  assetFilenames?: ReadonlySet<string>
}

const filenameForOfficer = (officerId: string): string => `${officerId}.png`
const filenameForSkill = (skillId: string): string => `${skillId}.png`

const unique = (values: readonly string[]): string[] => [...new Set(values)]

const groupRoot = (index: number): string =>
  `${ASSET_ROOT_PREFIX}${Math.floor(index / ASSET_GROUP_SIZE)}`

const rootForGroup = (groupIndex: number): AssetRootDependency => {
  const root = `${ASSET_ROOT_PREFIX}${groupIndex}`
  return {
    root,
    name: `assetsCatalog${groupIndex}`,
    officerIds: [],
    files: [],
  }
}

const addFirstOwner = (owners: Map<string, string>, filename: string, root: string): void => {
  if (!owners.has(filename)) owners.set(filename, root)
}

const firstAvailableByCategory = (
  skills: readonly CanonicalSkill[],
  assetFilenames: ReadonlySet<string>,
): Map<string, string> => {
  const fallback = new Map<string, string>()
  for (const skill of skills) {
    const filename = filenameForSkill(skill.id)
    if (assetFilenames.has(filename) && !fallback.has(skill.categoryId)) {
      fallback.set(skill.categoryId, filename)
    }
  }
  return fallback
}

const resolveSkillFilename = (
  skill: CanonicalSkill,
  assetFilenames: ReadonlySet<string>,
  categoryFallback: ReadonlyMap<string, string>,
): string | undefined => {
  const ownFilename = filenameForSkill(skill.id)
  if (assetFilenames.size === 0 || assetFilenames.has(ownFilename)) return ownFilename
  return categoryFallback.get(skill.categoryId)
}

const addRootReference = (
  roots: string[],
  pathToRoot: Readonly<Record<string, string>>,
  path: string,
): void => {
  const root = pathToRoot[path]
  if (root && !roots.includes(root)) roots.push(root)
}

/**
 * Build the deterministic mapping between generated image paths and asset roots.
 * The officer array is already the canonical directory order; no secondary sort
 * is performed here so data changes remain visible in the generated diff.
 */
export const buildAssetDependencyIndex = (
  officers: readonly CanonicalOfficer[],
  skills: readonly CanonicalSkill[],
  options: AssetDependencyOptions = {},
): AssetDependencyIndex => {
  const assetFilenames = options.assetFilenames ?? new Set<string>()
  const categoryFallback = firstAvailableByCategory(skills, assetFilenames)
  const skillFilenames = new Map(
    skills.map((skill) => [
      skill.id,
      resolveSkillFilename(skill, assetFilenames, categoryFallback),
    ]),
  )
  const ownerByFilename = new Map<string, string>()
  const roots = Array.from(
    { length: Math.max(1, Math.ceil(officers.length / ASSET_GROUP_SIZE)) },
    (_, index) => rootForGroup(index),
  )

  const catalogFilenamesByOfficer = new Map<string, string[]>()
  const detailFilenamesByOfficer = new Map<string, string[]>()

  for (const [index, officer] of officers.entries()) {
    const root = groupRoot(index)
    const group = roots[Math.floor(index / ASSET_GROUP_SIZE)]!
    group.officerIds.push(officer.id)

    const portraitFilename = filenameForOfficer(officer.id)
    const allSkillFilenames = officer.skills
      .map((relation) => skillFilenames.get(relation.skillId))
      .filter((filename): filename is string => Boolean(filename))
    const activeFilenames = officer.skills
      .filter((relation) => relation.kind === 'active')
      .slice(0, 3)
      .map((relation) => skillFilenames.get(relation.skillId))
      .filter((filename): filename is string => Boolean(filename))
    const passiveFilenames = officer.skills
      .filter((relation) => relation.kind === 'passive')
      .slice(0, 3)
      .map((relation) => skillFilenames.get(relation.skillId))
      .filter((filename): filename is string => Boolean(filename))
    const catalogFilenames = unique([portraitFilename, ...activeFilenames, ...passiveFilenames])
    const detailFilenames = unique([portraitFilename, ...allSkillFilenames])

    catalogFilenamesByOfficer.set(officer.id, catalogFilenames)
    detailFilenamesByOfficer.set(officer.id, detailFilenames)
    for (const filename of catalogFilenames) addFirstOwner(ownerByFilename, filename, root)
    for (const filename of detailFilenames) addFirstOwner(ownerByFilename, filename, root)
  }

  // The generated skill dictionary can be opened directly by the fleet page.
  // Give a skill not referenced by an officer a deterministic owner as well.
  const firstRoot = roots[0]!.root
  for (const filename of skillFilenames.values()) {
    if (filename) addFirstOwner(ownerByFilename, filename, firstRoot)
  }

  const pathToRoot: Record<string, string> = {}
  for (const [filename, root] of ownerByFilename) {
    const path = `/${root}/imgs/${filename}`
    pathToRoot[path] = root
    roots.find((candidate) => candidate.root === root)!.files.push(filename)
  }

  const makeReference = (filename: string): AssetReference => {
    const root = ownerByFilename.get(filename) ?? firstRoot
    return { path: `/${root}/imgs/${filename}`, root }
  }

  const skillIcons: Record<string, AssetReference> = {}
  for (const [skillId, filename] of skillFilenames) {
    if (filename) skillIcons[skillId] = makeReference(filename)
  }

  const officerPortraits: Record<string, AssetReference> = {}
  const officerCatalogRoots: Record<string, string[]> = {}
  const officerDetailRoots: Record<string, string[]> = {}
  for (const officer of officers) {
    officerPortraits[officer.id] = makeReference(filenameForOfficer(officer.id))
    const catalogRoots: string[] = []
    for (const filename of catalogFilenamesByOfficer.get(officer.id) ?? []) {
      addRootReference(catalogRoots, pathToRoot, makeReference(filename).path)
    }
    const detailRoots: string[] = []
    for (const filename of detailFilenamesByOfficer.get(officer.id) ?? []) {
      addRootReference(detailRoots, pathToRoot, makeReference(filename).path)
    }
    officerCatalogRoots[officer.id] = unique(catalogRoots)
    officerDetailRoots[officer.id] = unique(detailRoots)
  }

  return {
    roots,
    pathToRoot,
    skillIcons,
    officerPortraits,
    officerCatalogRoots,
    officerDetailRoots,
  }
}

export const writeAssetDependencyIndex = (
  index: AssetDependencyIndex,
  outputPath: string,
): void => {
  writeFileSync(outputPath, `${JSON.stringify(index)}\n`)
}

export const assertAssetDependencyIndex = (index: AssetDependencyIndex): void => {
  const roots = new Set(index.roots.map((root) => root.root))
  const ownerByFilename = new Map<string, string>()

  for (const root of index.roots) {
    for (const filename of root.files) {
      if (ownerByFilename.has(filename)) throw new Error(`duplicate asset file: ${filename}`)
      ownerByFilename.set(filename, root.root)
      const path = `/${root.root}/imgs/${filename}`
      if (index.pathToRoot[path] !== root.root) {
        throw new Error(`asset path ownership mismatch: ${path}`)
      }
    }
  }

  for (const [path, root] of Object.entries(index.pathToRoot)) {
    if (!roots.has(root)) throw new Error(`asset path references unknown root: ${path}`)
    const filename = path.split('/').pop() ?? ''
    if (ownerByFilename.get(filename) !== root) {
      throw new Error(`asset path points to missing file: ${path}`)
    }
  }

  const assertReference = (reference: AssetReference): void => {
    if (!roots.has(reference.root) || index.pathToRoot[reference.path] !== reference.root) {
      throw new Error(`asset reference points to missing file: ${reference.path}`)
    }
  }
  for (const reference of Object.values(index.skillIcons)) assertReference(reference)
  for (const reference of Object.values(index.officerPortraits)) assertReference(reference)

  const assertRootList = (rootList: readonly string[]): void => {
    for (const root of rootList) {
      if (!roots.has(root)) throw new Error(`asset dependency references unknown root: ${root}`)
    }
  }
  for (const rootList of Object.values(index.officerCatalogRoots)) assertRootList(rootList)
  for (const rootList of Object.values(index.officerDetailRoots)) assertRootList(rootList)
}
