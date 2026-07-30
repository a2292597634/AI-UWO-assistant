// MINIMAL TEST — to isolate WXML compilation issue
Page({
  data: {
    tabs: ['航海士', '技能', '語言', '職業'],
    activeTab: 0,
    filtered: [],
    filterCount: 0,
    rarities: [],
    types: [],
    genders: [],
    selectedRarities: [],
    selectedTypes: [],
    selectedGenders: [],
    skillCategories: [],
    activeFilter: 'all',
    selectedSkillCategories: [],
    languages: [],
    selectedLanguages: [],
    jobs: [],
    selectedJobs: [],
    skillsDict: {},
  },

  onLoad: function () {
    var catalogData = require('../../generated/catalog')
    var dictData = require('../../generated/dictionaries')
    var skillsData = require('../../generated/skills')
    this.setData({
      filtered: catalogData,
      filterCount: catalogData.length,
      rarities: dictData.rarities,
      types: dictData.types,
      genders: dictData.genders,
      skillCategories: dictData.skillCategories,
      languages: dictData.languages,
      jobs: dictData.jobs,
      skillsDict: skillsData,
    })
  },

  onTabTap: function (e) {
    this.setData({ activeTab: Number(e.currentTarget.dataset.index) })
  },

  toggleFilter: function (e) {
    var f = e.currentTarget.dataset.field
    var id = e.currentTarget.dataset.id
    var arr = this.data[f]
    var idx = arr.indexOf(id)
    var next = idx >= 0 ? arr.filter(function (_, i) { return i !== idx }) : arr.concat([id])
    var u = {}
    u[f] = next
    this.setData(u)
    this.applyFilters()
  },

  onSkillKindTap: function (e) {
    this.setData({ activeFilter: e.currentTarget.dataset.kind })
    this.applyFilters()
  },

  toggleSkillCategory: function (e) {
    var id = e.currentTarget.dataset.id
    var arr = this.data.selectedSkillCategories
    var idx = arr.indexOf(id)
    var next = idx >= 0 ? arr.filter(function (_, i) { return i !== idx }) : arr.concat([id])
    this.setData({ selectedSkillCategories: next })
    this.applyFilters()
  },

  onPortraitError: function (e) {
    var idx = Number(e.currentTarget.dataset.index)
    var f = this.data.filtered.slice()
    if (f[idx]) {
      f[idx] = Object.assign({}, f[idx], { portraitFail: true })
      this.setData({ filtered: f })
    }
  },

  applyFilters: function () {
    var d = this.data
    var catalogData = require('../../generated/catalog')
    var skillsData = require('../../generated/skills')
    var selR = d.selectedRarities
    var selT = d.selectedTypes
    var selG = d.selectedGenders
    var selL = d.selectedLanguages
    var selJ = d.selectedJobs
    var selSC = d.selectedSkillCategories
    var af = d.activeFilter

    var result = catalogData.slice()
    if (selR.length)
      result = result.filter(function (o) { return selR.indexOf(o.rarityId) >= 0 })
    if (selT.length)
      result = result.filter(function (o) { return selT.indexOf(o.typeId) >= 0 })
    if (selG.length)
      result = result.filter(function (o) { return selG.indexOf(o.genderId) >= 0 })
    if (selL.length)
      result = result.filter(function (o) {
        return (o.languages || []).some(function (l) { return selL.indexOf(l) >= 0 })
      })
    if (selJ.length)
      result = result.filter(function (o) { return selJ.indexOf(o.jobId) >= 0 })
    if (selSC.length) {
      var self = this
      result = result.filter(function (o) {
        var all = (o.activeSkills || []).concat(o.passiveSkills || [])
        return selSC.every(function (cat) {
          return all.some(function (skillId) {
            var s = skillsData[skillId]
            return s ? s.cat === cat : false
          })
        })
      })
    }
    if (af === 'active')
      result = result.filter(function (o) { return (o.activeSkills || []).length > 0 })
    else if (af === 'passive')
      result = result.filter(function (o) { return (o.passiveSkills || []).length > 0 })

    var oldMap = {}
    d.filtered.forEach(function (o) { if (o.portraitFail) oldMap[o.id] = true })
    result = result.map(function (o) {
      return oldMap[o.id] ? Object.assign({}, o, { portraitFail: true }) : o
    })
    this.setData({ filtered: result, filterCount: result.length })
  },

  clearFilters: function () {
    var catalogData = require('../../generated/catalog')
    this.setData({
      selectedRarities: [],
      selectedTypes: [],
      selectedGenders: [],
      selectedLanguages: [],
      selectedJobs: [],
      selectedSkillCategories: [],
      activeFilter: 'all',
      filtered: catalogData.map(function (o) { return Object.assign({}, o, { portraitFail: false }) }),
      filterCount: catalogData.length,
    })
  },

  onOfficerTap: function (e) {
    wx.navigateTo({ url: '/subpkg-detail/pages/detail/index?id=' + e.currentTarget.dataset.id })
  },
})
