Component({
  options: {
    styleIsolation: 'apply-shared',
  },

  properties: {
    visible: { type: Boolean, value: false },
    imagePath: { type: String, value: '' },
    status: { type: String, value: 'ready' },
    errorMessage: { type: String, value: '' },
    degradedAssetCount: { type: Number, value: 0 },
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
