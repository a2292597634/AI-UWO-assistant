Component({
  options: {
    styleIsolation: 'apply-shared',
  },

  properties: {
    visible: {
      type: Boolean,
      value: false,
    },
    configs: {
      type: Array,
      value: [],
    },
    activeConfigId: {
      type: String,
      value: '',
    },
  },

  methods: {
    onNoop() {},

    onClose() {
      this.triggerEvent('close')
    },

    onSelect(event: WechatMiniprogram.BaseEvent) {
      const configId = event.currentTarget.dataset.id
      if (typeof configId === 'string' && configId) {
        this.triggerEvent('select', { id: configId })
      }
    },
  },
})
