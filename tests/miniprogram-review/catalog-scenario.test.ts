import { describe, expect, it } from 'vitest'

import { loadScenario } from '../../tools/miniprogram-review/scenario'

describe('目录页示范验收场景', () => {
  it('覆盖输入、点击、滚动、断言和截图', () => {
    const scenario = loadScenario('tools/miniprogram-review/scenarios/catalog-search.json')
    const actions = scenario.steps.map((step) => step.action)

    for (const required of ['input', 'tap', 'scrollElement', 'assertExists', 'screenshot']) {
      expect(actions).toContain(required)
    }
    expect(scenario.entry).toBe('/pages/catalog/index')
    expect(scenario.state).toBe('normal')
  })
})
