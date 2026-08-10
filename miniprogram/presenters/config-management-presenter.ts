import { MAX_CONFIG_NAME_LENGTH, normalizeConfigName } from '../contracts/fleet-config'

export const DEFAULT_CONFIG_NAME = '未命名配置'

export const CONFIG_MANAGEMENT_ACTIONS = [
  'load',
  'new',
  'save',
  'saveAs',
  'rename',
  'delete',
  'exit',
  'conflict',
] as const

export type ConfigManagementAction = (typeof CONFIG_MANAGEMENT_ACTIONS)[number]
export type ConfigModalAction = 'save' | 'saveAs' | 'rename' | 'none'

export interface PendingConfigAction {
  type: Exclude<ConfigManagementAction, 'save' | 'conflict'>
  targetConfigId?: string
  targetName?: string
}

export interface ConfigNameValidation {
  ok: boolean
  name?: string
  message?: string
}

export interface ConfigModalData {
  showNameModal: boolean
  modalAction: ConfigModalAction
  modalInputValue: string
  modalTitle: string
}

export interface ConfigActionDecision {
  pendingAction: PendingConfigAction
  showUnsavedGuard: boolean
}

export function deriveConfigStatus(
  isDirty: boolean,
  activeConfigId: string,
): 'new' | 'saved' | 'unsaved' {
  if (isDirty) {
    return 'unsaved'
  }
  return activeConfigId ? 'saved' : 'new'
}

export function buildConfigModalData(
  action: Exclude<ConfigModalAction, 'none'>,
  currentName: string,
): ConfigModalData {
  const titles: Record<Exclude<ConfigModalAction, 'none'>, string> = {
    save: '保存配置',
    saveAs: '另存為配置',
    rename: '重新命名配置',
  }

  return {
    showNameModal: true,
    modalAction: action,
    modalInputValue: currentName,
    modalTitle: titles[action],
  }
}

export function validateConfigName(value: string): ConfigNameValidation {
  const name = normalizeConfigName(value)
  if (!name) {
    return { ok: false, message: '請輸入配置名稱' }
  }
  if (name.length > MAX_CONFIG_NAME_LENGTH) {
    return { ok: false, message: `配置名稱不可超過 ${MAX_CONFIG_NAME_LENGTH} 個字元` }
  }
  return { ok: true, name }
}

export function resolveConfigAction(
  action: PendingConfigAction,
  isDirty: boolean,
): ConfigActionDecision {
  return {
    pendingAction: action,
    showUnsavedGuard: isDirty,
  }
}
