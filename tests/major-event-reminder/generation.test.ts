import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { DATA_GENERATION_OUTPUT_PATHS } from '../../tools/data-pipeline/generated-output-paths'

describe('雲端部署包的同源生成', () => {
  it('參照與資料指紋從 master 產生，兩個包可獨立使用且位元組確定', async () => {
    const path = 'tools/data-pipeline/build-major-event-reminder-cloud-data.ts'
    expect(existsSync(path)).toBe(true)
    const { writeReminderCloudData } =
      await import('../../tools/data-pipeline/build-major-event-reminder-cloud-data')
    const root = mkdtempSync(join(tmpdir(), 'uwo-reminder-generation-'))
    try {
      writeReminderCloudData(root)
      const file = join(root, 'cloudfunctions/major-event-reminder/reference-data.json')
      const first = readFileSync(file)
      const generated = JSON.parse(first.toString())
      expect(generated.fingerprint).toBe(
        createHash('sha256').update(readFileSync('data/master/major-events.json')).digest('hex'),
      )
      expect(generated.reference.anchorEpochSeconds).toBe(1670889600)
      expect(generated.reference.eventTypes[0]).toEqual({
        id: 'pop1',
        name: '奢侈',
        periodHours: 379,
      })
      expect(first).toEqual(
        readFileSync(join(root, 'cloudfunctions/major-event-reminder-worker/reference-data.json')),
      )
      expect(
        readFileSync(join(root, 'cloudfunctions/major-event-reminder-worker/shared/policy.js')),
      ).toEqual(readFileSync('cloudfunctions/major-event-reminder/policy.js'))
      const sharedConfig = readFileSync(
        join(root, 'cloudfunctions/major-event-reminder-worker/shared/config.js'),
      )
      expect(sharedConfig).toEqual(readFileSync('cloudfunctions/major-event-reminder/config.js'))
      writeReminderCloudData(root)
      expect(
        readFileSync(join(root, 'cloudfunctions/major-event-reminder-worker/shared/config.js')),
      ).toEqual(sharedConfig)
      expect(readFileSync(file)).toEqual(first)
      expect(DATA_GENERATION_OUTPUT_PATHS).toEqual(
        expect.arrayContaining([
          'cloudfunctions/major-event-reminder/reference-data.json',
          'cloudfunctions/major-event-reminder-worker/reference-data.json',
          'cloudfunctions/major-event-reminder-worker/shared',
        ]),
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
