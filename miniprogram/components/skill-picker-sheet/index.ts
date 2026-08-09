Component({
  options: {
    styleIsolation: 'apply-shared',
  },

  properties: {
    presentation: {
      type: String,
      value: 'inline',
    },
    visible: {
      type: Boolean,
      value: true,
    },
    skillKinds: {
      type: Array,
      value: [],
    },
    skillCategories: {
      type: Array,
      value: [],
    },
    skills: {
      type: Array,
      value: [],
    },
    selectedSkillId: {
      type: String,
      value: '',
    },
    searchText: {
      type: String,
      value: '',
    },
    hasMore: {
      type: Boolean,
      value: false,
    },
    selectionLabel: {
      type: String,
      value: '選擇',
    },
  },

  methods: {
    onDismiss() {
      this.triggerEvent('dismiss')
    },

    onKindChange(event: WechatMiniprogram.TouchEvent) {
      const value = String(event.currentTarget.dataset.value ?? '')
      this.triggerEvent('kind-change', { value })
    },

    onCategoryChange(event: WechatMiniprogram.TouchEvent) {
      const value = String(event.currentTarget.dataset.value ?? '')
      this.triggerEvent('category-change', { value })
    },

    onSearchInput(event: WechatMiniprogram.Input) {
      const value = event.detail.value
      this.triggerEvent('search-input', { value })
    },

    onSkillTap(event: WechatMiniprogram.TouchEvent) {
      const skillId = String(event.currentTarget.dataset.id ?? '')
      this.triggerEvent('skill-tap', { skillId })
    },

    onSelect(event: WechatMiniprogram.TouchEvent) {
      const skillId = String(event.currentTarget.dataset.id ?? '')
      this.triggerEvent('select', { skillId })
    },

    onReachEnd() {
      this.triggerEvent('reach-end')
    },
  },
})
