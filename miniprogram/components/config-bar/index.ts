Component({
  options: {
    styleIsolation: 'apply-shared',
  },

  properties: {
    configName: {
      type: String,
      value: '',
    },
    configStatus: {
      type: String,
      value: 'new',
    },
    authStatus: {
      type: String,
      value: 'guest',
    },
    activeConfigId: {
      type: String,
      value: '',
    },
    showMenu: {
      type: Boolean,
      value: false,
    },
  },

  methods: {
    onInfoTap() {
      this.triggerEvent('info-tap')
    },

    onLoginTap() {
      this.triggerEvent('login-tap')
    },

    onMenuTap() {
      this.triggerEvent('menu-tap')
    },

    onSave() {
      this.triggerEvent('save')
    },

    onSaveAs() {
      this.triggerEvent('save-as')
    },

    onRename() {
      this.triggerEvent('rename')
    },

    onDelete() {
      this.triggerEvent('delete')
    },

    onNew() {
      this.triggerEvent('new')
    },
  },
})
