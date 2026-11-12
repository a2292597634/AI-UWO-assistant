import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { inspectReleaseTarget, runReleaseTargetCli } from '../../tools/release/check-target'

const temporaryRoots: string[] = []
const script = resolve('tools/release/check-target.ts')
const tsx = resolve('node_modules/tsx/dist/cli.mjs')
const oldBranch = 'codex/phase-20261103-old-maintenance'

function git(root: string, args: string[]): string {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout.trim()
}

function fixture(target: 'old' | 'new' = 'new'): string {
  const root = mkdtempSync(join(tmpdir(), 'uwo-release-target-'))
  temporaryRoots.push(root)
  git(root, ['init', '-b', target === 'old' ? oldBranch : 'main'])
  writeFileSync(
    join(root, 'project.config.json'),
    JSON.stringify({ appid: target === 'old' ? 'wx8f961bcd8b26996a' : 'wxd0bc7afdc9cd334a' }),
  )
  git(root, ['add', 'project.config.json'])
  git(root, [
    '-c',
    'user.name=發布檢查測試',
    '-c',
    'user.email=release-test@example.invalid',
    '-c',
    'core.hooksPath=',
    'commit',
    '-m',
    '建立測試資料',
  ])
  return root
}

function check(root: string, target: 'old' | 'new' = 'new') {
  const report = inspectReleaseTarget(root, target)
  return { status: report.ready ? 0 : 1, report }
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('新端主線與舊端凍結的只讀發布檢查', () => {
  it('拒絕 Node 20、24，接受 Node 22', () => {
    const root = fixture()
    for (const version of ['20.19.0', '24.1.0']) {
      expect(inspectReleaseTarget(root, 'new', version).errors).toContain(
        'NODE_VERSION_UNSUPPORTED',
      )
    }
    expect(inspectReleaseTarget(root, 'new', '22.23.3').ready).toBe(true)
  })

  it('允許乾淨且帳號匹配的新端 main，不修改工作區', () => {
    const root = fixture()
    const before = readFileSync(join(root, 'project.config.json'), 'utf8')
    const result = check(root)
    expect(result.status).toBe(0)
    expect(result.report).toMatchObject({
      ready: true,
      target: 'new',
      branch: 'main',
      appid: 'wxd0bc7afdc9cd334a',
      frozen: false,
      cloudDeploymentAllowed: false,
    })
    expect(result.report.commit).toBe(git(root, ['rev-parse', 'HEAD']))
    expect(git(root, ['status', '--porcelain'])).toBe('')
    expect(readFileSync(join(root, 'project.config.json'), 'utf8')).toBe(before)
  })

  it('即使舊端帳號、分支及乾淨狀態正確，仍拒絕已凍結目標', () => {
    const root = fixture('old')
    const before = readFileSync(join(root, 'project.config.json'), 'utf8')
    expect(check(root, 'old').report).toMatchObject({
      ready: false,
      frozen: true,
      errors: ['OLD_TARGET_FROZEN'],
      cloudDeploymentAllowed: false,
    })
    expect(git(root, ['status', '--porcelain'])).toBe('')
    expect(readFileSync(join(root, 'project.config.json'), 'utf8')).toBe(before)
  })

  it.each(['codex/phase-20261102-miniprogram-migration', 'codex/phase-20261112-task'])(
    '新端拒絕非正式分支 %s',
    (branch) => {
      const root = fixture()
      git(root, ['checkout', '-b', branch])
      expect(check(root).report.errors).toEqual(['BRANCH_MISMATCH'])
    },
  )

  it('拒絕 detached HEAD', () => {
    const root = fixture()
    git(root, ['checkout', '--detach'])
    expect(check(root).report.errors).toEqual(['BRANCH_MISMATCH'])
  })

  it('拒絕舊帳號冒用新端，即使分支是 main', () => {
    const root = fixture('old')
    git(root, ['checkout', '-b', 'main'])
    expect(check(root).report.errors).toEqual(['APPID_MISMATCH'])
  })

  it('拒絕已追蹤修改及暫存修改', () => {
    const root = fixture()
    writeFileSync(join(root, 'project.config.json'), '{"appid":"wxd0bc7afdc9cd334a","test":1}')
    expect(check(root).report.errors).toEqual(['UNCOMMITTED_CHANGES'])
    git(root, ['add', 'project.config.json'])
    expect(check(root).report.errors).toEqual(['UNCOMMITTED_CHANGES'])
  })

  it('拒絕未追蹤文件', () => {
    const root = fixture()
    writeFileSync(join(root, 'untracked.txt'), '不可漏掉未提交候選')
    expect(check(root).report.errors).toEqual(['UNCOMMITTED_CHANGES'])
  })

  it('有相同帳號配置的普通子目錄仍不是 Git 根目錄', () => {
    const root = fixture()
    const nested = join(root, 'nested')
    mkdirSync(nested)
    writeFileSync(
      join(nested, 'project.config.json'),
      readFileSync(join(root, 'project.config.json')),
    )
    expect(check(nested).report.errors).toContain('NOT_PROJECT_ROOT')
  })

  it('拒絕 .git 目錄及不存在的路徑', () => {
    const root = fixture()
    expect(check(join(root, '.git')).report.ready).toBe(false)
    expect(check(join(root, 'missing')).report.errors).toContain('GIT_OR_PATH_UNAVAILABLE')
  })

  it.skipIf(process.platform !== 'win32').each(['lower', 'upper'])(
    'Windows 同一根目錄的 %s 大小寫路徑可用，dirty 仍拒絕',
    (casing) => {
      const root = fixture()
      const alias = casing === 'upper' ? root.toUpperCase() : root.toLowerCase()
      const result = inspectReleaseTarget(alias, 'new', '22.23.3')
      expect(result.errors).toEqual([])
      expect(result.ready).toBe(true)
      expect(statSync(result.projectRoot, { bigint: true }).ino).toBe(
        statSync(root, { bigint: true }).ino,
      )
      writeFileSync(join(root, 'untracked.txt'), '大小寫別名不能漏檢未提交文件')
      expect(inspectReleaseTarget(alias, 'new', '22.23.3').errors).toEqual(['UNCOMMITTED_CHANGES'])
    },
  )

  it.skipIf(process.platform !== 'win32')('Windows junction 可用，子目錄仍拒絕', () => {
    const root = fixture()
    const parent = mkdtempSync(join(tmpdir(), 'uwo-release-junction-'))
    temporaryRoots.push(parent)
    const alias = join(parent, 'project')
    symlinkSync(root, alias, 'junction')
    expect(check(alias).report.ready).toBe(true)
  })

  it('拒絕未知目標和多餘參數', () => {
    const root = fixture()
    expect(() => runReleaseTargetCli(['--target', 'other', '--project-root', root])).toThrow('用法')
    expect(() => runReleaseTargetCli(['--target', 'new', '--upload'])).toThrow('用法')
  })

  it('實際 CLI 輸出新端 JSON 並回傳成功退出碼', () => {
    const root = fixture()
    const result = spawnSync(
      process.execPath,
      [tsx, script, '--target', 'new', '--project-root', root],
      { encoding: 'utf8', timeout: 10_000 },
    )
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ ready: true, target: 'new', branch: 'main' })
  }, 15_000)

  it.each(['dirty', 'frozen'])('合法 CLI 參數遇到 %s 候選時必須回傳失敗碼', (reason) => {
    const target = reason === 'frozen' ? 'old' : 'new'
    const root = fixture(target)
    if (reason === 'dirty') writeFileSync(join(root, 'untracked.txt'), '未提交候選不可發布')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      expect(runReleaseTargetCli(['--target', target, '--project-root', root])).toBe(1)
      expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
        ready: false,
        errors: [reason === 'frozen' ? 'OLD_TARGET_FROZEN' : 'UNCOMMITTED_CHANGES'],
      })
    } finally {
      log.mockRestore()
    }
  })
})
