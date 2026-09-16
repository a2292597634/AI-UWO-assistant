import { describe, expect, it } from 'vitest'

import {
  parseGitNameList,
  readGitChangedFiles,
  type GitCommandRunner,
} from '../../tools/miniprogram-review/git'

describe('小程序验收 Git 变更读取', () => {
  it('合并三类 Git 路径并去重、排序', () => {
    const calls: string[][] = []
    const runCommand: GitCommandRunner = (_cwd, args) => {
      calls.push(args)
      if (args[0] === 'diff' && args[1] === '--cached') {
        return 'miniprogram/pages/catalog/index.wxml\n'
      }
      if (args[0] === 'diff') return 'miniprogram/pages/catalog/index.wxss\n'
      return 'miniprogram/pages/catalog/index.wxml\nminiprogram/components/catalog/row.ts\n'
    }

    expect(readGitChangedFiles('E:/project', runCommand)).toEqual([
      'miniprogram/components/catalog/row.ts',
      'miniprogram/pages/catalog/index.wxml',
      'miniprogram/pages/catalog/index.wxss',
    ])
    expect(calls).toEqual([
      ['diff', '--name-only'],
      ['diff', '--cached', '--name-only'],
      ['ls-files', '--others', '--exclude-standard'],
    ])
  })

  it('解析 CRLF 和空行并规范化分隔符', () => {
    expect(parseGitNameList('.\\miniprogram\\pages\\catalog\\index.wxml\r\n\n')).toEqual([
      'miniprogram/pages/catalog/index.wxml',
    ])
  })
})
