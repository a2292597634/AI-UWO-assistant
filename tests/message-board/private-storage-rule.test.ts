import { describe, expect, it } from 'vitest'
import { buildPrivateProbeRule } from '../../tools/message-board/private-storage-rule'

const runId = 'g0-shared-avatar-test'
const baseline = { acl: 'ADMINWRITE', rule: null }
describe('單批次私有圖片規則與原權限保護', () => {
  it('只限制本次私有前綴，保留其他全部目錄可讀及所有客戶端不可寫', () => {
    const built = buildPrivateProbeRule(baseline, runId)
    const literal = built.rule.read
    expect(literal).toMatch(/^\/\^.*\/\.test\(resource\.path\) == false$/)
    const matcher = new RegExp(literal.slice(1, -'.test(resource.path) == false'.length - 1))
    for (const path of [
      'assets/release/officer.png',
      'custom-portraits/old.png',
      'message-board-probes/public/' + runId + '/published.png',
      'message-board-probes/private/other-run/private.png',
      'message-board-probes/private/' + runId + '-other/private.png',
    ])
      expect(matcher.test(path)).toBe(false)
    expect(matcher.test('message-board-probes/private/' + runId + '/probe.png')).toBe(true)
    expect(built.rule.write).toBe('false')
    expect(built.acl).toBe('CUSTOM')
    expect(baseline).toEqual({ acl: 'ADMINWRITE', rule: null })
  })
  it.each([
    { acl: 'PRIVATE', rule: null },
    { acl: 'CUSTOM', rule: { read: 'true', write: 'false' } },
    { acl: 'ADMINWRITE', rule: { read: 'true' } },
  ])('遇到其他既有規則不覆寫', (current) => {
    expect(() => buildPrivateProbeRule(current, runId)).toThrow(
      'PROBE_STORAGE_BASELINE_UNSUPPORTED',
    )
  })
  it.each(['../assets', 'run/other', 'ordinary-run', 'g0-shared-'])(
    '拒絕不合法批次 %s',
    (invalid) => {
      expect(() => buildPrivateProbeRule(baseline, invalid)).toThrow('PROBE_STORAGE_RUN_INVALID')
    },
  )
})
