import { describe, expect, it } from 'vitest'
import { summarizeFleetConfigPreflight } from '../../tools/cloudbase/fleet-config-preflight'

describe('fleet-config CloudBase preflight summary', () => {
  it('reports only deployment metadata and invalid document counts', () => {
    expect(
      summarizeFleetConfigPreflight({
        collectionNames: ['fleet_configs'],
        fleetConfigIndexes: ['_id_'],
        fleetConfigAcl: 'PRIVATE',
        fleetConfigDocuments: [
          { _id: 'redacted-1' },
          {
            ownerUid: 'owner',
            configId: 'cfg-1',
            name: '有效',
            normalizedName: '有效',
            fleetState: {},
          },
        ],
        deployedFunctions: [
          { name: 'fleet-config', runtime: 'Nodejs16.13', modifyTime: '2026-08-11 21:11:03' },
        ],
      }),
    ).toEqual({
      fleetConfigCollectionExists: true,
      ownerLocksCollectionExists: false,
      fleetConfigIndexes: ['_id_'],
      fleetConfigAcl: 'PRIVATE',
      invalidDocumentCount: 1,
      deployedFunctions: [
        { name: 'fleet-config', runtime: 'Nodejs16.13', modifyTime: '2026-08-11 21:11:03' },
      ],
    })
  })
})
