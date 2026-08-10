Component({
  options: {
    styleIsolation: 'apply-shared',
  },

  properties: {
    visible: {
      type: Boolean,
      value: false,
    },
    title: {
      type: String,
      value: '配置名稱',
    },
    value: {
      type: String,
      value: '',
    },
  },

  methods: {
    onNoop() {},

    onCancel() {
      this.triggerEvent('cancel')
    },

    onInput(event: WechatMiniprogram.Input) {
      this.setData({ value: event.detail.value })
      this.triggerEvent('input', { value: event.detail.value })
    },

    onConfirm() {
      this.triggerEvent('confirm', { value: this.data.value })
    },
  },
})
