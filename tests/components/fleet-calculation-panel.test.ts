import { afterEach, describe, expect, it, vi } from 'vitest'

interface PanelConfig {
  methods: {
    onCancel(this: { data: { busy: boolean }; triggerEvent: (name: string) => void }): void
    onRetry(this: { data: { busy: boolean }; triggerEvent: (name: string) => void }): void
  }
}

const loadPanel = async (): Promise<PanelConfig> => {
  let config: PanelConfig | undefined
  vi.stubGlobal('Component', (value: PanelConfig) => {
    config = value
  })
  const entry = '../../miniprogram/components/fleet-calculation-panel/index'
  await import(entry).catch(() => undefined)
  expect(config, '需提供可取消及重試的底部計算元件').toBeDefined()
  return config!
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('底部計算面板事件', () => {
  it('計算中只發出取消事件，不允許重複啟動', async () => {
    const config = await loadPanel()
    const triggerEvent = vi.fn()
    const context = { data: { busy: true }, triggerEvent }
    config.methods.onCancel.call(context)
    config.methods.onRetry.call(context)
    expect(triggerEvent.mock.calls).toEqual([['cancel']])
  })

  it('已取消或失敗時只發出重試事件', async () => {
    const config = await loadPanel()
    const triggerEvent = vi.fn()
    const context = { data: { busy: false }, triggerEvent }
    config.methods.onCancel.call(context)
    config.methods.onRetry.call(context)
    expect(triggerEvent.mock.calls).toEqual([['retry']])
  })
})
