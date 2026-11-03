import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

const targets = {
  old: { appid: 'wx8f961bcd8b26996a', branch: 'codex/phase-20261103-old-maintenance' },
  new: { appid: 'wxd0bc7afdc9cd334a', branch: 'codex/phase-20261102-miniprogram-migration' },
} as const

/** 只檢查帳號及 Git 候選，不修改工作區，也不代表功能或平台驗收通過。 */
export function inspectReleaseTarget(
  projectRoot: string,
  target: 'old' | 'new',
  nodeVersion = process.versions.node,
) {
  const errors: string[] = []
  const expected = targets[target]
  let root = projectRoot
  let appid = ''
  let branch = ''
  let commit = ''
  if (Number(nodeVersion.split('.')[0]) !== 22) errors.push('NODE_VERSION_UNSUPPORTED')
  try {
    root = realpathSync(projectRoot)
    const git = (...args: string[]) =>
      execFileSync('git', ['--no-optional-locks', '-C', root, ...args], {
        encoding: 'utf8',
        timeout: 10_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim()
    if (realpathSync(git('rev-parse', '--show-toplevel')) !== root) errors.push('NOT_PROJECT_ROOT')
    branch = git('branch', '--show-current')
    commit = git('rev-parse', '--verify', 'HEAD')
    if (branch !== expected.branch) errors.push('BRANCH_MISMATCH')
    if (git('status', '--porcelain', '--untracked-files=all')) errors.push('UNCOMMITTED_CHANGES')
    try {
      appid = JSON.parse(readFileSync(join(root, 'project.config.json'), 'utf8')).appid
      if (appid !== expected.appid) errors.push('APPID_MISMATCH')
    } catch {
      errors.push('PROJECT_CONFIG_INVALID')
    }
  } catch {
    errors.push('GIT_OR_PATH_UNAVAILABLE')
  }
  return {
    ready: errors.length === 0,
    target,
    projectRoot: root,
    appid,
    branch,
    commit,
    expected,
    errors,
    cloudDeploymentAllowed: false,
    notice: '僅為只讀帳號與提交檢查；仍須完整驗證及頁面驗收。共享雲函數不得由舊分支覆蓋部署。',
  }
}

export function runReleaseTargetCli(args: string[]): number {
  if (
    args.length !== 4 ||
    args[0] !== '--target' ||
    !['old', 'new'].includes(args[1]) ||
    args[2] !== '--project-root' ||
    !args[3]
  )
    throw new Error('用法：check-target.ts --target old|new --project-root 絕對工程路徑')
  const report = inspectReleaseTarget(args[3], args[1] as 'old' | 'new')
  console.log(JSON.stringify(report, null, 2))
  return report.ready ? 0 : 1
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/release/check-target.ts')) {
  try {
    process.exitCode = runReleaseTargetCli(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
