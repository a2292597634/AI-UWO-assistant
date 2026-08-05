import type { AssetDependencyIndex } from '../data-pipeline/asset-dependencies'

export interface AssetPackageLayoutInput {
  dependencies: AssetDependencyIndex
  sourceFiles: readonly string[]
  existingOutputFiles: readonly string[]
}

export interface AssetPackageLayout {
  roots: Array<{ root: string; files: string[] }>
  retainedFiles: string[]
  staleFiles: string[]
  missingFiles: string[]
}

/**
 * Plan a complete asset output from the generated dependency index.
 * A file is assigned to the first root in the index and never duplicated.
 */
export const planAssetPackageLayout = ({
  dependencies,
  sourceFiles,
  existingOutputFiles,
}: AssetPackageLayoutInput): AssetPackageLayout => {
  const sourceSet = new Set(sourceFiles)
  const referencedFiles = new Set(dependencies.roots.flatMap((root) => root.files))
  const retainedFiles = [...referencedFiles].filter((filename) => sourceSet.has(filename))
  const missingFiles = [...referencedFiles].filter((filename) => !sourceSet.has(filename))
  const staleFiles = existingOutputFiles.filter((filename) => !referencedFiles.has(filename))
  const assigned = new Set<string>()

  const roots = dependencies.roots.map(({ root, files }) => ({
    root,
    files: files.filter((filename) => {
      if (!sourceSet.has(filename) || assigned.has(filename)) return false
      assigned.add(filename)
      return true
    }),
  }))

  return { roots, retainedFiles, staleFiles, missingFiles }
}
