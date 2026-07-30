const details: any = require('../../details')

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
    const raw: any = details[id]
    if (raw) {
      // Expand compact field names for the WXML template
      const officer = {
        // Short fields mapped to display fields
        name: raw.n,
        rarityId: raw.ri,
        rarityName: raw.rn,
        typeId: raw.ti,
        typeName: raw.tn,
        genderId: raw.gi,
        genderName: raw.gn,
        jobId: raw.ji,
        jobName: raw.jn,
        nationalityId: raw.ni,
        nationalityName: raw.nn,
        portraitPath: raw.pp,
        // Expand languages
        languages: (raw.ls || []).map((l: any) => ({
          languageId: l.li,
          level: l.lv,
          name: l.n,
        })),
        // Expand skills
        skills: (raw.ss || []).map((s: any) => ({
          skillId: s.si,
          kind: s.k,
          sourceGroup: s.sg,
          slot: s.sl,
          unlockLevel: s.ul,
          level: s.lv,
          name: s.n,
          categoryName: s.cn,
          categoryId: s.ci,
          iconPath: s.ip,
        })),
        // Expand recruitment
        recruitment: {
          cityIds: raw.rc.ci,
          cityNames: raw.rc.cn,
          requirementId: raw.rc.ri,
          requirementName: raw.rc.rn,
          requiredOfficerIds: raw.rc.ro,
          note: raw.rc.nt,
        },
      }

      this.setData({
        officer,
        activeSkills: (officer.skills as any[]).filter((s: any) => s.kind === 'active'),
        passiveSkills: (officer.skills as any[]).filter((s: any) => s.kind === 'passive'),
      })
      wx.setNavigationBarTitle({ title: officer.name })
    }
  },

  onPortraitError() {
    this.setData({ portraitFail: true })
  },
})
