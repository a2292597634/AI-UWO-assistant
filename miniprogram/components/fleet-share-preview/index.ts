Component({
  options: {
    styleIsolation: 'apply-shared',
  },

  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: '分享圖預覽' },
    imagePath: { type: String, value: '' },
    status: { type: String, value: 'ready' },
    errorMessage: { type: String, value: '' },
    degradedAssetCount: { type: Number, value: 0 },
    automationScrollIntoView: { type: String, value: '' },
  },

  methods: {
    onClose() {
      this.triggerEvent('close')
    },

    onShare() {
      this.triggerEvent('share')
    },

    onSave() {
      this.triggerEvent('save')
    },

    onRetry() {
      this.triggerEvent('retry')
    },

    onNoop() {},
  },
})
