Component({
  options: {
    styleIsolation: 'apply-shared',
  },

  properties: {
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
      this.triggerEvent('force')
    },

    onCancel() {
      this.triggerEvent('cancel')
    },
  },
})
