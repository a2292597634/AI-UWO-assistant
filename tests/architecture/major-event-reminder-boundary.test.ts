import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fixtureInstallSource } from '../../tools/miniprogram-review/fixtures'
describe('提醒精確網路與頁面驗收契約', () => {
  it('提醒服務唯一例外同步正式掃描與完整倉庫契約，固定函數名', () => {
    for (const file of [
      'tools/quality/check-runtime-network.ts',
      'tests/architecture/runtime-dependencies.test.ts',
    ])
      expect(readFileSync(file, 'utf8')).toContain("'runtime/major-event-reminder-service.ts'")
    expect(readFileSync('AGENTS.md', 'utf8')).toContain('唯一新增例外')
    const source = readFileSync('miniprogram/runtime/major-event-reminder-service.ts', 'utf8')
    expect(source.match(/wx\.cloud\.callFunction/g)).toHaveLength(1)
    expect(source).toContain('name: MAJOR_EVENT_REMINDER_FUNCTION_NAME')
    expect(source).not.toContain('wx.cloud.database')
  })
  it('無配置保存場景只以真實 tap 打開兩個列表和詳情，fixture 不播放廣告', () => {
    expect(() => fixtureInstallSource('major-event-reminder-unconfigured' as never)).not.toThrow()
    const scenario = JSON.parse(
      readFileSync(
        'tools/miniprogram-review/scenarios/major-event-reminder-unconfigured.json',
        'utf8',
      ),
    )
    expect(scenario.watchPaths).toContain('miniprogram/contracts/major-event-reminder.ts')
    expect(scenario.watchPaths).toContain('miniprogram/runtime/major-event-reminder-service.ts')
    expect(
      scenario.steps.some((step: { selector?: string }) =>
        step.selector?.startsWith('.reminder-sheet'),
      ),
    ).toBe(false)
    expect(
      scenario.steps.some(
        (step: { action: string; selector?: string; exists?: boolean }) =>
          step.action === 'assertExists' &&
          step.selector === '.reminder-overlay' &&
          step.exists === false,
      ),
    ).toBe(true)
    expect(scenario.fixture).toBe('major-event-reminder-unconfigured')
    expect(
      scenario.steps.filter((s: { action: string }) => s.action === 'screenshot').length,
    ).toBeGreaterThanOrEqual(3)
    expect(
      scenario.steps.some(
        (s: { action: string; selector?: string }) =>
          s.action === 'tap' && s.selector === '.reminder-toggle--detail',
      ),
    ).toBe(true)
  })
})
