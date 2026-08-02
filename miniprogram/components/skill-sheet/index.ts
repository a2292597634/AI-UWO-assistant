Component({
  properties: {
    skill: {
      type: Object,
      value: null,
    },
  },

  methods: {
    onDismiss() {
      this.triggerEvent('dismiss')
    },

    onReverseLookup() {
      this.triggerEvent('reverselookup')
    },

    stopPropagation() {},
  },
})
