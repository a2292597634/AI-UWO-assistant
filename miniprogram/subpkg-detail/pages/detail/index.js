// Compute the same shard as build-runtime-data.ts shardFor.
// Must stay in sync with tools/data-pipeline/build-runtime-data.ts.
var shardFor = function (officerId) {
  var filename = officerId + '.png'
  var id = filename.replace(/\.png$/, '').replace(/^(officer|skill)_/, '')
  var hash = 0
  for (var i = 0; i < id.length; i++) hash = ((hash * 31 + id.charCodeAt(i)) >>> 0)
  return hash % 10
}

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

    // Lazy-load only the shard chunk that contains this officer
    var shard = shardFor(id)
    var chunk = require('../../details-' + shard + '.js')
    var raw = chunk[id]
    if (!raw) return

    var recruitmentCityText = (raw.rc.cn && raw.rc.cn.length > 0)
      ? raw.rc.cn.join('、')
      : '無'

    var officer = {
      name: raw.n,
      rarityName: raw.rn,
      typeName: raw.tn,
      genderName: raw.gn,
      jobName: raw.jn,
      nationalityName: raw.nn,
      portraitPath: raw.pp,
      languages: (raw.ls || []).map(function (l) {
        return { languageId: l.li, level: l.lv, name: l.n }
      }),
      skills: (raw.ss || []).map(function (s) {
        return {
          skillId: s.si,
          kind: s.k,
          unlockLevel: s.ul,
          level: s.lv,
          name: s.n,
          iconPath: s.ip,
        }
      }),
      recruitment: {
        cityText: recruitmentCityText,
        requirementName: raw.rc.rn,
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
  },

  onPortraitError: function () {
    this.setData({ portraitFail: true })
  },
})
