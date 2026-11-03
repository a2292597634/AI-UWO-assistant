import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { inspectReleaseTarget, runReleaseTargetCli } from '../../tools/release/check-target'

const temporaryRoots: string[] = []
const script = resolve('tools/release/check-target.ts')
const tsx = resolve('node_modules/tsx/dist/cli.mjs')
const oldBranch = 'codex/phase-20261103-old-maintenance'
const newBranch = 'codex/phase-20261102-miniprogram-migration'

function git(root: string, args: string[]): string {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout.trim()
}

function fixture(target: 'old' | 'new' = 'old'): string {
  const root = mkdtempSync(join(tmpdir(), 'uwo-release-target-'))
  temporaryRoots.push(root)
  git(root, ['init', '-b', target === 'old' ? oldBranch : newBranch])
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

function check(root: string, target: 'old' | 'new') {
  const report = inspectReleaseTarget(root, target)
  return { status: report.ready ? 0 : 1, report }
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('雙帳號只讀發布目標檢查', () => {
  it('拒絕 Node 20、24，接受 Node 22', () => {
    const root = fixture()
    expect(inspectReleaseTarget(root, 'old', '20.19.0').errors).toContain(
      'NODE_VERSION_UNSUPPORTED',
    )
    expect(inspectReleaseTarget(root, 'old', '24.1.0').errors).toContain('NODE_VERSION_UNSUPPORTED')
    expect(inspectReleaseTarget(root, 'old', '22.23.3').ready).toBe(true)
  })

  it('允許乾淨且帳號及分支匹配的舊端，不改工作區', () => {
    const root = fixture()
    const before = readFileSync(join(root, 'project.config.json'), 'utf8')
    const result = check(root, 'old')
    expect(result.status).toBe(0)
    expect(result.report).toMatchObject({
      ready: true,
      target: 'old',
      appid: 'wx8f961bcd8b26996a',
      cloudDeploymentAllowed: false,
    })
    expect(result.report.commit).toBe(git(root, ['rev-parse', 'HEAD']))
    expect(git(root, ['status', '--porcelain'])).toBe('')
    expect(readFileSync(join(root, 'project.config.json'), 'utf8')).toBe(before)
  })

  it('允許乾淨的新端', () => {
    expect(check(fixture('new'), 'new').report).toMatchObject({ ready: true, target: 'new' })
  })

  it('拒絕新端冒用舊端目標', () => {
    const result = check(fixture('new'), 'old')
    expect(result.status).toBe(1)
    expect(result.report.errors).toContain('APPID_MISMATCH')
    expect(result.report.errors).toContain('BRANCH_MISMATCH')
  })

  it('拒絕已追蹤修改及暫存修改', () => {
    const root = fixture()
    writeFileSync(join(root, 'project.config.json'), '{"appid":"wx8f961bcd8b26996a","test":1}')
    expect(check(root, 'old').report.errors).toContain('UNCOMMITTED_CHANGES')
    git(root, ['add', 'project.config.json'])
    expect(check(root, 'old').report.errors).toContain('UNCOMMITTED_CHANGES')
  })

  it('拒絕未追蹤文件', () => {
    const root = fixture()
    writeFileSync(join(root, 'untracked.txt'), '不可漏掉未提交候選')
    expect(check(root, 'old').report.errors).toContain('UNCOMMITTED_CHANGES')
  })

  it('拒絕 detached HEAD 及 main', () => {
    const root = fixture()
    git(root, ['checkout', '--detach'])
    expect(check(root, 'old').report.errors).toContain('BRANCH_MISMATCH')
    git(root, ['checkout', '-b', 'main'])
    expect(check(root, 'old').report.errors).toContain('BRANCH_MISMATCH')
  })

  it('拒絕不是 Git 根目錄的路徑', () => {
    const root = fixture()
    expect(check(join(root, '.git'), 'old').report.ready).toBe(false)
  })

  it('拒絕未知目標和多餘參數', () => {
    const root = fixture()
    expect(() => runReleaseTargetCli(['--target', 'other', '--project-root', root])).toThrow('用法')
    expect(() => runReleaseTargetCli(['--target', 'old', '--upload'])).toThrow('用法')
  })

  it('實際 CLI 輸出 JSON 並回傳成功退出碼', () => {
    const root = fixture()
    const result = spawnSync(
      process.execPath,
      [tsx, script, '--target', 'old', '--project-root', root],
      { encoding: 'utf8', timeout: 10_000 },
    )
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ ready: true, target: 'old' })
  }, 15_000)

  it('合法 CLI 參數遇到未提交候選時必須回傳失敗碼', () => {
    const root = fixture()
    writeFileSync(join(root, 'untracked.txt'), '未提交候選不可發布')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      expect(runReleaseTargetCli(['--target', 'old', '--project-root', root])).toBe(1)
      expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
        ready: false,
        errors: ['UNCOMMITTED_CHANGES'],
      })
    } finally {
      log.mockRestore()
    }
  })
})
