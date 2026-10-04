import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join, relative, sep } from 'node:path'
import { DATA_GENERATION_OUTPUT_PATHS } from './generated-output-paths'
import { buildGeneratedOutputs } from './generate'
import { fingerprintGenerationInputs } from './generation-input-paths'
import { assertSafeInputPath, readInputTree } from '../workflow/read-inputs'
export { fingerprintGenerationInputs } from './generation-input-paths'

export type GenerationCheckCode =
  | 'GENERATED_OUTPUT_DRIFT'
  | 'GENERATION_NONDETERMINISTIC'
  | 'GENERATION_INPUT_CHANGED'
  | 'GENERATION_BUILD_FAILED'
export interface GenerationCheckResult {
  status: 'passed' | 'failed'
  findings: Array<{ code: GenerationCheckCode; paths: string[]; message: string }>
}
const differences = (left: Map<string, string>, right: Map<string, string>): string[] =>
  [...new Set([...left.keys(), ...right.keys()])].filter((p) => left.get(p) !== right.get(p)).sort()

export function checkGeneratedOutputs(input: {
  projectRoot: string
  outputPaths: readonly string[]
  buildStage: (stageRoot: string) => void
  fingerprintInputs: () => string
}): GenerationCheckResult {
  const findings: GenerationCheckResult['findings'] = []
  const stages: string[] = []
  try {
    for (const p of input.outputPaths) assertSafeInputPath(input.projectRoot, p)
    const before = input.fingerprintInputs()
    for (let n = 0; n < 2; n++) {
      const stage = mkdtempSync(join(tmpdir(), 'uwo-generated-check-'))
      stages.push(stage)
      input.buildStage(stage)
    }
    if (before !== input.fingerprintInputs())
      findings.push({
        code: 'GENERATION_INPUT_CHANGED',
        paths: [],
        message: '檢查期間輸入變動，不能給出通過結論。',
      })
    const collect = (root: string, required: boolean) => {
      const files = new Map<string, string>()
      for (const p of input.outputPaths)
        for (const [name, digest] of readInputTree(root, p, required)) files.set(name, digest)
      return files
    }
    const first = collect(stages[0], true),
      second = collect(stages[1], true)
    const unstable = differences(first, second)
    if (unstable.length)
      findings.push({
        code: 'GENERATION_NONDETERMINISTIC',
        paths: unstable,
        message: '兩次暫存構建的完整產物集合不一致。',
      })
    else {
      const drift = differences(first, collect(input.projectRoot, false))
      if (drift.length)
        findings.push({
          code: 'GENERATED_OUTPUT_DRIFT',
          paths: drift,
          message: '候選產物與當前輸入的構建結果不一致；未覆寫候選。',
        })
    }
  } catch (error) {
    findings.push({
      code: 'GENERATION_BUILD_FAILED',
      paths: [...input.outputPaths],
      message: error instanceof Error ? error.message : String(error),
    })
  } finally {
    for (const stage of stages) {
      const child = relative(resolve(tmpdir()), resolve(stage))
      if (
        child &&
        !child.startsWith('..' + sep) &&
        !child.includes(sep) &&
        child.startsWith('uwo-generated-check-')
      )
        rmSync(stage, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    }
  }
  return { status: findings.length ? 'failed' : 'passed', findings }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/data-pipeline/check-generated.ts')) {
  const projectRoot = resolve('.')
  const result = checkGeneratedOutputs({
    projectRoot,
    outputPaths: DATA_GENERATION_OUTPUT_PATHS,
    buildStage: buildGeneratedOutputs,
    fingerprintInputs: () => fingerprintGenerationInputs({ projectRoot, env: process.env }),
  })
  for (const f of result.findings) console.error(f.code + '：' + f.message, f.paths)
  console.log('只讀生成檢查：' + result.status)
  process.exitCode = result.status === 'passed' ? 0 : 1
}
