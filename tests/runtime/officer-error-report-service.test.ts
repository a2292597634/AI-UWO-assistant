import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createOfficerErrorReportService,
  OfficerErrorReportError,
} from '../../miniprogram/runtime/officer-error-report-service'

const callFunction = vi.fn()
vi.stubGlobal('wx', { cloud: { callFunction } })

const draft = {
  officerId: 'officer_1',
  errorTypes: ['skill'] as const,
  description: '技能資料錯誤',
  suggestedCorrection: '應為 Lv.2',
  sourceUrl: '',
  screenshotFileIds: [],
  supplement: '',
}

const version = { reportId: 'report_1', revision: 1, updatedAt: '2026-09-13T00:00:00.000Z' }

describe('錯誤回報小程序服務', () => {
  beforeEach(() => vi.clearAllMocks())

  it('使用固定雲函數和對應 action', async () => {
    callFunction.mockResolvedValue({ result: { ok: true, data: [] } })
    const service = createOfficerErrorReportService()

    await service.createReport(draft)
    expect(callFunction).toHaveBeenLastCalledWith({
      name: 'officer-maintenance',
      data: { action: 'createReport', ...draft },
    })
    await service.listMine()
    expect(callFunction).toHaveBeenLastCalledWith({
      name: 'officer-maintenance',
      data: { action: 'listMyReports' },
    })
    await service.accept({ ...version, reply: '已確認' })
    expect(callFunction).toHaveBeenLastCalledWith({
      name: 'officer-maintenance',
      data: { action: 'acceptReport', ...version, reply: '已確認' },
    })
  })

  it('保留可處理的服務端錯誤代碼', async () => {
    callFunction.mockResolvedValue({
      result: { ok: false, code: 'conflict', message: '回報已更新' },
    })

    const error = await createOfficerErrorReportService()
      .accept({ ...version, reply: '' })
      .catch((value: unknown) => value)
    expect(error).toBeInstanceOf(OfficerErrorReportError)
    expect(error).toMatchObject({ code: 'conflict', message: '回報已更新' })
  })

  it('不暴露連線例外內容', async () => {
    callFunction.mockRejectedValue(new Error('internal secret'))

    const error = await createOfficerErrorReportService()
      .listMine()
      .catch((value: unknown) => value)
    expect(error).toMatchObject({ code: 'network' })
    expect((error as Error).message).not.toContain('internal secret')
  })
})
