import type { FleetCalculationView } from '../../runtime/fleet-calculation'

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    calculation: { type: Object, value: null as FleetCalculationView | null },
  },
  data: {
    busy: false,
    hasProgress: false,
    progressValue: 0,
    percentageLabel: '',
  },
  observers: {
    calculation(calculation: FleetCalculationView | null) {
      const busy = calculation !== null && !['cancelled', 'error'].includes(calculation.status)
      const hasProgress =
        typeof calculation?.progress === 'number' && Number.isFinite(calculation.progress)
      const progressValue = hasProgress ? Math.min(100, Math.max(0, calculation!.progress!)) : 0
      this.setData({
        busy,
        hasProgress,
        progressValue,
        percentageLabel: `${Math.floor(progressValue)}%`,
      })
    },
  },
  methods: {
    onCancel() {
      if (this.data.busy) this.triggerEvent('cancel')
    },
    onRetry() {
      if (!this.data.busy) this.triggerEvent('retry')
    },
  },
})
