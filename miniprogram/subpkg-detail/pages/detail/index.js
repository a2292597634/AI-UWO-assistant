// Compute the same shard as build-runtime-data.ts shardFor.
// Must stay in sync with tools/data-pipeline/build-runtime-data.ts.
var shardFor = function (officerId) {
  var filename = officerId + '.png'
  var id = filename.replace(/\.png$/, '').replace(/^(officer|skill)_/, '')
  var hash = 0
  for (var i = 0; i < id.length; i++) hash = ((hash * 31 + id.charCodeAt(i)) >>> 0)
  return hash % 10
}

// Static loader map — avoids dynamic require path (WeChat build compatibility)
var DETAIL_LOADERS = [
  function () { return require('../../details-0.js') },
  function () { return require('../../details-1.js') },
  function () { return require('../../details-2.js') },
  function () { return require('../../details-3.js') },
  function () { return require('../../details-4.js') },
  function () { return require('../../details-5.js') },
  function () { return require('../../details-6.js') },
  function () { return require('../../details-7.js') },
  function () { return require('../../details-8.js') },
  function () { return require('../../details-9.js') },
]

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
    var chunk = DETAIL_LOADERS[shard]()
    var raw = chunk[id]
    if (!raw) return

    var recruitmentCityText = (raw.rc.cn && raw.rc.cn.length > 0)
      ? raw.rc.cn.join('、')
      : '無'

    // Build active/passive skill arrays directly from raw data
    // (avoid duplicating skills inside the officer object)
    var activeSkills = []
    var passiveSkills = []
    ;(raw.ss || []).forEach(function (s) {
      var skill = {
        skillId: s.si,
        kind: s.k,
        unlockLevel: s.ul,
        level: s.lv,
        name: s.n,
        iconPath: s.ip,
      }
      if (s.k === 'active') {
        activeSkills.push(skill)
      } else {
        passiveSkills.push(skill)
      }
    })

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
      recruitment: {
        cityText: recruitmentCityText,
        requirementName: raw.rc.rn,
        note: raw.rc.nt,
      },
    }

    this.setData({
      officer: officer,
      activeSkills: activeSkills,
      passiveSkills: passiveSkills,
    })
    wx.setNavigationBarTitle({ title: officer.name })
  },

  onPortraitError: function () {
    this.setData({ portraitFail: true })
  },
})
