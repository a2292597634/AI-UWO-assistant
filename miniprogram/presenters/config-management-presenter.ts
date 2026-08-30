import type { FleetConfigSummary } from '../contracts/fleet-config'
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
export type ConfigStatus = 'new' | 'saved' | 'unsaved'
export type ConfigListState = 'idle' | 'loading' | 'ready' | 'empty' | 'error'
export type ConfigAuthStatus = 'guest' | 'authenticated' | 'loading'

export interface ConfigManagerViewInput {
  configName: string
  configStatus: ConfigStatus
  configList: readonly FleetConfigSummary[]
  unclassifiedConfigs: readonly FleetConfigSummary[]
  listState: ConfigListState
  listError: string | null
  expanded: boolean
  authStatus: ConfigAuthStatus
  activeConfigId: string | null
}

export interface ConfigManagerSummary {
  name: string
  status: ConfigStatus
  statusLabel: string
  configCount: number
  countLabel: string
}

export interface ConfigManagerRow extends FleetConfigSummary {
  isActive: boolean
}

export interface ConfigManagerView {
  expanded: boolean
  summary: ConfigManagerSummary
  showConfigList: boolean
  showActionRow: boolean
  configRows: readonly ConfigManagerRow[]
  unclassifiedRows: readonly ConfigManagerRow[]
  showUnclassified: boolean
  loadingState: boolean
  emptyState: boolean
  errorMessage: string | null
  listMessage: string | null
  showRetry: boolean
  showLoginAction: boolean
  showSaveAction: boolean
  saveActionLabel: string
  showSaveAsAction: boolean
  showRenameAction: boolean
  showDeleteAction: boolean
  showNewAction: boolean
  showExitAction: boolean
}

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

const CONFIG_STATUS_LABELS: Record<ConfigStatus, string> = {
  new: '未命名配置',
  saved: '已保存',
  unsaved: '尚未保存',
}

export function buildConfigManagerView(input: ConfigManagerViewInput): ConfigManagerView {
  const isExpanded = input.expanded
  const isAuthenticated = input.authStatus === 'authenticated'
  const isGuest = input.authStatus === 'guest'
  const showConfigList = isExpanded && isAuthenticated
  const showActionRow = isExpanded
  const hasActiveConfig = Boolean(input.activeConfigId)
  const errorMessage =
    showConfigList && input.listState === 'error' ? input.listError || '配置列表載入失敗' : null
  const emptyState =
    showConfigList &&
    (input.listState === 'empty' || (input.listState === 'ready' && input.configList.length === 0))
  const configRows = input.configList.map((config) => ({
    ...config,
    isActive: config.configId === input.activeConfigId,
  }))
  const unclassifiedRows = input.unclassifiedConfigs.map((config) => ({
    ...config,
    isActive: false,
  }))

  return {
    expanded: isExpanded,
    summary: {
      name: input.configName || DEFAULT_CONFIG_NAME,
      status: input.configStatus,
      statusLabel: CONFIG_STATUS_LABELS[input.configStatus],
      configCount: input.configList.length,
      countLabel: `${input.configList.length} 套`,
    },
    showConfigList,
    showActionRow,
    configRows: isExpanded ? configRows : [],
    unclassifiedRows: isExpanded ? unclassifiedRows : [],
    showUnclassified: showConfigList && unclassifiedRows.length > 0,
    loadingState: showConfigList && input.listState === 'loading',
    emptyState,
    errorMessage,
    listMessage: errorMessage
      ? null
      : showConfigList && input.listState === 'loading'
        ? '配置載入中'
        : emptyState
          ? '尚未保存配置'
          : null,
    showRetry: errorMessage !== null,
    showLoginAction: showActionRow && isGuest,
    showSaveAction:
      showActionRow && (isGuest || (isAuthenticated && input.configStatus === 'unsaved')),
    saveActionLabel: isGuest ? '登入後保存' : '保存',
    showSaveAsAction: showActionRow && isAuthenticated,
    showRenameAction: showActionRow && isAuthenticated && hasActiveConfig,
    showDeleteAction: showActionRow && isAuthenticated && hasActiveConfig,
    showNewAction: showActionRow && isAuthenticated,
    showExitAction: showActionRow && hasActiveConfig,
  }
}

export function collapseAfterSuccessfulLoad(): { expanded: false } {
  return { expanded: false }
}
