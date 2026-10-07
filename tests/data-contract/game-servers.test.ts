import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GAME_SERVERS } from '../../miniprogram/contracts/coupon-redemption'
import { checkMasterDataset } from '../../tools/data-audit/check-master-dataset'

describe('伺服器資料共用契約', () => {
  it('兩個雲函數與客戶端均讀取同一生成資料', () => {
    const master = JSON.parse(readFileSync('data/master/game-servers.json', 'utf8'))
    expect(GAME_SERVERS).toEqual(master.servers)
    for (const name of ['coupon-redemption', 'message-board'])
      expect(JSON.parse(readFileSync(`cloudfunctions/${name}/game-servers.json`, 'utf8'))).toEqual(
        master,
      )
    expect(checkMasterDataset().filter((finding) => finding.severity === 'error')).toEqual([])
  })
})
