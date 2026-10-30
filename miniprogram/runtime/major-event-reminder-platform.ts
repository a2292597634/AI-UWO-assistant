export type ReminderNativeStatus = 'accept' | 'reject' | 'ban' | 'filter' | 'error'
export interface MajorEventReminderPlatform {
  subscribeBatch(templateIds: string[]): Promise<Record<string, ReminderNativeStatus>>
  subscribe(templateId: string): Promise<boolean>
  preloadAd?(adUnitId: string): void
  watchAd(adUnitId: string): Promise<boolean>
  destroy(): void
}
/** 原生授權必須在點擊堆疊中發起；廣告結束不推測微信授權。 */
export const createMajorEventReminderPlatform = (): MajorEventReminderPlatform => {
  let ad: WechatMiniprogram.RewardedVideoAd | null = null
  let preload: Promise<void> | null = null
  let disposed = false
  let active: { resolve(value: boolean): void; reject(error: Error): void } | null = null
  const finish = (value: boolean) => {
    const pending = active
    active = null
    pending?.resolve(value)
  }
  const onClose = (value: { isEnded?: boolean }) => finish(value?.isEnded === true)
  const onError = () => {
    if (preload) return
    const pending = active
    active = null
    pending?.reject(new Error('廣告暫時無法播放，請稍後再試。'))
  }
  const ensureAd = (adUnitId: string) => {
    if (!ad) {
      ad = wx.createRewardedVideoAd({ adUnitId })
      ad.onClose(onClose)
      ad.onError(onError)
    }
    return ad
  }
  return {
    preloadAd(adUnitId) {
      if (disposed || active || ad || !adUnitId) return
      // 預載失敗不阻止使用者稍後點擊時的既有展示及重試流程。
      try {
        preload = ensureAd(adUnitId)
          .load()
          .catch(() => {})
          .then(() => {
            preload = null
          })
      } catch {
        // 不支援廣告的環境留待使用者操作時顯示既有錯誤。
      }
    },
    subscribeBatch(templateIds) {
      const fallback = () => Object.fromEntries(templateIds.map((id) => [id, 'error' as const]))
      if (
        disposed ||
        !templateIds.length ||
        templateIds.length > 3 ||
        new Set(templateIds).size !== templateIds.length ||
        templateIds.some((id) => !id)
      )
        return Promise.resolve(fallback())
      return new Promise((resolve) => {
        try {
          wx.requestSubscribeMessage({
            tmplIds: [...templateIds],
            success: (result) =>
              resolve(
                Object.fromEntries(
                  templateIds.map((id) => {
                    const status = result[id]
                    return [
                      id,
                      ['accept', 'reject', 'ban', 'filter'].includes(status)
                        ? (status as ReminderNativeStatus)
                        : 'error',
                    ]
                  }),
                ),
              ),
            fail: () => resolve(fallback()),
          })
        } catch {
          resolve(fallback())
        }
      })
    },
    subscribe(templateId) {
      if (disposed || !templateId) return Promise.resolve(false)
      return new Promise<boolean>((resolve) => {
        try {
          wx.requestSubscribeMessage({
            tmplIds: [templateId],
            success: (result) => resolve(result[templateId] === 'accept'),
            fail: () => resolve(false),
          })
        } catch {
          resolve(false)
        }
      })
    },
    watchAd(adUnitId) {
      if (disposed || active || !adUnitId) return Promise.reject(new Error('廣告目前無法開啟。'))
      try {
        ensureAd(adUnitId)
      } catch {
        return Promise.reject(new Error('目前環境不支援激勵廣告。'))
      }
      const current = ad!
      return new Promise<boolean>((resolve, reject) => {
        active = { resolve, reject }
        const operation = active
        const retry = async () => {
          if (disposed || active !== operation) return
          try {
            await current.load()
            if (!disposed && active === operation) await current.show()
          } catch {
            if (active === operation) onError()
          }
        }
        const show = () => {
          if (disposed || active !== operation) return
          try {
            void current.show().catch(retry)
          } catch {
            void retry()
          }
        }
        if (preload) void preload.then(show)
        else show()
      })
    },
    destroy() {
      disposed = true
      finish(false)
      if (ad) {
        ad.offClose(onClose)
        ad.offError(onError)
        ad.destroy()
        ad = null
      }
    },
  }
}
