import {
  searchMaintenanceOptions,
  type MaintenanceEntityOption,
} from '../../presenters/maintenance-option-presenter'

const toOptions = (value: unknown): readonly MaintenanceEntityOption[] =>
  Array.isArray(value) ? (value as readonly MaintenanceEntityOption[]) : []

const toSelectedIds = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.map((item) => String(item)) : []

Component({
  options: {
    styleIsolation: 'apply-shared',
  },

  properties: {
    options: {
      type: Array,
      value: [],
    },
    selectedIds: {
      type: Array,
      value: [],
    },
    allowCandidate: {
      type: Boolean,
      value: false,
    },
    label: {
      type: String,
      value: '選擇關聯資料',
    },
  },

  data: {
    query: '',
    hasQuery: false,
    resultsExpanded: false,
    filteredOptions: [] as MaintenanceEntityOption[],
    selectedOptions: [] as MaintenanceEntityOption[],
  },

  observers: {
    'options, selectedIds'() {
      this.refreshOptions(this.data.query)
    },
  },

  methods: {
    refreshOptions(query: string, expandOnQuery = false) {
      const options = toOptions(this.properties.options)
      const selectedIds = new Set(toSelectedIds(this.properties.selectedIds))
      const selectedOptions = options.filter((option) => selectedIds.has(option.id))
      const filteredOptions = searchMaintenanceOptions(options, query).filter(
        (option) => !selectedIds.has(option.id),
      )
      const hasQuery = query.trim().length > 0

      this.setData({
        query,
        hasQuery,
        filteredOptions,
        selectedOptions,
        resultsExpanded: hasQuery && (expandOnQuery || this.data.resultsExpanded),
      })
    },

    onQueryInput(event: WechatMiniprogram.Input) {
      this.refreshOptions(String(event.detail.value ?? ''), true)
    },

    onToggleResults() {
      if (!this.data.hasQuery) return
      this.setData({ resultsExpanded: !this.data.resultsExpanded })
    },

    onSelect(event: WechatMiniprogram.TouchEvent) {
      const id = String(event.currentTarget.dataset.id ?? '')
      if (id) this.triggerEvent('select', { id })
    },

    onRemove(event: WechatMiniprogram.TouchEvent) {
      const id = String(event.currentTarget.dataset.id ?? '')
      if (id) this.triggerEvent('remove', { id })
    },

    onCreateCandidate() {
      const name = this.data.query.trim()
      if (name) this.triggerEvent('createcandidate', { name })
    },
  },
})
