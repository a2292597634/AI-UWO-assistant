import {
  createReminderAdDiagnostic,
  ReminderAdError,
  type ReminderAdDiagnostic,
  type ReminderAdPhase,
  type ReminderAdErrorSource,
} from './major-event-reminder-ad-diagnostic'

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
  let currentAdUnitId = ''
  let phase: ReminderAdPhase = 'create'
  let failures: ReminderAdDiagnostic[] = []
  let errorTimer: ReturnType<typeof setTimeout> | undefined
  let active: { resolve(value: boolean): void; reject(error: Error): void } | null = null
  const finish = (value: boolean) => {
    if (errorTimer !== undefined) clearTimeout(errorTimer)
    errorTimer = undefined
    const pending = active
    active = null
    pending?.resolve(value)
  }
  const onClose = (value: { isEnded?: boolean }) => {
    if (errorTimer === undefined) finish(value?.isEnded === true)
  }
  const recordFailure = (error: unknown, source: ReminderAdErrorSource) => {
    const diagnostic = createReminderAdDiagnostic(currentAdUnitId, phase, source, error)
    // 不輸出原始原生錯誤，避免附帶身份或票據。
    console.warn('major-reminder-ad-failure', diagnostic)
    return diagnostic
  }
  const rememberFailure = (diagnostic: ReminderAdDiagnostic) => {
    const previous = failures[failures.length - 1]
    if (previous?.phase !== diagnostic.phase || previous.code !== diagnostic.code)
      failures = [...failures, diagnostic].slice(-5)
  }
  const onError = (error?: unknown) => {
    if (disposed) return
    const diagnostic = recordFailure(error, 'event')
    if (preload || !active) return
    rememberFailure(diagnostic)
    if (errorTimer !== undefined) return
    const pending = active
    // 合併同一輪事件與 Promise 的診斷；等待期間不重試、不接受關閉作為成功。
    errorTimer = setTimeout(() => {
      errorTimer = undefined
      if (active !== pending) return
      active = null
      pending.reject(new ReminderAdError(failures))
    }, 0)
  }
  const ensureAd = (adUnitId: string) => {
    if (!ad) {
      currentAdUnitId = adUnitId
      phase = 'create'
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
        const current = ensureAd(adUnitId)
        phase = 'preload'
        preload = current
          .load()
          .catch((error: unknown) => {
            if (!disposed) recordFailure(error, 'promise')
          })
          .then(() => {
            preload = null
          })
      } catch (error) {
        // 不支援廣告的環境留待使用者操作時顯示既有錯誤。
        recordFailure(error, 'throw')
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
      } catch (error) {
        return Promise.reject(new ReminderAdError([recordFailure(error, 'throw')]))
      }
      const current = ad!
      return new Promise<boolean>((resolve, reject) => {
        failures = []
        active = { resolve, reject }
        const operation = active
        const attempt = (nextPhase: ReminderAdPhase, work: () => Promise<void>) => {
          phase = nextPhase
          try {
            return work().catch((error: unknown) => {
              if (active === operation) rememberFailure(recordFailure(error, 'promise'))
              throw error
            })
          } catch (error) {
            if (active === operation) rememberFailure(recordFailure(error, 'throw'))
            return Promise.reject(error)
          }
        }
        const retry = async () => {
          if (disposed || active !== operation || errorTimer !== undefined) return
          try {
            await attempt('retry-load', () => current.load())
            if (!disposed && active === operation && errorTimer === undefined) {
              await attempt('retry-show', () => current.show())
            }
          } catch {
            if (active === operation && errorTimer === undefined) {
              active = null
              reject(new ReminderAdError(failures))
            }
          }
        }
        const show = () => {
          if (disposed || active !== operation) return
          void attempt('show', () => current.show()).catch(retry)
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
