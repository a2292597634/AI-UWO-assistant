import { describe, expect, it } from 'vitest'
import { parseCloudbaseOutput, readNoSqlRows } from '../../tools/message-board/cli-output'

describe('管理 CLI 輸出診斷邊界', () => {
  it('實際 QUERY 結果直接是資料列陣列，保留 BSON 欄位與布林值', () => {
    const row = { _id: 'event-id', matched: false, errCode: { $numberInt: '0' } }
    expect(readNoSqlRows({ results: [[row]] })).toEqual([row])
  })
  it('原生 find 命令的 cursor firstBatch 另行辨識', () => {
    expect(
      readNoSqlRows({ results: [[{ cursor: { firstBatch: [{ _id: 'event-id' }] } }]] }),
    ).toEqual([{ _id: 'event-id' }])
  })
  it.each([{}, { results: [[]] }, { results: [[null]] }])(
    '查詢空資料與格式錯誤不冒充存在 %j',
    (value) => {
      if ('results' in value && Array.isArray(value.results?.[0]) && value.results[0].length === 0)
        expect(readNoSqlRows(value)).toEqual([])
      else expect(() => readNoSqlRows(value)).toThrow('CLI_QUERY_RESULT_INVALID')
    },
  )
  it('資訊行不妨礙 JSON，保留真正 data', () => {
    expect(
      parseCloudbaseOutput(
        'i → TCB.DescribeCloudBaseGWPrivilege\n{\n"data":{"EnableAuth":false}\n}\n',
      ),
    ).toEqual({ EnableAuth: false })
  })
  it('沒有 JSON 的成功操作只有明确允许时才返回 null', () => {
    expect(() => parseCloudbaseOutput('i Updating function')).toThrow('CLI_JSON_MISSING')
    expect(parseCloudbaseOutput('i Updating function', true)).toBeNull()
  })
  it.each(['{"error":"denied"}', '{"data":{"Error":{"Code":"Denied"}}}', '{"data":{}, trailing}'])(
    '拒絕錯誤或損壞輸出 %s',
    (output) => {
      expect(() => parseCloudbaseOutput(output)).toThrow()
    },
  )
})
