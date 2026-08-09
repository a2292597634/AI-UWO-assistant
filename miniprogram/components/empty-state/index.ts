Component({
  options: {
    styleIsolation: 'apply-shared',
  },

  properties: {
    title: {
      type: String,
      value: '暫無資料',
    },
    description: {
      type: String,
      value: '目前沒有可顯示的內容',
    },
    actionLabel: {
      type: String,
      value: '返回',
    },
    showAction: {
      type: Boolean,
      value: false,
    },
  },

  methods: {
    onAction() {
      this.triggerEvent('action')
    },
  },
})
