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
  assetLoading: boolean
  assetLoadError: string | null
  assetReady: boolean
  failedSkillImages: Record<string, boolean>
  frameFail: boolean
  rarityIconFail: boolean
  typeIconFail: boolean
}

const officerIdByPage = new WeakMap<object, string>()
const retryCountByPage = new WeakMap<object, number>()
const eventDataset = (event: WechatMiniprogram.BaseEvent): Record<string, unknown> =>
  (event.currentTarget.dataset as unknown as Record<string, unknown>) ?? {}

Page({
  data: {
    ...emptyDetailState(),
    sheetSkill: null,
    assetLoading: false,
    assetLoadError: null,
    assetReady: false,
    failedSkillImages: {},
    frameFail: false,
    rarityIconFail: false,
    typeIconFail: false,
  } as DetailPageData,

  onLoad(options: Record<string, string | undefined>) {
    const officerId = options.id
    if (!officerId) return
    officerIdByPage.set(this, officerId)
    if (!retryCountByPage.has(this)) retryCountByPage.set(this, 0)

    const record = getOfficerDetail(officerId)
    if (!record) return

    const state = presentDetail(record, skillsData)
    this.setData({
      ...state,
      assetLoading: false,
      assetLoadError: null,
      assetReady: true,
      failedSkillImages: {},
    })
    wx.setNavigationBarTitle({ title: state.officer?.name ?? '航海士詳情' })

    return Promise.resolve()
  },

  onReady() {
    return Promise.resolve()
  },

  retryAssetLoading() {
    const officerId = officerIdByPage.get(this)
    const retryCount = retryCountByPage.get(this) ?? 0
    if (!officerId || retryCount >= 1) return Promise.resolve()
    retryCountByPage.set(this, retryCount + 1)
    return this.onLoad({ id: officerId })
  },

  onPortraitError() {
    this.setData({ portraitFail: true })
  },

  onSkillImageError(event: WechatMiniprogram.BaseEvent) {
    const skillId = eventDataset(event)['skillId']
    if (typeof skillId !== 'string' || !skillId) return

    this.setData({
      assetReady: true,
      assetLoadError: null,
      failedSkillImages: { ...this.data.failedSkillImages, [skillId]: true },
    })
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
