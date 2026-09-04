import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadTradeSnapshot } from '../../tools/import/download-source'

const tempDirs: string[] = []

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  for (const directory of tempDirs.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('downloadTradeSnapshot', () => {
  it('downloads the three complete trade source files and writes a manifest', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'uwo-trade-download-'))
    tempDirs.push(outputDir)

    const bodies = {
      'https://voyage.tw/js/json.js?v=2026052501': 'var trades={};',
      'https://voyage.tw/js/lang_1.js?v=1779690379': 'var lang_js=[];',
      'https://voyage.tw/js/map.js?v=2026052501': 'var map={};',
    }
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input)
      const body = bodies[url as keyof typeof bodies]
      if (!body) return new Response(null, { status: 404 })
      return new Response(body, {
        status: 200,
        headers: {
          'last-modified': 'Wed, 29 Jul 2026 12:00:00 GMT',
        },
      })
    })

    const manifest = await downloadTradeSnapshot(outputDir, fetcher)

    expect(manifest.files.map((file) => file.path)).toEqual(['json.js', 'lang_1.js', 'map.js'])
    expect(manifest.files.every((file) => file.sha256.length === 64)).toBe(true)
    expect(manifest.files.every((file) => file.byteSize > 0)).toBe(true)
    expect(await readFile(join(outputDir, 'json.js'), 'utf8')).toBe('var trades={};')
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual(Object.keys(bodies))
  })

  it('rejects a non-200 response without writing a partial manifest', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'uwo-trade-download-'))
    tempDirs.push(outputDir)
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }))

    await expect(downloadTradeSnapshot(outputDir, fetcher)).rejects.toThrow(
      'IMPORT_DOWNLOAD_STATUS',
    )
  })
})
