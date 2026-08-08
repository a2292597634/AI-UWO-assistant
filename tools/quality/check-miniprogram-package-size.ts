import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join, relative } from 'node:path'

// ── Constants ──────────────────────────────────────────────

const MEDIA_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.mp4',
  '.mov',
  '.avi',
  '.webm',
  '.mp3',
  '.wav',
])

const EXCLUDED_DIRS = new Set(['node_modules', '.git', '.worktrees', '.superpowers'])
const SOURCE_ONLY_EXTENSIONS = new Set(['.ts', '.tsx'])

export const DEFAULT_MAX_MAIN_PACKAGE_BYTES = 1.9 * 1024 * 1024
const DEFAULT_ALLOWED_LOCAL_MEDIA_ROOTS = ['assets/ui/']

// ── Types ──────────────────────────────────────────────────

export interface MiniProgramConfig {
  miniprogramRoot: string
  subpackageRoots: string[]
}

export interface FileEntry {
  path: string
  bytes: number
}

export interface PackageSizeReport {
  mainPackageBytes: number
  mainPackageFiles: number
  disallowedMedia: string[]
  largestFiles: FileEntry[]
}

// ── Config reader ──────────────────────────────────────────

export function readMiniProgramConfig(projectRoot: string): MiniProgramConfig {
  const projectConfig = JSON.parse(
    readFileSync(join(projectRoot, 'project.config.json'), 'utf8'),
  ) as { miniprogramRoot?: string }
  const miniprogramRoot = (projectConfig.miniprogramRoot ?? 'miniprogram/').replace(/\/$/, '')

  const appJson = JSON.parse(
    readFileSync(join(projectRoot, miniprogramRoot, 'app.json'), 'utf8'),
  ) as { subpackages?: Array<{ root: string }> }
  const subpackageRoots = (appJson.subpackages ?? []).map((sp) => sp.root.replace(/\/$/, ''))

  return { miniprogramRoot, subpackageRoots }
}

// ── Helpers ────────────────────────────────────────────────

function isMediaFile(filename: string): boolean {
  const dot = filename.lastIndexOf('.')
  if (dot === -1) return false
  return MEDIA_EXTENSIONS.has(filename.slice(dot).toLowerCase())
}

function isSourceOnlyFile(filename: string): boolean {
  const dot = filename.lastIndexOf('.')
  if (dot === -1) return false
  return SOURCE_ONLY_EXTENSIONS.has(filename.slice(dot).toLowerCase())
}

function walkDir(dir: string, basePath: string): { files: FileEntry[]; mediaFiles: FileEntry[] } {
  const files: FileEntry[] = []
  const mediaFiles: FileEntry[] = []

  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return { files, mediaFiles }
  }

  for (const name of entries) {
    if (EXCLUDED_DIRS.has(name)) continue
    const fullPath = join(dir, name)
    const stats = statSync(fullPath)

    if (stats.isDirectory()) {
      const sub = walkDir(fullPath, basePath)
      files.push(...sub.files)
      mediaFiles.push(...sub.mediaFiles)
    } else {
      if (isSourceOnlyFile(name)) continue
      const relPath = relative(basePath, fullPath).replace(/\\/g, '/')
      const entry_ = { path: relPath, bytes: stats.size }
      files.push(entry_)
      if (isMediaFile(name)) {
        mediaFiles.push(entry_)
      }
    }
  }

  return { files, mediaFiles }
}

// ── Analyzer ───────────────────────────────────────────────

export function analyzeMiniProgramPackage(input: {
  projectRoot: string
  miniprogramRoot: string
  subpackageRoots: readonly string[]
}): PackageSizeReport {
  const miniprogramDir = join(input.projectRoot, input.miniprogramRoot)
  const subpackagePrefixes = input.subpackageRoots.map((r) => r + '/')

  const { files, mediaFiles } = walkDir(miniprogramDir, miniprogramDir)

  const mainPackageFiles = files.filter(
    (f) => !subpackagePrefixes.some((prefix) => f.path.startsWith(prefix)),
  )

  const mainPackageMedia = mediaFiles.filter(
    (f) => !subpackagePrefixes.some((prefix) => f.path.startsWith(prefix)),
  )

  const mainPackageBytes = mainPackageFiles.reduce((sum, f) => sum + f.bytes, 0)

  const disallowedMedia = mainPackageMedia
    .filter((f) => !DEFAULT_ALLOWED_LOCAL_MEDIA_ROOTS.some((allowed) => f.path.startsWith(allowed)))
    .map((f) => f.path)

  const largestFiles = [...mainPackageFiles].sort((a, b) => b.bytes - a.bytes).slice(0, 20)

  return {
    mainPackageBytes,
    mainPackageFiles: mainPackageFiles.length,
    disallowedMedia,
    largestFiles,
  }
}

// ── Budget assertion ───────────────────────────────────────

export function assertMiniProgramPackageBudget(
  report: PackageSizeReport,
  options?: {
    maxMainPackageBytes?: number
    allowedLocalMediaRoots?: readonly string[]
  },
): void {
  const maxBytes = options?.maxMainPackageBytes ?? DEFAULT_MAX_MAIN_PACKAGE_BYTES
  const allowedRoots = options?.allowedLocalMediaRoots ?? DEFAULT_ALLOWED_LOCAL_MEDIA_ROOTS

  const effectiveDisallowed = report.disallowedMedia.filter(
    (f) => !allowedRoots.some((allowed) => f.startsWith(allowed)),
  )

  const errors: string[] = []

  if (report.mainPackageBytes > maxBytes) {
    errors.push(
      `Main package ${(report.mainPackageBytes / 1024).toFixed(1)}KB exceeds ${(maxBytes / 1024).toFixed(1)}KB budget`,
    )
  }

  if (effectiveDisallowed.length > 0) {
    errors.push(`Disallowed media: ${effectiveDisallowed.join(', ')}`)
  }

  if (errors.length > 0) {
    throw new Error(errors.join('; '))
  }
}

// ── CLI ────────────────────────────────────────────────────

function main(): void {
  const projectRoot = process.argv[2] ?? '.'
  const config = readMiniProgramConfig(projectRoot)
  const report = analyzeMiniProgramPackage({
    projectRoot,
    miniprogramRoot: config.miniprogramRoot,
    subpackageRoots: config.subpackageRoots,
  })

  try {
    assertMiniProgramPackageBudget(report)
  } catch (err) {
    console.error((err as Error).message)
    if (report.largestFiles.length > 0) {
      console.error('Largest files in main package:')
      for (const f of report.largestFiles.slice(0, 10)) {
        console.error(`  ${f.path} (${(f.bytes / 1024).toFixed(1)}KB)`)
      }
    }
    process.exit(1)
  }

  console.log(
    `Main package: ${(report.mainPackageBytes / 1024).toFixed(1)}KB, ${report.mainPackageFiles} files`,
  )
  if (report.largestFiles.length > 0) {
    console.log('Largest files:')
    for (const f of report.largestFiles.slice(0, 5)) {
      console.log(`  ${f.path} (${(f.bytes / 1024).toFixed(1)}KB)`)
    }
  }
  console.log('Miniprogram package size: PASS')
}

const runningScript = basename(process.argv[1] ?? '')
if (
  runningScript === 'check-miniprogram-package-size.ts' ||
  runningScript === 'check-miniprogram-package-size'
) {
  main()
}
