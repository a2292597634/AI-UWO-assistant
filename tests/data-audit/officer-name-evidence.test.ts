import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { captureOfficerNameEvidence } from '../../tools/data-audit/capture-source-samples'
import { sourceConfig } from '../../tools/data-audit/source-config'

const pinnedUrl = 'https://voyage.tw/js/lang_1.js?v=1779690379'

describe('officer name evidence', () => {
  it('extracts an exact officer name from a pinned bounded language range', async () => {
    const payload = Buffer.alloc(47238, 0x20)
    Buffer.from('lang_js[1]={"chasab001":"字典名字"}', 'utf8').copy(payload)
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(payload, {
        status: 206,
        headers: {
          'content-range': 'bytes 0-47237/337759',
          'last-modified': 'Mon, 25 May 2026 06:35:21 GMT',
        },
      }),
    )

    await expect(captureOfficerNameEvidence('chasab001', fetcher)).resolves.toEqual({
      ownerSourceId: 'chasab001',
      name: '字典名字',
      sourceUrl: pinnedUrl,
      metadataSourceRange: 'bytes=0-47237',
      contentRange: 'bytes 0-47237/337759',
      lastModified: 'Mon, 25 May 2026 06:35:21 GMT',
      sha256: createHash('sha256').update(payload).digest('hex'),
      rule: 'Use the exact lang_js[1][officerId] value from the first approved bounded range containing the key.',
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith(pinnedUrl, {
      headers: { Range: 'bytes=0-47237' },
    })
  })

  it('rejects an over-budget configured range set before fetching', async () => {
    const ranges = sourceConfig.languageRanges as unknown as Array<[number, number]>
    ranges.push([262144, 266081])
    const fetcher = vi.fn<typeof fetch>()

    try {
      await expect(captureOfficerNameEvidence('chasab001', fetcher)).rejects.toThrow(
        'AUDIT_SOURCE_LIMIT_EXCEEDED:languageBytes',
      )
      expect(fetcher).not.toHaveBeenCalled()
    } finally {
      ranges.pop()
    }
  })

  it('blocks rather than expanding beyond the approved language ranges', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      const range = String((init?.headers as Record<string, string>).Range)
      const [start, end] = range.replace('bytes=', '').split('-').map(Number) as [number, number]
      return new Response(Buffer.alloc(end - start + 1, 0x20), {
        status: 206,
        headers: { 'content-range': `bytes ${start}-${end}/337759` },
      })
    })

    await expect(captureOfficerNameEvidence('chasab001', fetcher)).rejects.toThrow(
      'AUDIT_SOURCE_KEY_MISSING:chasab001',
    )
    expect(
      fetcher.mock.calls.map(([, init]) => String((init?.headers as Record<string, string>).Range)),
    ).toEqual(['bytes=0-47237', 'bytes=47238-88188', 'bytes=92126-178363', 'bytes=178364-262143'])
  })
})
