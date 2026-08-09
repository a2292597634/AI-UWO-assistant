Component({
  options: {
    styleIsolation: 'apply-shared',
  },

  properties: {
    status: {
      type: String,
      value: 'review',
    },
    label: {
      type: String,
      value: '',
    },
    description: {
      type: String,
      value: '',
    },
  },
})
