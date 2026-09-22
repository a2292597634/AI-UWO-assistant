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
    configList: {
      type: Array,
      value: [],
    },
    unclassifiedConfigs: {
      type: Array,
      value: [],
    },
    listState: {
      type: String,
      value: 'idle',
    },
    listError: {
      type: String,
      value: '',
    },
    loadError: {
      type: String,
      value: '',
    },
    expanded: {
      type: Boolean,
      value: false,
    },
    shareStatus: {
      type: String,
      value: 'idle',
    },
    prominentShare: {
      type: Boolean,
      value: false,
    },
  },

  methods: {
    onToggle() {
      this.triggerEvent('toggle')
    },

    onShare() {
      this.triggerEvent('share')
    },

    onLogin() {
      this.triggerEvent('login')
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

    onExit() {
      this.triggerEvent('exit')
    },

    onLoad(event: WechatMiniprogram.BaseEvent) {
      const id = event.currentTarget.dataset.id
      this.triggerEvent('load', { id })
    },

    onClassify(event: WechatMiniprogram.BaseEvent) {
      const { id, scope } = event.currentTarget.dataset
      this.triggerEvent('classify', { id, scope })
    },

    onRetry() {
      this.triggerEvent('retry')
    },
  },
})
