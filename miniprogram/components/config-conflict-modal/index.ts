Component({
  options: {
    styleIsolation: 'apply-shared',
  },

  properties: {
    configName: { type: String, value: '' },
    canForce: { type: Boolean, value: false },
    visible: {
      type: Boolean,
      value: false,
    },
  },

  methods: {
    onNoop() {},

    onReload() {
      this.triggerEvent('reload')
    },

    onForce() {
      if (!this.properties.canForce) return
      this.triggerEvent('force')
    },

    onCancel() {
      this.triggerEvent('cancel')
    },
  },
})
