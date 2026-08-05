import { describe, expect, it } from 'vitest'
import {
  buildSkillLevelRows,
  buildSkillSheet,
  parseLevelInfo,
} from '../../miniprogram/presenters/skill-sheet'
import type { RuntimeSkill } from '../../miniprogram/contracts/runtime-data'

describe('buildSkillLevelRows', () => {
  it('用各等級來源值產生十句完整說明', () => {
    const rows = buildSkillLevelRows(
      '購買工藝品時，可以用減少1％的價格購買。',
      'Lv1: 1% | Lv2: 2.5% | Lv3: 3% | Lv4: 3.5% | Lv5: 5.5% | Lv6: 6% | Lv7: 6.5% | Lv8: 7% | Lv9: 7.5% | Lv10: 10%',
    )

    expect(rows).toHaveLength(10)
    expect(rows[0]).toEqual({
      level: 1,
      label: 'Lv.1',
      description: '購買工藝品時，可以用減少1％的價格購買。',
      missing: false,
    })
    expect(rows[9]!.description).toBe('購買工藝品時，可以用減少10％的價格購買。')
  })

  it('缺少來源等級時明確標示暫無資料', () => {
    const rows = buildSkillLevelRows('效果增加1%。', 'Lv1: 1%')

    expect(rows[1]).toEqual({
      level: 2,
      label: 'Lv.2',
      description: '此等級暫無資料',
      missing: true,
    })
  })

  it('依來源順序替換同一句內的多個數值', () => {
    const rows = buildSkillLevelRows(
      '行動結束時以12.6％的機率再次行動一次，機動力恢復6.1%。不發生其他行動效果，只可進行1次額外行動。',
      'Lv1: 12.6% / 6.1% / 1 | Lv2: 15.4% / 8.2% / 1',
    )

    expect(rows[1]!.description).toBe(
      '行動結束時以15.4％的機率再次行動一次，機動力恢復8.2%。不發生其他行動效果，只可進行1次額外行動。',
    )
    expect(parseLevelInfo('Lv1: 12.6% / 6.1% / 1').get(1)).toEqual(['12.6%', '6.1%', '1'])
  })

  it('來源 token 順序和句中順序不同時仍逐項配對', () => {
    const rows = buildSkillLevelRows(
      '使我方全體防禦力增加10%，持續3回合。',
      'Lv1: 3 / 10% | Lv2: 3 / 12.3%',
    )

    expect(rows[1]!.description).toBe('使我方全體防禦力增加12.3%，持續3回合。')
  })
})

describe('buildSkillSheet', () => {
  it('建立元件可直接呈現的技能資訊模型', () => {
    const skill: RuntimeSkill = {
      id: 'skill_skill200681',
      n: '工藝品購買折扣',
      cat: 'skill_category_trade_price_adjustment',
      cn: '價格調整',
      ip: '/subpkg-assets-0/imgs/skill_skill200681.png',
      d: '購買工藝品時，可以用減少1％的價格購買。',
      li: 'Lv1: 1% | Lv10: 10%',
    }

    const view = buildSkillSheet(skill, 'active')

    expect(view).toMatchObject({
      id: 'skill_skill200681',
      name: '工藝品購買折扣',
      iconPath: '/subpkg-assets-0/imgs/skill_skill200681.png',
      kind: 'active',
      kindLabel: '主動技能',
      category: '價格調整',
      description: '購買工藝品時，可以用減少1％的價格購買。',
    })
    expect(view.levels).toHaveLength(10)
  })
})
