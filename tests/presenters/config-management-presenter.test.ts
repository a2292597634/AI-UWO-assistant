import { describe, expect, it } from 'vitest'
import {
  buildConfigModalData,
  deriveConfigStatus,
  resolveConfigAction,
  validateConfigName,
} from '../../miniprogram/presenters/config-management-presenter'

describe('配置管理 Presenter', () => {
  it('依據髒狀態與目前配置判斷狀態標籤', () => {
    expect(deriveConfigStatus(false, '')).toBe('new')
    expect(deriveConfigStatus(false, 'config-1')).toBe('saved')
    expect(deriveConfigStatus(true, 'config-1')).toBe('unsaved')
  })

  it('為保存、另存為與重新命名建立一致的命名彈窗資料', () => {
    expect(buildConfigModalData('saveAs', '目前配置')).toEqual({
      showNameModal: true,
      modalAction: 'saveAs',
      modalInputValue: '目前配置',
      modalTitle: '另存為配置',
    })
    expect(buildConfigModalData('rename', '目前配置').modalTitle).toBe('重新命名配置')
  })

  it('統一配置名稱的空白與長度校驗', () => {
    expect(validateConfigName('  新配置  ')).toEqual({ ok: true, name: '新配置' })
    expect(validateConfigName('   ')).toEqual({ ok: false, message: '請輸入配置名稱' })
    expect(validateConfigName('一'.repeat(31))).toEqual({
      ok: false,
      message: '配置名稱不可超過 30 個字元',
    })
  })

  it('髒資料時顯示未保存守衛，乾淨時直接放行動作', () => {
    const action = { type: 'exit' as const }
    expect(resolveConfigAction(action, true)).toEqual({
      pendingAction: action,
      showUnsavedGuard: true,
    })
    expect(resolveConfigAction(action, false)).toEqual({
      pendingAction: action,
      showUnsavedGuard: false,
    })
  })
})
