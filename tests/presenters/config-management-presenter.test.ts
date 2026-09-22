import { describe, expect, it } from 'vitest'
import {
  buildConfigModalData,
  buildConfigManagerView,
  collapseAfterSuccessfulLoad,
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

  it('新配置狀態使用未命名配置標籤', () => {
    const view = buildConfigManagerView({
      configName: '未命名配置',
      configStatus: 'new',
      configList: [],
      unclassifiedConfigs: [],
      listState: 'idle',
      listError: null,
      expanded: false,
      authStatus: 'guest',
      activeConfigId: null,
    })

    expect(view.summary.statusLabel).toBe('未命名配置')
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
    expect(validateConfigName('😀'.repeat(30))).toEqual({ ok: true, name: '😀'.repeat(30) })
    expect(validateConfigName('😀'.repeat(31))).toEqual({
      ok: false,
      message: '配置名稱不可超過 30 個字元',
    })
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

  it('收起狀態只保留核心配置摘要', () => {
    const view = buildConfigManagerView({
      configName: '遠洋火力',
      configStatus: 'saved',
      configList: [],
      unclassifiedConfigs: [],
      listState: 'ready',
      listError: null,
      expanded: false,
      authStatus: 'authenticated',
      activeConfigId: 'cfg-1',
    })

    expect(view.expanded).toBe(false)
    expect(view.showConfigList).toBe(false)
    expect(view.showActionRow).toBe(false)
    expect(view.summary.name).toBe('遠洋火力')
  })

  it('載入成功後狀態決策為收起', () => {
    expect(collapseAfterSuccessfulLoad()).toEqual({ expanded: false })
  })

  it('列表錯誤不誤顯示為空列表，待分類資料才顯示分類入口', () => {
    const errorView = buildConfigManagerView({
      configName: '未命名配置',
      configStatus: 'new',
      configList: [],
      unclassifiedConfigs: [],
      listState: 'error',
      listError: '列表載入失敗',
      expanded: true,
      authStatus: 'authenticated',
      activeConfigId: null,
    })

    expect(errorView.emptyState).toBe(false)
    expect(errorView.errorMessage).toBe('列表載入失敗')

    const unclassifiedView = buildConfigManagerView({
      configName: '未命名配置',
      configStatus: 'new',
      configList: [],
      unclassifiedConfigs: [
        {
          configId: 'legacy-1',
          name: '舊配置',
          scope: 'unclassified',
          version: 1,
          updatedAt: '2026-01-01T00:00:00.000Z',
          lastUsedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      listState: 'empty',
      listError: null,
      expanded: true,
      authStatus: 'authenticated',
      activeConfigId: null,
    })
    expect(unclassifiedView.showUnclassified).toBe(true)
  })
})
