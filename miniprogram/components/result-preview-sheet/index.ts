Component({
  options: {
    styleIsolation: 'apply-shared',
  },

  properties: {
    visible: {
      type: Boolean,
      value: false,
    },
    preview: {
      type: Object,
      value: null,
    },
    canUndo: {
      type: Boolean,
      value: false,
    },
  },

  methods: {
    onCancel() {
      this.triggerEvent('cancel')
    },

    onApply() {
      this.triggerEvent('apply')
    },

    onUndo() {
      this.triggerEvent('undo')
    },

    onDismissUndo() {
      this.triggerEvent('dismiss-undo')
    },

    onNoop() {},
  },
})
