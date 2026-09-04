import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const read = (file: string): string =>
  readFileSync(resolve(ROOT, 'miniprogram/subpkg-submission/pages/officer-review', file), 'utf8')

const app = JSON.parse(readFileSync(resolve(ROOT, 'miniprogram/app.json'), 'utf8')) as {
  pages: string[]
  subpackages: Array<{ root: string; pages: string[] }>
}

describe('小程序管理員審核工作台契約', () => {
  it('先檢查服務端管理員身份，再列出四種投稿狀態', () => {
    const wxml = read('index.wxml')
    const page = read('index.ts')
    expect(wxml).toContain('statusTabs')
    expect(page).toContain('getAdminStatus()')
    expect(page).toContain('listAdmin(activeStatus)')
    expect(wxml).toContain('無審核權限')
    expect(page).toContain('pendingCount')
    expect(wxml).toContain('待審核 {{pendingCount}} 筆')
  })

  it('审核页与投稿列表注册在低频功能分包，不增加主包体积', () => {
    const submissionPackage = app.subpackages.find((item) => item.root === 'subpkg-submission')
    expect(submissionPackage?.pages).toEqual([
      'pages/officer-submissions/index',
      'pages/officer-review/index',
      'pages/officer-review-detail/index',
    ])
    expect(app.pages).not.toContain('pages/officer-review/index')
    expect(app.pages).not.toContain('pages/officer-submissions/index')
  })
})
