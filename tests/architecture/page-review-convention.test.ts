import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const PAGE_REVIEW_SPEC_PATH =
  'docs/superpowers/specs/2026-09-16-miniprogram-review-html-report-design.md'

const readProjectFile = (relativePath: string): string => {
  const target = resolve(ROOT, relativePath)
  return existsSync(target) ? readFileSync(target, 'utf8') : ''
}

describe('页面变更验收规范入口', () => {
  it.each(['AGENTS.md', 'CLAUDE.md'])('%s 只通过入口指向页面验收规范', (file) => {
    const content = readProjectFile(file)

    expect(content).toContain(PAGE_REVIEW_SPEC_PATH)
    expect(content).toMatch(/页面变更.*验收|页面变更.*触发/s)
  })

  it('规范要求报告直接展示修改过程截图', () => {
    const spec = readProjectFile(PAGE_REVIEW_SPEC_PATH)

    expect(spec).toMatch(/报告内直接展示.*截图/s)
    expect(spec).toContain('修改前基线')
    expect(spec).toContain('修改后截图')
    expect(spec).toContain('report.html')
  })
})
