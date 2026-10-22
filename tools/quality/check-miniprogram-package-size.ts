import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { transformSync, version as esbuildVersion } from 'esbuild'

// ── 常數 ────────────────────────────────────────────────────

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
export const PACKAGE_SIZE_SAFETY_MARGIN_BYTES = 32 * 1024
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
  staticBytes: number
  compiledTsBytes: number
  safetyMarginBytes: number
  estimatedMainPackageBytes: number
  compilation: {
    typescriptVersion: string
    esbuildVersion: string
    target: 'ES2020'
    module: 'CommonJS'
    minified: boolean
    charset: 'ascii' | 'utf8'
  }
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

  // 讀取失敗必須終止，不能把不可讀目錄估算為零。
  const entries = readdirSync(dir)

  for (const name of entries) {
    if (EXCLUDED_DIRS.has(name)) continue
    const fullPath = join(dir, name)
    const stats = statSync(fullPath)

    if (stats.isDirectory()) {
      const sub = walkDir(fullPath, basePath)
      files.push(...sub.files)
      mediaFiles.push(...sub.mediaFiles)
    } else {
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

function assertTypeScriptCompiles(projectRoot: string, files: string[]): void {
  if (files.length === 0) return
  const configPath = join(projectRoot, 'tsconfig.json')
  let compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    types: [],
    skipLibCheck: true,
  }
  const diagnostics: ts.Diagnostic[] = []
  if (existsSync(configPath)) {
    const config = ts.readConfigFile(configPath, ts.sys.readFile)
    if (config.error) diagnostics.push(config.error)
    else {
      const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, resolve(projectRoot))
      compilerOptions = parsed.options
      diagnostics.push(...parsed.errors)
    }
  }
  const program = ts.createProgram(
    files.map((file) => resolve(file)),
    {
      ...compilerOptions,
      noEmit: true,
    },
  )
  diagnostics.push(...ts.getPreEmitDiagnostics(program))
  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  )
  if (errors.length > 0) {
    throw new Error(
      `TS 編譯估算失敗：${errors
        .map((error) => {
          const file = error.file ? relative(projectRoot, error.file.fileName) : 'tsconfig.json'
          return `${file}: ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`
        })
        .join('; ')}`,
    )
  }
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

  const projectConfig = JSON.parse(
    readFileSync(join(input.projectRoot, 'project.config.json'), 'utf8'),
  ) as {
    setting?: { minified?: boolean }
  }
  const privateConfigPath = join(input.projectRoot, 'project.private.config.json')
  const privateConfig = existsSync(privateConfigPath)
    ? (JSON.parse(readFileSync(privateConfigPath, 'utf8')) as { setting?: { minified?: boolean } })
    : undefined
  const minified = (privateConfig?.setting?.minified ?? projectConfig.setting?.minified) === true
  const tsFiles = mainPackageFiles.filter(
    (file) => isSourceOnlyFile(file.path) && !/\.d\.(?:ts|tsx)$/i.test(file.path),
  )
  assertTypeScriptCompiles(
    input.projectRoot,
    tsFiles.map((file) => join(miniprogramDir, file.path)),
  )
  const compiledPaths = new Set(tsFiles.map((file) => file.path.replace(/\.tsx?$/i, '.js')))
  // TS 是實際編譯輸入；同名 JS 視作已編譯副本，只統計本次重新編譯的 JS。
  const staticFiles = mainPackageFiles.filter(
    (file) => !isSourceOnlyFile(file.path) && !compiledPaths.has(file.path),
  )
  const compiledFiles = tsFiles.map((file): FileEntry => {
    const source = readFileSync(join(miniprogramDir, file.path), 'utf8')
    const result = ts.transpileModule(source, {
      fileName: file.path,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        removeComments: minified,
        jsx: ts.JsxEmit.React,
      },
    })
    const errors =
      result.diagnostics?.filter(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
      ) ?? []
    if (errors.length > 0) {
      throw new Error(
        `${file.path}: TS 編譯估算失敗：${errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('; ')}`,
      )
    }
    // 讓成熟 parser 驗證輸出；字串、正則與巢狀模板不可用正則刪空白估算。
    const output = transformSync(result.outputText, {
      sourcefile: file.path,
      loader: 'js',
      target: 'es2020',
      format: 'cjs',
      minify: minified,
      charset: 'ascii',
      legalComments: minified ? 'none' : 'inline',
      sourcemap: false,
    }).code
    // 未啟用壓縮時直接計入 TS 原始編譯輸出，保留普通註釋與排版。
    return {
      path: file.path.replace(/\.tsx?$/i, '.js'),
      bytes: Buffer.byteLength(minified ? output : result.outputText, 'utf8'),
    }
  })

  const mainPackageMedia = mediaFiles.filter(
    (f) => !subpackagePrefixes.some((prefix) => f.path.startsWith(prefix)),
  )

  const staticBytes = staticFiles.reduce((sum, f) => sum + f.bytes, 0)
  const compiledTsBytes = compiledFiles.reduce((sum, f) => sum + f.bytes, 0)
  const mainPackageBytes = staticBytes + compiledTsBytes
  const estimatedMainPackageBytes = mainPackageBytes + PACKAGE_SIZE_SAFETY_MARGIN_BYTES

  const disallowedMedia = mainPackageMedia
    .filter((f) => !DEFAULT_ALLOWED_LOCAL_MEDIA_ROOTS.some((allowed) => f.path.startsWith(allowed)))
    .map((f) => f.path)

  const largestFiles = [...staticFiles, ...compiledFiles]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 20)

  return {
    mainPackageBytes,
    mainPackageFiles: staticFiles.length + compiledFiles.length,
    disallowedMedia,
    largestFiles,
    staticBytes,
    compiledTsBytes,
    safetyMarginBytes: PACKAGE_SIZE_SAFETY_MARGIN_BYTES,
    estimatedMainPackageBytes,
    compilation: {
      typescriptVersion: ts.version,
      esbuildVersion,
      target: 'ES2020',
      module: 'CommonJS',
      minified,
      charset: minified ? 'ascii' : 'utf8',
    },
  }
}

// ── Budget assertion ───────────────────────────────────────

export function assertMiniProgramPackageBudget(
  report: Pick<PackageSizeReport, 'mainPackageBytes' | 'disallowedMedia'> &
    Partial<PackageSizeReport>,
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

  const budgetBytes = report.estimatedMainPackageBytes ?? report.mainPackageBytes
  if (budgetBytes > maxBytes) {
    errors.push(
      `Main package ${(budgetBytes / 1024).toFixed(1)}KB exceeds ${(maxBytes / 1024).toFixed(1)}KB budget`,
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

  console.log('本地編譯壓縮估算（非 DevTools 真包）')
  console.log(
    JSON.stringify({
      staticBytes: report.staticBytes,
      compiledTsBytes: report.compiledTsBytes,
      safetyMarginBytes: report.safetyMarginBytes,
      estimatedMainPackageBytes: report.estimatedMainPackageBytes,
      fileCount: report.mainPackageFiles,
      compilation: report.compilation,
    }),
  )

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
    `主包檔案估算：${(report.mainPackageBytes / 1024).toFixed(1)}KiB，${report.mainPackageFiles} 個檔案；含預留：${(report.estimatedMainPackageBytes / 1024).toFixed(1)}KiB`,
  )
  if (report.largestFiles.length > 0) {
    console.log('Largest files:')
    for (const f of report.largestFiles.slice(0, 5)) {
      console.log(`  ${f.path} (${(f.bytes / 1024).toFixed(1)}KB)`)
    }
  }
  console.log('Miniprogram package size estimate: PASS（含 32KiB 工程預留，非誤差上界）')
}

const runningScript = basename(process.argv[1] ?? '')
if (
  runningScript === 'check-miniprogram-package-size.ts' ||
  runningScript === 'check-miniprogram-package-size'
) {
  main()
}
