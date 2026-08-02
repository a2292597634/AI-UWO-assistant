import type { RuntimeSkill } from '../../../contracts/runtime-data'
import type { SkillSheetView } from '../../../presenters/skill-sheet'
import { emptyDetailState, presentDetail } from '../../runtime/detail-presenter'
import type { DetailPageState } from '../../runtime/detail-presenter'
import { getOfficerDetail } from '../../runtime/detail-store'

interface DetailSkillsBridge {
  skills: Record<string, RuntimeSkill>
}

// Skills stay in the main package and are exposed to this subpackage by the
// generated detail loader bridge, avoiding a page-level generated-data import.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const skillsData = (require('../../detail-loaders') as DetailSkillsBridge).skills

interface DetailPageData extends DetailPageState {
  sheetSkill: SkillSheetView | null
  frameFail: boolean
  rarityIconFail: boolean
  typeIconFail: boolean
}

const eventDataset = (event: WechatMiniprogram.BaseEvent): Record<string, unknown> =>
  (event.currentTarget.dataset as unknown as Record<string, unknown>) ?? {}

Page({
  data: {
    ...emptyDetailState(),
    sheetSkill: null,
    frameFail: false,
    rarityIconFail: false,
    typeIconFail: false,
  } as DetailPageData,

  onLoad(options: Record<string, string | undefined>) {
    const officerId = options.id
    if (!officerId) return

    const record = getOfficerDetail(officerId)
    if (!record) return

    const state = presentDetail(record, skillsData)
    this.setData(state)
    wx.setNavigationBarTitle({ title: state.officer?.name ?? '航海士詳情' })
  },

  onPortraitError() {
    this.setData({ portraitFail: true })
  },

  onPortraitLayerError(event: WechatMiniprogram.BaseEvent) {
    const layer = eventDataset(event)['layer']
    if (layer !== 'frameFail' && layer !== 'rarityIconFail' && layer !== 'typeIconFail') return
    if (this.data[layer]) return

    this.setData({ [layer]: true })
  },

  onSkillTap(event: WechatMiniprogram.BaseEvent) {
    const skillId = eventDataset(event)['skillId']
    if (typeof skillId !== 'string') return

    const skill = this.data.activeSkills
      .concat(this.data.passiveSkills)
      .find((item) => item.skillId === skillId)
    if (!skill) return

    this.setData({ sheetSkill: skill.sheet })
  },

  onSheetDismiss() {
    this.setData({ sheetSkill: null })
  },

  onReverseLookup() {
    const skill = this.data.sheetSkill
    if (!skill) return

    this.setData({ sheetSkill: null })
    wx.redirectTo({ url: '/pages/catalog/index?skillId=' + skill.id })
  },
})
