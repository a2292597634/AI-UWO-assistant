import { describe, expect, it } from 'vitest'
import { buildGameServerOutputs } from '../../tools/data-pipeline/build-game-servers'

const baseline = {
  version: '1',
  servers: [
    { id: 'UWOGL-JP-02', name: 'Blue Ocean' },
    { id: 'UWOGL-JP-03', name: 'Pacific Ocean' },
    { id: 'UWO-KR-14', name: '북극해' },
    { id: 'UWO-KR-13', name: 'Caribbean Sea' },
    { id: 'UWO-KR-01', name: '태평양1' },
    { id: 'UWO-KR-04', name: '대서양1' },
    { id: 'UWO-KR-10', name: '창해' },
    { id: 'UWOGL-US-01', name: 'Atlantic Ocean' },
    { id: 'UWOGL-US-02', name: 'Utopia Ocean' },
  ],
}

describe('伺服器單一來源構建', () => {
  it('保留兌換碼既有九項名稱與順序，輸出能載入的同一清單', () => {
    const result = buildGameServerOutputs(baseline)
    expect(JSON.parse(result.referenceJson)).toEqual(baseline)
    const module = { exports: {} }
    // 執行本測試剛生成的受控 CommonJS，確認客戶端產物而非只比對文字。
    new Function('module', result.runtimeJs)(module)
    expect(module.exports).toEqual(baseline)
    expect(buildGameServerOutputs(baseline)).toEqual(result)
  })
  it('拒絕重複 ID，不能讓前後端得到歧義伺服器', () => {
    expect(() =>
      buildGameServerOutputs({ version: '1', servers: [baseline.servers[0], baseline.servers[0]] }),
    ).toThrow('SERVER_ID_DUPLICATED')
  })
  it.each([
    { version: '', servers: baseline.servers },
    { version: '1', servers: [] },
    { version: '1', servers: [{ id: '', name: '測試' }] },
    { version: '1', servers: [{ id: 'UWO-X', name: ' ' }] },
    { version: '1', servers: [{ id: 'UWO-X', name: '測試', url: '偽造欄位' }] },
  ])('拒絕缺漏或擴充欄位的來源 %j', (input) => {
    expect(() => buildGameServerOutputs(input)).toThrow('SERVER_CATALOG_INVALID')
  })
})
