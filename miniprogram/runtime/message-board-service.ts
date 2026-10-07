import { MESSAGE_BOARD_FUNCTION_NAME } from './cloudbase-config'
import type {
  BoardAction,
  BoardInputs,
  BoardOutputs,
  MessageBoardService,
} from '../contracts/message-board'
import { only, record, validBoardOutput } from '../domain/message-board/response-guards'
export class MessageBoardError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'MessageBoardError'
  }
}
type CloudCall = (action: BoardAction, input: BoardInputs[BoardAction]) => Promise<unknown>
export function createMessageBoardService(
  call: CloudCall = async (action, input) =>
    wx.cloud.callFunction({ name: MESSAGE_BOARD_FUNCTION_NAME, data: { action, input } }),
): MessageBoardService {
  return {
    async invoke<A extends BoardAction>(
      action: A,
      input: BoardInputs[A],
    ): Promise<BoardOutputs[A]> {
      let response: unknown
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        response = await Promise.race([
          call(action, input),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error('transport-timeout')), 15000)
          }),
        ])
      } catch {
        throw new MessageBoardError('unconfirmed', '結果尚未確認，請先確認原提交結果。')
      } finally {
        if (timer) clearTimeout(timer)
      }
      if (!record(response) || !record(response.result))
        throw new MessageBoardError('protocol', '服務回應格式不正確，請稍後重試。')
      const result = response.result
      if (
        result.ok === false &&
        only(result, ['ok', 'code', 'message']) &&
        typeof result.code === 'string' &&
        /^[a-z-]{1,48}$/.test(result.code) &&
        typeof result.message === 'string' &&
        result.message.length > 0 &&
        result.message.length <= 200
      )
        throw new MessageBoardError(result.code, result.message)
      if (
        result.ok !== true ||
        !only(result, ['ok', 'data']) ||
        !validBoardOutput(action, result.data)
      )
        throw new MessageBoardError('protocol', '服務回應格式不正確，請稍後重試。')
      // 回應已由動作對應的完整欄位／狀態守衛校驗，這裡只恢復 TypeScript 的動作關聯。
      return result.data as BoardOutputs[A]
    },
  }
}
