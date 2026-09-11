import type { RuntimeFleetOfficer } from '../../contracts/runtime-data'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const _fleetOfficers = require('../generated/fleet-officers') as RuntimeFleetOfficer[]

export function getFleetOfficers(): readonly RuntimeFleetOfficer[] {
  return _fleetOfficers
}
