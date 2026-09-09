import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '../..')

interface CloudFunctionConfig {
  name?: unknown
  timeout?: unknown
}

interface CloudBaseConfig {
  envId?: unknown
  functionRoot?: unknown
  functions?: unknown
}

describe('兌換碼 CloudBase 部署設定', () => {
  it('為兌換雲函數保留足夠時間等待官方回應', () => {
    const configPath = path.join(ROOT, 'cloudbaserc.json')
    expect(fs.existsSync(configPath)).toBe(true)
    if (!fs.existsSync(configPath)) return

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as CloudBaseConfig
    const functions = Array.isArray(config.functions)
      ? (config.functions as CloudFunctionConfig[])
      : []
    const couponFunction = functions.find((item) => item.name === 'coupon-redemption')

    expect(config.envId).toBe('cloud1-d7gxfuxfe813b4eaa')
    expect(config.functionRoot).toBe('cloudfunctions/')
    expect(couponFunction).toBeDefined()
    expect(couponFunction?.timeout).toBeGreaterThanOrEqual(10)
  })
})
