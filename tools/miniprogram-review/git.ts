import { execFileSync } from 'node:child_process'

import { normalizeRepoPath } from './trigger'

export interface GitCommandRunner {
  (cwd: string, args: string[]): string
}

const defaultRunner: GitCommandRunner = (cwd, args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' })

export const parseGitNameList = (output: string): string[] => {
  const paths: string[] = []
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      paths.push(normalizeRepoPath(line))
    } catch {
      // Git 路径异常时不将其当作页面变更，避免触发器越界读取仓库外文件。
    }
  }
  return [...new Set(paths)].sort((left, right) => left.localeCompare(right))
}

export const readGitChangedFiles = (
  cwd: string,
  runCommand: GitCommandRunner = defaultRunner,
): string[] => {
  const outputs = [
    runCommand(cwd, ['diff', '--name-only']),
    runCommand(cwd, ['diff', '--cached', '--name-only']),
    runCommand(cwd, ['ls-files', '--others', '--exclude-standard']),
  ]
  return [...new Set(outputs.flatMap(parseGitNameList))].sort((left, right) =>
    left.localeCompare(right),
  )
}
