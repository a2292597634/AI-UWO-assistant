export type FleetConflictAction = 'update' | 'classify' | 'rename' | 'delete'

export interface FleetConfigConflict {
  action: FleetConflictAction
  configId: string
  configName: string
  expectedVersion: number
  fleetSnapshot: string
}

export function canForceOverwrite(
  conflict: FleetConfigConflict,
  current: { configId: string | null; fleetSnapshot: string },
): boolean {
  return (
    conflict.action === 'update' &&
    conflict.configId === current.configId &&
    conflict.fleetSnapshot === current.fleetSnapshot
  )
}
