/**
 * 新增航海士 — CloudBase 服务适配器
 *
 * 唯一允许调用 wx.cloud.callFunction 的模块。
 * 图片上传通过云函数中转（base64），不在客户端直接操作云存储。
 * 页面通过此 service 提交航海士数据。
 */

import { OFFICER_CUSTOM_FUNCTION_NAME } from './cloudbase-config'
import type { OfficerSubmitResult } from '../contracts/officer-editor'

// ── 错误类 ──

export class OfficerSubmitError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

// ── 内部：调用云函数 ──

interface CloudFunctionResponse {
  ok: boolean
  data?: OfficerSubmitResult
  code?: string
  message?: string
}

async function callOfficerFunction(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<OfficerSubmitResult> {
  let result: CloudFunctionResponse
  try {
    const response = await wx.cloud.callFunction({
      name: OFFICER_CUSTOM_FUNCTION_NAME,
      data: { action, ...payload },
    })
    result = response.result as CloudFunctionResponse
  } catch {
    throw new OfficerSubmitError(
      'network',
      '無法連接伺服器，請檢查網絡後重試',
    )
  }

  if (result.ok === false || !result.data?.ok) {
    throw new OfficerSubmitError(
      result.data?.code ?? result.code ?? 'unknown',
      result.data?.message ?? result.message ?? '伺服器錯誤',
    )
  }

  return result.data!
}

// ── 服务接口 ──

export interface OfficerEditorService {
  /** 提交新航海士到 CloudBase（含头像 base64 数据） */
  submitOfficer(
    officerId: string,
    canonicalData: Record<string, unknown>,
    portraitBase64?: string,
  ): Promise<OfficerSubmitResult>
}

// ── 适配器实现 ──

export const createOfficerEditorService = (): OfficerEditorService => ({
  async submitOfficer(
    officerId: string,
    canonicalData: Record<string, unknown>,
    portraitBase64?: string,
  ): Promise<OfficerSubmitResult> {
    return callOfficerFunction('submit', {
      officerId,
      canonicalData,
      ...(portraitBase64 ? { portraitBase64 } : {}),
    })
  },
})

// ── 单例 ──

let _service: OfficerEditorService | null = null

export const getOfficerEditorService = (): OfficerEditorService => {
  if (!_service) {
    _service = createOfficerEditorService()
  }
  return _service
}
