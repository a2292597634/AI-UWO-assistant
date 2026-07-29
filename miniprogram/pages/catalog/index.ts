const catalogData = require("../../generated/catalog");
const dictData = require("../../generated/dictionaries");

function arrToggle(arr, id) {
  var idx = arr.indexOf(id);
  if (idx >= 0) { var n = arr.slice(); n.splice(idx, 1); return n; }
  return arr.concat([id]);
}

Page({
  data: {
    tabs: ["航海士", "技能", "語言", "職業"],
    activeTab: 0,
    filtered: catalogData,
    filterCount: catalogData.length,
    rarities: dictData.rarities,
    types: dictData.types,
    genders: dictData.genders,
    selectedRarities: [],
    selectedTypes: [],
    selectedGenders: [],
    skillCategories: dictData.skillCategories,
    activeFilter: "all",
    selectedSkillCategories: [],
    languages: dictData.languages,
    selectedLanguages: [],
    jobs: dictData.jobs,
    selectedJobs: [],
  },

  onTabTap: function(e) { this.setData({ activeTab: Number(e.currentTarget.dataset.index) }); },

  toggleFilter: function(e) {
    var f = e.currentTarget.dataset.field;
    var id = e.currentTarget.dataset.id;
    var next = arrToggle(this.data[f], id);
    var u = {}; u[f] = next;
    this.setData(u);
    this.applyFilters(next, f);
  },

  onSkillKindTap: function(e) {
    var k = e.currentTarget.dataset.kind;
    this.setData({ activeFilter: k });
    this.applyFilters();
  },

  toggleSkillCategory: function(e) {
    var id = e.currentTarget.dataset.id;
    var next = arrToggle(this.data.selectedSkillCategories, id);
    this.setData({ selectedSkillCategories: next });
    this.applyFilters(next, "selectedSkillCategories");
  },

  onPortraitError: function(e) {
    var idx = Number(e.currentTarget.dataset.index);
    var f = this.data.filtered.slice();
    f[idx] = Object.assign({}, f[idx], { portraitFail: true });
    this.setData({ filtered: f });
  },

  applyFilters: function(updatedList, updatedField) {
    var d = this.data;
    var selR = updatedField === "selectedRarities" ? updatedList : d.selectedRarities;
    var selT = updatedField === "selectedTypes" ? updatedList : d.selectedTypes;
    var selG = updatedField === "selectedGenders" ? updatedList : d.selectedGenders;
    var selL = updatedField === "selectedLanguages" ? updatedList : d.selectedLanguages;
    var selJ = updatedField === "selectedJobs" ? updatedList : d.selectedJobs;
    var selSC = updatedField === "selectedSkillCategories" ? updatedList : d.selectedSkillCategories;
    var af = d.activeFilter;

    var result = catalogData.slice();
    if (selR.length) result = result.filter(function(o) { return selR.indexOf(o.rarityId) >= 0; });
    if (selT.length) result = result.filter(function(o) { return selT.indexOf(o.typeId) >= 0; });
    if (selG.length) result = result.filter(function(o) { return selG.indexOf(o.genderId) >= 0; });
    if (selL.length) result = result.filter(function(o) { return (o.languages||[]).some(function(l) { return selL.indexOf(l.languageId) >= 0; }); });
    if (selJ.length) result = result.filter(function(o) { return selJ.indexOf(o.jobId) >= 0; });
    if (selSC.length) {
      var details = require("../../generated/details");
      result = result.filter(function(o) {
        var all = o.activeSkills.concat(o.passiveSkills);
        return selSC.every(function(cat) {
          return all.some(function(s) {
            var det = details[o.id];
            var sk = det.skills.find(function(sk2) { return sk2.skillId === s.id; });
            return sk && sk.categoryId === cat;
          });
        });
      });
    }
    if (af === "active") result = result.filter(function(o) { return o.activeSkills.length > 0; });
    else if (af === "passive") result = result.filter(function(o) { return o.passiveSkills.length > 0; });

    var oldMap = {};
    d.filtered.forEach(function(o) { if (o.portraitFail) oldMap[o.id] = true; });
    result = result.map(function(o) { return oldMap[o.id] ? Object.assign({}, o, { portraitFail: true }) : o; });
    this.setData({ filtered: result, filterCount: result.length });
  },

  clearFilters: function() {
    this.setData({
      selectedRarities: [], selectedTypes: [], selectedGenders: [],
      selectedLanguages: [], selectedJobs: [], selectedSkillCategories: [],
      activeFilter: "all",
      filtered: catalogData.map(function(o) { return Object.assign({}, o, { portraitFail: false }); }),
      filterCount: catalogData.length,
    });
  },

  onOfficerTap: function(e) {
    wx.navigateTo({ url: "/pages/detail/index?id=" + e.currentTarget.dataset.id });
  },
});