import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { loadScenario, parseScenario } from '../../tools/miniprogram-review/scenario'

const temporaryDirectories: string[] = []

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe('小程序验收场景', () => {
  it('接受 watchPaths 并规范化路径分隔符', () => {
    const scenario = parseScenario({
      name: '目录搜寻',
      entry: '/pages/catalog/index',
      watchPaths: ['miniprogram\\pages\\catalog\\', 'miniprogram/components/catalog'],
      state: 'normal',
      devices: ['iphone-standard'],
      steps: [{ action: 'screenshot', name: 'catalog' }],
    })

    expect(scenario.watchPaths).toEqual([
      'miniprogram/pages/catalog/',
      'miniprogram/components/catalog',
    ])
  })

  it.each(['../miniprogram/pages', '/miniprogram/pages', ''])('拒绝不安全 watchPath：%s', (path) => {
    expect(() =>
      parseScenario({
        name: '危险路径',
        entry: '/pages/catalog/index',
        watchPaths: [path],
        state: 'normal',
        devices: ['iphone-standard'],
        steps: [{ action: 'screenshot', name: 'catalog' }],
      }),
    ).toThrow('watchPaths')
  })

  it('接受第一阶段全部动作', () => {
    const scenario = parseScenario({
      name: '目录搜寻',
      entry: '/pages/catalog/index',
      state: 'normal',
      devices: ['iphone-standard'],
      steps: [
        { action: 'navigate', path: '/pages/catalog/index' },
        { action: 'switchTab', path: '/pages/home/index' },
        { action: 'tap', selector: '.catalog-page__officer-row' },
        { action: 'input', selector: '.catalog-page__search-input', value: '郑和' },
        { action: 'clearInput', selector: '.catalog-page__search-input' },
        { action: 'scrollPage', distance: 600 },
        { action: 'scrollElement', selector: '.catalog-page__list', distance: 400 },
        { action: 'waitFor', selector: '.catalog-page', timeoutMs: 3000 },
        { action: 'waitFor', durationMs: 250 },
        { action: 'assertExists', selector: '.catalog-page', exists: true },
        { action: 'assertVisible', selector: '.catalog-page' },
        { action: 'assertText', selector: '.catalog-page__result-count', contains: '位' },
        { action: 'assertText', selector: '.catalog-page__mode-tab', equals: '航海士' },
        { action: 'screenshot', name: 'catalog-result' },
      ],
    })

    expect(scenario.steps).toHaveLength(14)
  })

  it.each(['empty', 'loading', 'error', 'long-text'] as const)('接受 %s 数据状态', (state) => {
    expect(
      parseScenario({
        name: '状态场景',
        entry: '/pages/catalog/index',
        state,
        devices: ['iphone-small', 'android-large'],
        steps: [{ action: 'screenshot', name: 'state' }],
      }).state,
    ).toBe(state)
  })

  it('拒绝任意 JavaScript 动作', () => {
    expect(() =>
      parseScenario({
        name: '危险场景',
        entry: '/pages/catalog/index',
        state: 'normal',
        devices: ['iphone-standard'],
        steps: [{ action: 'evaluate', code: 'wx.request({})' }],
      }),
    ).toThrow('不支持的场景动作：evaluate')
  })

  it('拒绝未知字段和不安全截图名称', () => {
    expect(() =>
      parseScenario({
        name: '额外字段',
        entry: '/pages/catalog/index',
        state: 'normal',
        devices: ['iphone-standard'],
        secret: true,
        steps: [{ action: 'screenshot', name: '../escape' }],
      }),
    ).toThrow('场景包含未知字段：secret')

    expect(() =>
      parseScenario({
        name: '路径穿越',
        entry: '/pages/catalog/index',
        state: 'normal',
        devices: ['iphone-standard'],
        steps: [{ action: 'screenshot', name: '../escape' }],
      }),
    ).toThrow('截图名称只能包含英文字母、数字、连字号和下划线')
  })

  it('拒绝非字符串的文字断言值', () => {
    expect(() =>
      parseScenario({
        name: '错误文字断言',
        entry: '/pages/catalog/index',
        state: 'normal',
        devices: ['iphone-standard'],
        steps: [{ action: 'assertText', selector: '.count', equals: 3 }],
      }),
    ).toThrow('文字断言值必须是字符串')
  })

  it('从 JSON 文件载入并校验场景', () => {
    const directory = mkdtempSync(join(tmpdir(), 'uwo-review-scenario-'))
    temporaryDirectories.push(directory)
    mkdirSync(directory, { recursive: true })
    const path = join(directory, 'valid.json')
    writeFileSync(
      path,
      JSON.stringify({
        name: '文件场景',
        entry: '/pages/catalog/index',
        state: 'normal',
        devices: ['iphone-standard'],
        steps: [{ action: 'screenshot', name: 'catalog' }],
      }),
    )

    expect(loadScenario(path).name).toBe('文件场景')
  })
})
