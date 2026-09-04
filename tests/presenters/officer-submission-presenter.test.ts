import { describe, expect, it } from 'vitest'
import { buildSubmissionStatusView } from '../../miniprogram/presenters/officer-submission-presenter'

describe('航海士投稿 Presenter', () => {
  it('状态标签和駁回原因只从服务端记录生成', () => {
    expect(buildSubmissionStatusView({ status: 'rejected', rejectReason: '缺少正式头像' })).toEqual(
      {
        label: '已駁回',
        reason: '缺少正式头像',
        tone: 'error',
      },
    )
  })

  it('审核通过但尚未发布时显示待发布，而不是已发布', () => {
    expect(buildSubmissionStatusView({ status: 'approved', rejectReason: null })).toEqual({
      label: '已審核，待發布',
      reason: '',
      tone: 'review',
    })
  })
})
