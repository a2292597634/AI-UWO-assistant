const getFallbackLabel = (categoryName: string): string => {
  const normalized = categoryName.trim()
  return normalized ? (Array.from(normalized)[0] ?? '技') : '技'
}

Component({
  options: {
    styleIsolation: 'apply-shared',
  },

  properties: {
    iconPath: {
      type: String,
      value: '',
    },
    skillName: {
      type: String,
      value: '技能',
    },
    categoryName: {
      type: String,
      value: '技能',
    },
    level: {
      type: Number,
      value: 0,
    },
    assetReady: {
      type: Boolean,
      value: false,
    },
    large: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    imageFailed: false,
    fallbackLabel: '技',
  },

  observers: {
    categoryName(categoryName: string) {
      this.setData({ fallbackLabel: getFallbackLabel(categoryName) })
    },
    'iconPath, assetReady'() {
      if (this.data.imageFailed) this.setData({ imageFailed: false })
    },
  },

  methods: {
    onImageError() {
      if (!this.data.imageFailed) this.setData({ imageFailed: true })
    },
  },
})
