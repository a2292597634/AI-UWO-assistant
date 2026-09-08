import { describe, expect, it } from 'vitest'
import {
  buildCouponSettingsViewModel,
  getCouponResultViewModel,
} from '../../miniprogram/presenters/coupon-redemption-presenter'

describe('兌換碼 Presenter', () => {
  it('空設定輸出新增引導', () => {
    expect(buildCouponSettingsViewModel({ profiles: [], activeProfileId: null })).toMatchObject({
      isEmpty: true,
      emptyMessage: '尚未新增玩家設定',
    })
  })

  it('輸出設定的官方伺服器名稱與目前狀態', () => {
    expect(
      buildCouponSettingsViewModel({
        profiles: [
          {
            id: 'profile-1',
            name: '主力商會',
            gameServerId: 'UWOGL-US-01',
            userNo: '航海家小明',
          },
        ],
        activeProfileId: 'profile-1',
      }).profiles,
    ).toEqual([
      expect.objectContaining({
        id: 'profile-1',
        serverName: 'Atlantic Ocean',
        isActive: true,
      }),
    ])
  })

  it('成功結果輸出已達成狀態', () => {
    expect(
      getCouponResultViewModel({ code: 'success', message: '獎勵已發送至遊戲內信箱。' }),
    ).toEqual({
      statusClass: 'ui-status--achieved',
      label: '兌換成功',
      message: '獎勵已發送至遊戲內信箱。',
    })
  })

  it('未知結果輸出需復核狀態', () => {
    expect(
      getCouponResultViewModel({
        code: 'unknown',
        message: '結果未確認，請先到官方頁面確認再嘗試。',
      }),
    ).toMatchObject({
      statusClass: 'ui-status--review',
      label: '需復核',
    })
  })
})
