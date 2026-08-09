Component({
  options: {
    styleIsolation: 'apply-shared',
  },

  properties: {
    officerId: {
      type: String,
      value: '',
    },
    status: {
      type: String,
      value: 'normal',
    },
    variant: {
      type: String,
      value: 'slot',
    },
    allowBan: {
      type: Boolean,
      value: false,
    },
    disabledActions: {
      type: Array,
      value: [],
      observer(value: string[]) {
        const actions = Array.isArray(value) ? value : []
        this.setData({
          lockDisabled: actions.includes('lock'),
          removeDisabled: actions.includes('remove'),
          banDisabled: actions.includes('ban'),
        })
      },
    },
  },

  data: {
    lockDisabled: false,
    removeDisabled: false,
    banDisabled: false,
  },

  methods: {
    onLock(event: WechatMiniprogram.TouchEvent) {
      const officerId = String(event.currentTarget.dataset.id ?? '')
      if (!officerId) return

      this.triggerEvent('lock', { officerId })
    },

    onRemove(event: WechatMiniprogram.TouchEvent) {
      const officerId = String(event.currentTarget.dataset.id ?? '')
      if (!officerId) return

      this.triggerEvent('remove', { officerId })
    },

    onBan(event: WechatMiniprogram.TouchEvent) {
      const officerId = String(event.currentTarget.dataset.id ?? '')
      if (!officerId) return

      this.triggerEvent('ban', { officerId })
    },
  },
})
