import { describe, expect, it } from 'vitest'
import { createEmptyFormState } from '../../miniprogram/domain/officer-editor'
import { buildOfficerEditorPageData } from '../../miniprogram/presenters/officer-editor-presenter'

const options = {
  rarityOptions: [],
  typeOptions: [],
  genderOptions: [],
  jobOptions: [
    { id: 'job-merchant', name: '商人' },
    { id: 'job-explorer', name: '探險家' },
  ],
  nationalityOptions: [
    { id: 'nation-portugal', name: '葡萄牙' },
    { id: 'nation-sweden', name: '瑞典' },
  ],
  languageOptions: [],
  cityOptions: [],
  requirementOptions: [],
  skillOptions: [],
}

describe('OfficerEditor presenter searchable picker indexes', () => {
  it('indexes job and nationality selections against their filtered picker ranges', () => {
    const form = createEmptyFormState()
    form.jobId = 'job-explorer'
    form.nationalityId = 'nation-sweden'

    const view = buildOfficerEditorPageData(form, options, '', '探險', '瑞典')

    expect(view.filteredJobOptions[view.jobIndex]?.id).toBe('job-explorer')
    expect(view.filteredNationalityOptions[view.nationalityIndex]?.id).toBe('nation-sweden')
  })
})
