import type { FleetCalculation, FleetSolveProgress } from '../domain/fleet-solver-core'

/** 保留完整輸入而非資料版本捷徑；欄位／陣列順序不同只會失效，不會錯誤命中。 */
export const buildFleetCalculationKey = (
  source: 'battle' | 'adventure',
  input: unknown,
  mode: string,
): string => JSON.stringify({ solverVersion: 1, source, mode, input })

export interface FleetCalculationView {
  status: 'preparing' | 'searching' | 'finalizing' | 'cancelled' | 'error'
  title: string
  phaseLabel: string
  progress: number | null
  processed: number
  total: number
  elapsedText: string
  notice: string
}

export const createFleetCalculationView = (
  status: FleetCalculationView['status'] = 'preparing',
  notice = '',
): FleetCalculationView => ({
  status,
  title:
    status === 'cancelled'
      ? '已取消計算'
      : status === 'error'
        ? '配隊計算未完成'
        : status === 'finalizing'
          ? '正在整理配隊方案'
          : status === 'searching'
            ? '正在比較配隊組合'
            : '正在準備配隊',
  phaseLabel:
    status === 'searching' ? '比較候選航海士' : status === 'finalizing' ? '整理方案' : '準備配隊',
  progress: null,
  processed: 0,
  total: 0,
  elapsedText: '已用時 0 秒',
  notice,
})

type CalculationResult<T> =
  | { status: 'completed'; value: T; cached: boolean }
  | { status: 'cancelled' }
  | { status: 'error'; error: unknown }

interface CalculationOptions<T> {
  key: string | (() => string)
  create(): FleetCalculation<T>
  isCurrent(): boolean
  onProgress?(view: FleetCalculationView): void
}

interface ActiveCalculation<T> {
  promise: Promise<CalculationResult<T>>
  settle(result: CalculationResult<T>): void
  timer: ReturnType<typeof setTimeout> | null
}

/** 每頁各自持有一個 runner；快取只保存最近一次完整輸入的已完成結果。 */
export class FleetCalculationRunner<T> {
  private active: ActiveCalculation<T> | null = null
  private cached: { key: string; value: T } | null = null

  get isRunning(): boolean {
    return this.active !== null
  }

  cancel(): void {
    this.active?.settle({ status: 'cancelled' })
  }

  dispose(): void {
    this.cancel()
    this.cached = null
  }

  start(options: CalculationOptions<T>): Promise<CalculationResult<T>> {
    if (this.active) return this.active.promise
    if (
      typeof options.key === 'string' &&
      this.cached?.key === options.key &&
      options.isCurrent()
    ) {
      return Promise.resolve({ status: 'completed', value: this.cached.value, cached: true })
    }
    let resolve!: (result: CalculationResult<T>) => void
    const promise = new Promise<CalculationResult<T>>((done) => {
      resolve = done
    })
    const task: ActiveCalculation<T> = {
      promise,
      timer: null,
      settle: (result) => {
        if (this.active !== task) return
        if (task.timer !== null) clearTimeout(task.timer)
        this.active = null
        resolve(result)
      },
    }
    this.active = task
    const started = Date.now()
    let calculation: FleetCalculation<T> | null = null
    let key = ''
    let latest: FleetSolveProgress | null = null
    let lastPhase: FleetSolveProgress['phase'] | null = null
    let lastPublished = -Infinity
    const publish = (): void => {
      if (this.active !== task || !options.isCurrent() || !latest || !options.onProgress) return
      const now = Date.now()
      if (latest.phase === lastPhase && now - lastPublished < 120) return
      lastPhase = latest.phase
      lastPublished = now
      const view = createFleetCalculationView(latest.phase)
      view.processed = latest.processedCandidates
      view.total = latest.totalCandidates
      view.progress =
        latest.phase === 'searching' && latest.totalCandidates > 0
          ? Math.min(
              100,
              Math.max(
                0,
                ((latest.processedCandidates + latest.candidateFraction) / latest.totalCandidates) *
                  100,
              ),
            )
          : null
      view.elapsedText = `已用時 ${Math.floor((now - started) / 1000)} 秒`
      if (now - started >= 8000) view.notice = '目標組合較多，仍在計算中；可隨時取消'
      options.onProgress(view)
    }
    const pump = (): void => {
      task.timer = null
      if (this.active !== task) return
      try {
        if (!options.isCurrent()) {
          task.settle({ status: 'cancelled' })
          return
        }
        const sliceStart = Date.now()
        if (!calculation) {
          key = typeof options.key === 'function' ? options.key() : options.key
          if (this.active !== task || !options.isCurrent()) {
            task.settle({ status: 'cancelled' })
            return
          }
          if (this.cached?.key === key) {
            if (!options.isCurrent()) {
              task.settle({ status: 'cancelled' })
              return
            }
            task.settle({ status: 'completed', value: this.cached.value, cached: true })
            return
          }
          calculation = options.create()
        }
        do {
          if (this.active !== task || !options.isCurrent()) {
            task.settle({ status: 'cancelled' })
            return
          }
          const step = calculation.next()
          if (step.done) {
            publish()
            if (this.active !== task || !options.isCurrent()) {
              task.settle({ status: 'cancelled' })
              return
            }
            this.cached = { key, value: step.value }
            task.settle({ status: 'completed', value: step.value, cached: false })
            return
          }
          if (latest && latest.phase !== step.value.phase) publish()
          latest = step.value
        } while (Date.now() - sliceStart < 8)
        publish()
        if (this.active === task) task.timer = setTimeout(pump, 0)
      } catch (error) {
        task.settle({ status: 'error', error })
      }
    }
    // 宏任務讓準備狀態先回到視圖層，也允許在首次 next 前取消。
    task.timer = setTimeout(pump, 0)
    return promise
  }
}
