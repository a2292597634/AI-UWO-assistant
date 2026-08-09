Component({
  options: {
    styleIsolation: 'apply-shared',
  },

  properties: {
    value: {
      type: String,
      value: 'manual',
    },
    options: {
      type: Array,
      value: [],
    },
  },

  methods: {
    onChange(event: WechatMiniprogram.TouchEvent) {
      const value = String(event.currentTarget.dataset.value ?? '')
      if (!value || event.currentTarget.dataset.disabled) return

      this.triggerEvent('change', { value })
    },
  },
})
