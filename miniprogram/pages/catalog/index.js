// ── Constants ──
var PAGE_SIZE = 30
var MAX_SKILL_ICONS = 3 // max icons per active/passive group in list view

// ── Static data (not in reactive data, to reduce serialization cost) ──
var _catalog = null
var _skills = null
var _dict = null

// ── Filter helpers (pure functions — no this.data dependency) ──

/** Filter catalog by all active filter state. Returns filtered array. */
function filterCatalog(catalog, state, skills) {
  var result = catalog.slice()
  var selR = state.selectedRarities
  var selT = state.selectedTypes
  var selG = state.selectedGenders
  var selL = state.selectedLanguages
  var selJ = state.selectedJobs
  var selSC = state.selectedSkillCategories
  var af = state.activeFilter
  var search = (state.searchText || '').trim()

  // Rarity (OR)
  if (selR.length) {
    result = result.filter(function (o) { return selR.indexOf(o.rarityId) >= 0 })
  }
  // Type (OR)
  if (selT.length) {
    result = result.filter(function (o) { return selT.indexOf(o.typeId) >= 0 })
  }
  // Gender (OR)
  if (selG.length) {
    result = result.filter(function (o) { return selG.indexOf(o.genderId) >= 0 })
  }
  // Language (AND — must have ALL selected languages)
  if (selL.length) {
    result = result.filter(function (o) {
      return selL.every(function (languageId) {
        return (o.languages || []).indexOf(languageId) >= 0
      })
    })
  }
  // Job (OR)
  if (selJ.length) {
    result = result.filter(function (o) { return selJ.indexOf(o.jobId) >= 0 })
  }
  // Skill category (AND) + active/passive combo
  if (selSC.length) {
    result = result.filter(function (o) {
      // Determine candidate skills based on active/passive filter
      var candidates
      if (af === 'active') {
        candidates = o.activeSkills || []
      } else if (af === 'passive') {
        candidates = o.passiveSkills || []
      } else {
        candidates = (o.activeSkills || []).concat(o.passiveSkills || [])
      }
      // AND: all selected categories must be present in candidates
      return selSC.every(function (cat) {
        return candidates.some(function (skillId) {
          var s = skills[skillId]
          return s ? s.cat === cat : false
        })
      })
    })
  } else if (af === 'active') {
    // Active-only without category filter
    result = result.filter(function (o) { return (o.activeSkills || []).length > 0 })
  } else if (af === 'passive') {
    // Passive-only without category filter
    result = result.filter(function (o) { return (o.passiveSkills || []).length > 0 })
  }

  // Name search (AND with other filters)
  if (search) {
    var q = search.toLowerCase()
    result = result.filter(function (o) {
      // Match name
      if ((o.name || '').toLowerCase().indexOf(q) >= 0) return true
      // Match aliases (design-defined search aliases)
      var aliases = o.searchAliases || []
      for (var i = 0; i < aliases.length; i++) {
        if (aliases[i].toLowerCase().indexOf(q) >= 0) return true
      }
      return false
    })
  }

  return result
}

/** Check whether any filter is active. */
function hasActiveFilters(state) {
  return (
    (state.selectedRarities && state.selectedRarities.length > 0) ||
    (state.selectedTypes && state.selectedTypes.length > 0) ||
    (state.selectedGenders && state.selectedGenders.length > 0) ||
    (state.selectedLanguages && state.selectedLanguages.length > 0) ||
    (state.selectedJobs && state.selectedJobs.length > 0) ||
    (state.selectedSkillCategories && state.selectedSkillCategories.length > 0) ||
    (state.activeFilter && state.activeFilter !== 'all') ||
    (state.searchText || '').trim() !== ''
  )
}

/** Build precomputed maps for WXML (avoid indexOf / join in templates). */
function buildViewMaps(state) {
  var m = {}
  // Selected rarity map
  m.selectedRarityMap = {}
  ;(state.selectedRarities || []).forEach(function (id) { m.selectedRarityMap[id] = true })
  // Selected type map
  m.selectedTypeMap = {}
  ;(state.selectedTypes || []).forEach(function (id) { m.selectedTypeMap[id] = true })
  // Selected gender map
  m.selectedGenderMap = {}
  ;(state.selectedGenders || []).forEach(function (id) { m.selectedGenderMap[id] = true })
  // Selected language map
  m.selectedLanguageMap = {}
  ;(state.selectedLanguages || []).forEach(function (id) { m.selectedLanguageMap[id] = true })
  // Selected job map
  m.selectedJobMap = {}
  ;(state.selectedJobs || []).forEach(function (id) { m.selectedJobMap[id] = true })
  // Selected skill category map
  m.selectedSkillCategoryMap = {}
  ;(state.selectedSkillCategories || []).forEach(function (id) { m.selectedSkillCategoryMap[id] = true })
  return m
}

// ── Page ──

Page({
  data: {
    tabs: ['航海士', '技能', '語言', '職業'],
    activeTab: 0,
    visibleRows: [],
    filterCount: 0,
    hasActiveFilters: false,
    hasMore: false,
    // Filter options (lightweight — just id + name)
    rarities: [],
    types: [],
    genders: [],
    skillCategories: [],
    languages: [],
    jobs: [],
    // Filter state
    activeFilter: 'all',
    selectedRarities: [],
    selectedTypes: [],
    selectedGenders: [],
    selectedSkillCategories: [],
    selectedLanguages: [],
    selectedJobs: [],
    searchText: '',
    // Precomputed maps for WXML (avoid indexOf in template)
    selectedRarityMap: {},
    selectedTypeMap: {},
    selectedGenderMap: {},
    selectedLanguageMap: {},
    selectedJobMap: {},
    selectedSkillCategoryMap: {},
  },

  onLoad: function () {
    // Load static data into page instance (not reactive data)
    _catalog = require('../../generated/catalog')
    _skills = require('../../generated/skills')
    _dict = require('../../generated/dictionaries')

    // Precompute skill icon paths onto each officer (avoid skillsDict in template data)
    var catalogWithIcons = _catalog.map(function (o) {
      var activeIcons = {}
      var passiveIcons = {}
      ;(o.activeSkills || []).forEach(function (sid) {
        activeIcons[sid] = _skills[sid] ? _skills[sid].ip : ''
      })
      ;(o.passiveSkills || []).forEach(function (sid) {
        passiveIcons[sid] = _skills[sid] ? _skills[sid].ip : ''
      })
      return Object.assign({}, o, {
        activeSkillIcons: activeIcons,
        passiveSkillIcons: passiveIcons,
      })
    })

    // Replace the static catalog with the enriched version
    _catalog = catalogWithIcons

    // Store full list for pagination (in page instance, not reactive data)
    this._filteredAll = _catalog

    // Only put first PAGE_SIZE items into reactive data
    var viewMaps = buildViewMaps(this.data)
    this.setData({
      visibleRows: _catalog.slice(0, PAGE_SIZE),
      filterCount: _catalog.length,
      hasMore: _catalog.length > PAGE_SIZE,
      rarities: _dict.rarities,
      types: _dict.types,
      genders: _dict.genders,
      skillCategories: _dict.skillCategories,
      languages: _dict.languages,
      jobs: _dict.jobs,
      selectedRarityMap: viewMaps.selectedRarityMap,
      selectedTypeMap: viewMaps.selectedTypeMap,
      selectedGenderMap: viewMaps.selectedGenderMap,
      selectedLanguageMap: viewMaps.selectedLanguageMap,
      selectedJobMap: viewMaps.selectedJobMap,
      selectedSkillCategoryMap: viewMaps.selectedSkillCategoryMap,
    })
  },

  onTabTap: function (e) {
    this.setData({ activeTab: Number(e.currentTarget.dataset.index) })
  },

  // ── Filter toggles ──

  toggleFilter: function (e) {
    var field = e.currentTarget.dataset.field
    var id = e.currentTarget.dataset.id
    var arr = this.data[field].slice()
    var idx = arr.indexOf(id)
    if (idx >= 0) {
      arr.splice(idx, 1)
    } else {
      arr.push(id)
    }
    this.applyFilterState(field, arr)
  },

  onSkillKindTap: function (e) {
    var kind = e.currentTarget.dataset.kind
    this.applyFilterState('activeFilter', kind)
  },

  toggleSkillCategory: function (e) {
    var id = e.currentTarget.dataset.id
    var arr = this.data.selectedSkillCategories.slice()
    var idx = arr.indexOf(id)
    if (idx >= 0) {
      arr.splice(idx, 1)
    } else {
      arr.push(id)
    }
    this.applyFilterState('selectedSkillCategories', arr)
  },

  // ── Search ──

  onSearchInput: function (e) {
    this.applyFilterState('searchText', e.detail.value || '')
  },

  onSearchClear: function () {
    this.applyFilterState('searchText', '')
  },

  // ── Core: apply one filter change and recompute ──

  applyFilterState: function (key, value) {
    // Build next state from current data + the one change
    // (avoids reading this.data after setData)
    var nextState = {}
    nextState.selectedRarities = key === 'selectedRarities' ? value : this.data.selectedRarities
    nextState.selectedTypes = key === 'selectedTypes' ? value : this.data.selectedTypes
    nextState.selectedGenders = key === 'selectedGenders' ? value : this.data.selectedGenders
    nextState.selectedLanguages = key === 'selectedLanguages' ? value : this.data.selectedLanguages
    nextState.selectedJobs = key === 'selectedJobs' ? value : this.data.selectedJobs
    nextState.selectedSkillCategories = key === 'selectedSkillCategories' ? value : this.data.selectedSkillCategories
    nextState.activeFilter = key === 'activeFilter' ? value : this.data.activeFilter
    nextState.searchText = key === 'searchText' ? value : (this.data.searchText || '')

    // Compute filtered results using pure function
    var filtered = filterCatalog(_catalog, nextState, _skills)

    // Preserve portraitFail flags
    var oldMap = {}
    ;(this.data.visibleRows || []).forEach(function (o) { if (o.portraitFail) oldMap[o.id] = true })
    filtered = filtered.map(function (o) {
      return oldMap[o.id] ? Object.assign({}, o, { portraitFail: true }) : o
    })

    // Store full filtered result for pagination (in page instance, not reactive)
    this._filteredAll = filtered

    // Build precomputed maps for WXML
    var viewMaps = buildViewMaps(nextState)

    // Only send first page to view layer
    var visible = filtered.slice(0, PAGE_SIZE)

    // Single setData with everything computed
    var update = {
      visibleRows: visible,
      filterCount: filtered.length,
      hasActiveFilters: hasActiveFilters(nextState),
      hasMore: filtered.length > PAGE_SIZE,
      activeFilter: nextState.activeFilter,
      selectedRarities: nextState.selectedRarities,
      selectedTypes: nextState.selectedTypes,
      selectedGenders: nextState.selectedGenders,
      selectedLanguages: nextState.selectedLanguages,
      selectedJobs: nextState.selectedJobs,
      selectedSkillCategories: nextState.selectedSkillCategories,
      searchText: nextState.searchText,
      selectedRarityMap: viewMaps.selectedRarityMap,
      selectedTypeMap: viewMaps.selectedTypeMap,
      selectedGenderMap: viewMaps.selectedGenderMap,
      selectedLanguageMap: viewMaps.selectedLanguageMap,
      selectedJobMap: viewMaps.selectedJobMap,
      selectedSkillCategoryMap: viewMaps.selectedSkillCategoryMap,
    }
    this.setData(update)
  },

  // ── Clear all filters ──

  clearFilters: function () {
    var viewMaps = buildViewMaps({
      selectedRarities: [],
      selectedTypes: [],
      selectedGenders: [],
      selectedLanguages: [],
      selectedJobs: [],
      selectedSkillCategories: [],
      activeFilter: 'all',
      searchText: '',
    })
    this._filteredAll = _catalog
    this.setData({
      selectedRarities: [],
      selectedTypes: [],
      selectedGenders: [],
      selectedLanguages: [],
      selectedJobs: [],
      selectedSkillCategories: [],
      activeFilter: 'all',
      searchText: '',
      hasActiveFilters: false,
      visibleRows: _catalog.slice(0, PAGE_SIZE),
      filterCount: _catalog.length,
      hasMore: _catalog.length > PAGE_SIZE,
      selectedRarityMap: viewMaps.selectedRarityMap,
      selectedTypeMap: viewMaps.selectedTypeMap,
      selectedGenderMap: viewMaps.selectedGenderMap,
      selectedLanguageMap: viewMaps.selectedLanguageMap,
      selectedJobMap: viewMaps.selectedJobMap,
      selectedSkillCategoryMap: viewMaps.selectedSkillCategoryMap,
    })
  },

  // ── Pagination: load more on scroll to bottom ──

  loadMore: function () {
    if (!this._filteredAll) return
    var currentLen = this.data.visibleRows.length
    var total = this._filteredAll.length
    if (currentLen >= total) return

    var nextBatch = this._filteredAll.slice(currentLen, currentLen + PAGE_SIZE)
    var visibleRows = this.data.visibleRows.concat(nextBatch)
    var hasMore = currentLen + PAGE_SIZE < total

    this.setData({
      visibleRows: visibleRows,
      hasMore: hasMore,
    })
  },

  // ── Image error (only update the specific field, guard against recursive triggers) ──

  onPortraitError: function (e) {
    var idx = Number(e.currentTarget.dataset.index)
    // Guard: if already marked as failed, skip to prevent recursive setData loops
    var item = this.data.visibleRows[idx]
    if (!item || item.portraitFail) return
    // Only update the specific field, not the whole array
    var update = {}
    update['visibleRows[' + idx + '].portraitFail'] = true
    this.setData(update)
  },

  // ── Navigate to detail ──

  onOfficerTap: function (e) {
    wx.navigateTo({ url: '/subpkg-detail/pages/detail/index?id=' + e.currentTarget.dataset.id })
  },
})
