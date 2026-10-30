import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { CanonicalMajorEventsDataset } from '../import/types'

/** 兩個可獨立部署的包共用同一 master 投影及規則來源。 */
export function writeReminderCloudData(stageRoot: string): void {
  const source = readFileSync('data/master/major-events.json')
  const dataset = JSON.parse(source.toString('utf8')) as CanonicalMajorEventsDataset
  const payload = {
    fingerprint: createHash('sha256').update(source).digest('hex'),
    reference: {
      anchorEpochSeconds: dataset.anchorEpochSeconds,
      eventTypes: dataset.eventTypes.map(({ id, name, periodHours }) => ({
        id,
        name,
        periodHours,
      })),
      zones: dataset.zones.map(({ id, name, phaseHours, delaySeconds }) => ({
        id,
        name,
        phaseHours,
        delaySeconds,
      })),
    },
  }
  for (const name of ['major-event-reminder', 'major-event-reminder-worker']) {
    const target = join(stageRoot, 'cloudfunctions', name, 'reference-data.json')
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, JSON.stringify(payload, null, 2) + '\n')
  }
  const sharedRoot = join(stageRoot, 'cloudfunctions/major-event-reminder-worker/shared')
  mkdirSync(sharedRoot, { recursive: true })
  for (const name of ['policy.js', 'config.js', 'repository.js']) {
    writeFileSync(
      join(sharedRoot, name),
      readFileSync(join('cloudfunctions/major-event-reminder', name)),
    )
  }
}
