import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeAssetSamples } from '../../tools/data-audit/collect-asset-metadata'

const temporaryDirectories: string[] = []
const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex')

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('writeAssetSamples', () => {
  it('serializes stable observations and writes bodies only for successful responses', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'uwo-asset-writer-'))
    temporaryDirectories.push(outputRoot)
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) =>
        String(input).endsWith('/ok.png')
          ? new Response(png, { status: 200, headers: { 'content-type': 'image/png' } })
          : new Response(null, { status: 404 }),
      )

    const observations = await writeAssetSamples(
      [
        {
          ownerType: 'skill',
          ownerSourceId: 'skill404',
          url: 'https://voyage.tw/img/skill/uwo_skill404.png',
        },
        {
          ownerType: 'officer',
          ownerSourceId: 'chasOk',
          url: 'https://voyage.tw/ok.png',
        },
      ],
      outputRoot,
      fetcher,
    )

    expect(observations.map(({ ownerSourceId, status }) => [ownerSourceId, status])).toEqual([
      ['chasOk', 200],
      ['skill404', 404],
    ])
    const serialized = await readFile(
      join(outputRoot, 'tests/fixtures/source-audit/asset-observations.json'),
      'utf8',
    )
    expect(serialized).toBe(`${JSON.stringify(observations, null, 2)}\n`)
    expect(await readdir(join(outputRoot, 'tests/fixtures/source-audit/assets'))).toEqual([
      'chasOk.png',
    ])
    await expect(
      access(join(outputRoot, 'tests/fixtures/source-audit/assets/skill404.png')),
    ).rejects.toThrow()
  })
})
