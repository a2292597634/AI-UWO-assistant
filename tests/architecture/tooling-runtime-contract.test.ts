import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')

describe('工具链运行时契约', () => {
  it('固定 Node.js 与 npm 的支持版本范围', () => {
    const packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      engines?: { node?: string; npm?: string }
    }

    expect(packageJson.engines).toMatchObject({
      node: '>=22 <23',
      npm: '>=10',
    })
  })

  it('忽略测试临时目录且仓库当前没有残留目录', () => {
    const gitignore = readFileSync(resolve(ROOT, '.gitignore'), 'utf8')
    expect(gitignore.split(/\r?\n/)).toContain('tests/.tmp-*/')

    const testsRoot = resolve(ROOT, 'tests')
    const leftovers = readdirSync(testsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('.tmp-'))
      .map((entry) => entry.name)
    expect(leftovers).toEqual([])
    expect(existsSync(resolve(testsRoot, '.tmp-ui-assets-2jjjRq'))).toBe(false)
  })
})
