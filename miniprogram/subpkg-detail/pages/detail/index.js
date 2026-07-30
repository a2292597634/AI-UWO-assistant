var details = require('../../details')

Page({
  data: {
    officer: null,
    portraitFail: false,
    activeSkills: [],
    passiveSkills: [],
  },

  onLoad: function (options) {
    var id = options.id
    if (!id) return
    var raw = details[id]
    if (raw) {
      var officer = {
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
        languages: (raw.ls || []).map(function (l) {
          return { languageId: l.li, level: l.lv, name: l.n }
        }),
        skills: (raw.ss || []).map(function (s) {
          return {
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
          }
        }),
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
        officer: officer,
        activeSkills: officer.skills.filter(function (s) {
          return s.kind === 'active'
        }),
        passiveSkills: officer.skills.filter(function (s) {
          return s.kind === 'passive'
        }),
      })
      wx.setNavigationBarTitle({ title: officer.name })
    }
  },

  onPortraitError: function () {
    this.setData({ portraitFail: true })
  },
})
