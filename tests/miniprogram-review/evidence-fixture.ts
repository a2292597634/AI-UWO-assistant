import type { ReviewEvidence } from '../../tools/miniprogram-review/evidence'
export const evidence = (commit = '1'): ReviewEvidence => ({
  schemaVersion: 2,
  source: {
    projectRoot: 'E:/project',
    executionRoot: 'E:/project',
    gitCommit: commit,
    candidateSha256: commit.repeat(64).slice(0, 64),
    unchangedDuringRun: true,
    binding: 'launch-recorded',
  },
  scenario: {
    pagePath: '/pages/catalog/index',
    scenarioSha256: 'a'.repeat(64),
    screenshotKey: 'catalog',
    state: 'normal',
    stateInputSha256: 'b'.repeat(64),
    fixtureName: null,
    fixtureSha256: null,
  },
  runtime: {
    adapter: 'wechatide',
    endpoint: 'ws://127.0.0.1:9420',
    devToolsVersion: '2.02.2609292',
    sdkVersion: '3.17.0',
    width: 390,
    height: 844,
    pagePath: '/pages/catalog/index',
  },
})
