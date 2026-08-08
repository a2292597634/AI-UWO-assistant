import { describe, expect, it, vi } from 'vitest'
import {
  downloadFullFile,
  downloadWithRanges,
  rangeHeader,
} from '../../tools/import/download-source'
import { sourceConfig } from '../../tools/data-audit/source-config'

describe('rangeHeader', () => {
  it('formats a byte range for an HTTP header', () => {
    expect(rangeHeader(0, 47237)).toBe('bytes=0-47237')
  })
})

describe('downloadFullFile', () => {
  it('fetches a complete file and computes its SHA-256', async () => {
    const body = 'var json_char={}'
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: {
          'content-type': 'application/javascript; charset=utf-8',
          'content-length': String(body.length),
          'last-modified': 'Wed, 29 Jul 2026 12:00:00 GMT',
        },
      }),
    )

    const result = await downloadFullFile(
      'https://voyage.tw/js/json_char.js?v=2026052501',
      '/tmp/test-out.js',
      fetcher,
    )

    expect(result.byteCount).toBe(body.length)
    expect(result.sha256).toHaveLength(64)
    expect(result.lastModified).toBe('Wed, 29 Jul 2026 12:00:00 GMT')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith(
      'https://voyage.tw/js/json_char.js?v=2026052501',
      expect.objectContaining({ headers: {} }),
    )
  })

  it('rejects non-200 responses', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }))
    await expect(
      downloadFullFile('https://voyage.tw/js/json_char.js', '/tmp/out', fetcher),
    ).rejects.toThrow('IMPORT_DOWNLOAD_STATUS')
  })
})

describe('downloadWithRanges', () => {
  it('sends Range requests for each range and saves individual files', async () => {
    const rangeParts = ['part-0', 'part-1', 'part-2', 'part-3']
    const ranges = [[0, 5] as const, [6, 11] as const, [12, 17] as const, [18, 23] as const]

    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(rangeParts[0], {
          status: 206,
          headers: {
            'content-type': 'application/javascript',
            'content-range': 'bytes 0-5/337759',
            'content-length': String(rangeParts[0].length),
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(rangeParts[1], {
          status: 206,
          headers: {
            'content-type': 'application/javascript',
            'content-range': 'bytes 6-11/337759',
            'content-length': String(rangeParts[1].length),
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(rangeParts[2], {
          status: 206,
          headers: {
            'content-type': 'application/javascript',
            'content-range': 'bytes 12-17/337759',
            'content-length': String(rangeParts[2].length),
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(rangeParts[3], {
          status: 206,
          headers: {
            'content-type': 'application/javascript',
            'content-range': 'bytes 18-23/337759',
            'content-length': String(rangeParts[3].length),
          },
        }),
      )
    const result = await downloadWithRanges(
      'https://voyage.tw/js/lang_1.js?v=1779690379',
      ranges,
      '/tmp/lang-out',
      fetcher,
    )

    expect(fetcher).toHaveBeenCalledTimes(4)
    // Verify each call had a Range header
    for (let i = 0; i < 4; i++) {
      const callArgs = (fetcher as ReturnType<typeof vi.fn>).mock.calls[i]!
      const headers = (callArgs[1] as RequestInit).headers as Record<string, string>
      expect(headers.Range).toBe(`bytes=${ranges[i]![0]}-${ranges[i]![1]}`)
    }

    // Combined byte count equals sum of individual parts (as UTF-8 bytes)
    const expectedBytes = rangeParts
      .map((p) => Buffer.byteLength(p, 'utf8'))
      .reduce((a, b) => a + b, 0)
    expect(result.combinedByteCount).toBe(expectedBytes)
    expect(result.results).toHaveLength(4)
    expect(result.results[0]!.contentRange).toBe('bytes 0-5/337759')
  })

  it('rejects non-206 responses for Range requests', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }))
    await expect(
      downloadWithRanges('https://voyage.tw/js/lang_1.js', [[0, 100]], '/tmp/lang-out', fetcher),
    ).rejects.toThrow('IMPORT_RANGE_REQUIRED')
  })

  it('rejects a 206 response without Content-Range', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('abc', { status: 206 }))

    await expect(
      downloadWithRanges('https://voyage.tw/js/lang_1.js', [[0, 2]], '/tmp/lang-out', fetcher),
    ).rejects.toThrow('IMPORT_RANGE_CONTENT_RANGE_MISSING')
  })

  it('rejects a Content-Range that differs from the requested range', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('abcd', {
        status: 206,
        headers: { 'content-range': 'bytes 0-3/20' },
      }),
    )

    await expect(
      downloadWithRanges('https://voyage.tw/js/lang_1.js', [[10, 13]], '/tmp/lang-out', fetcher),
    ).rejects.toThrow('IMPORT_RANGE_CONTENT_RANGE_MISMATCH')
  })

  it('rejects a body whose length differs from the advertised range', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('abc', {
        status: 206,
        headers: { 'content-range': 'bytes 0-3/20' },
      }),
    )

    await expect(
      downloadWithRanges('https://voyage.tw/js/lang_1.js', [[0, 3]], '/tmp/lang-out', fetcher),
    ).rejects.toThrow('IMPORT_RANGE_LENGTH_MISMATCH')
  })
})

describe('sourceConfig language ranges', () => {
  it('has exactly 4 authorized language ranges', () => {
    expect(sourceConfig.languageRanges).toHaveLength(4)
  })

  it('has all ranges within the authorized file size', () => {
    for (const [start, end] of sourceConfig.languageRanges) {
      expect(start).toBeGreaterThanOrEqual(0)
      expect(end).toBeLessThanOrEqual(262143)
      expect(start).toBeLessThan(end)
    }
  })
})
