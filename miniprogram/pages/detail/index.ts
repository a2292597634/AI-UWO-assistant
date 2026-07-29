const details: any = require("../../generated/details")

Page({
  data: {
    officer: null as any,
    portraitFail: false,
    activeSkills: [] as any[],
    passiveSkills: [] as any[],
  },

  onLoad(options: Record<string, string | undefined>) {
    const id = options.id
    if (!id) return
    const officer: any = details[id]
    if (officer) {
      this.setData({
        officer,
        activeSkills: (officer.skills as any[]).filter((s: any) => s.kind === "active"),
        passiveSkills: (officer.skills as any[]).filter((s: any) => s.kind === "passive"),
      })
      wx.setNavigationBarTitle({ title: officer.name as string })
    }
  },

  onPortraitError() {
    this.setData({ portraitFail: true })
  },
})
