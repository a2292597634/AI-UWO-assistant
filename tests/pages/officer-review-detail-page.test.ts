import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const read = (file: string): string =>
  readFileSync(
    resolve(ROOT, 'miniprogram/subpkg-submission/pages/officer-review-detail', file),
    'utf8',
  )

describe('投稿詳情與審核操作契約', () => {
  it('管理員可保存、通過或駁回，普通使用者可查看駁回原因並重提', () => {
    const wxml = read('index.wxml')
    const page = read('index.ts')
    for (const action of ['保存修改', '通過，等待發布', '駁回投稿', '修改後重新提交']) {
      expect(wxml).toContain(action)
    }
    expect(page).toContain('saveAdmin')
    expect(page).toContain('approve')
    expect(page).toContain('reject')
    expect(page).toContain('onResubmit')
    expect(wxml).toContain('技能名稱仍需從篩選結果選取')
    expect(wxml).toContain('Canonical 預覽')
    expect(wxml).toContain('visualGradeOptions')
    expect(wxml).toContain('sourceGroup')
    expect(wxml).toContain('slot')
    expect(wxml).toContain('技能類型')
    expect(wxml).toContain('skillKindOptions')
    expect(page).toContain('onSkillKindChange')
    expect(page).not.toContain('ACTIVE_GROUPS')
    expect(page).toContain("cropScale: '1:1'")
  })
})
