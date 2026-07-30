import { getOfficerDetail } from '../../runtime/detail-store'
import {
  presentDetail,
  emptyDetailState,
} from '../../runtime/detail-presenter'

Page({
  data: emptyDetailState(),

  onLoad(options: Record<string, string | undefined>) {
    const id = options.id
    if (!id) return

    const raw = getOfficerDetail(id)
    if (!raw) return

    const state = presentDetail(raw)

    this.setData(state)
    wx.setNavigationBarTitle({ title: state.officer?.name ?? '' })
  },

  onPortraitError() {
    this.setData({ portraitFail: true })
  },
})
