import { describe, expect, it } from 'vitest'

import config from '../../vitest.config'

describe('Vitest 執行配置', () => {
  it('限制單一 worker，避免磁碟密集測試在全套並行時超時', () => {
    expect(config.test?.maxWorkers).toBe(1)
  })
})
