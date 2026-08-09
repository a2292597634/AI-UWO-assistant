Component({
  properties: {
    title: {
      type: String,
      value: '',
    },
    hint: {
      type: String,
      value: '',
    },
    countLabel: {
      type: String,
      value: '',
    },
    defaultExpanded: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    expanded: false,
  },

  lifetimes: {
    attached() {
      this.setData({ expanded: this.data.defaultExpanded })
    },
  },

  methods: {
    onToggle() {
      this.setData({ expanded: !this.data.expanded })
    },
  },
})
