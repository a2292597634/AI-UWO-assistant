import { describe, expect, it, vi } from 'vitest'
import { captureSourceSamples } from '../../tools/data-audit/capture-source-samples'

const rangedResponse = (
  range: readonly [number, number],
  source: string,
  total = 337759,
): Response => {
  const length = range[1] - range[0] + 1
  const payload = Buffer.alloc(length, 0x20)
  const sourceBytes = Buffer.from(source, 'utf8')
  if (sourceBytes.length > payload.length) throw new Error('test source exceeds range')
  sourceBytes.copy(payload)
  return new Response(payload, {
    status: 206,
    headers: { 'content-range': `bytes ${range[0]}-${range[1]}/${total}` },
  })
}

describe('captureSourceSamples', () => {
  it('uses bounded Range requests and projects only whitelisted IDs', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        rangedResponse(
          [0, 32767],
          'var json_char={"chasT089":{"cht":"captured","skill":{"sk0":{}}}}',
          567976,
        ),
      )
      .mockResolvedValue(
        rangedResponse(
          [47238, 88188],
          'lang_js[1]={"skill200681":"name","skill200681des":"description"}',
        ),
      )

    await expect(
      captureSourceSamples(fetcher, {
        officerIds: ['chasT089'],
        skillIds: ['skill200681'],
      }),
    ).resolves.toMatchObject({
      officers: { chasT089: { cht: 'captured' } },
      skills: { skill200681: { name: 'name', description: 'description' } },
    })

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('json_char.js'),
      expect.objectContaining({ headers: { Range: expect.stringMatching(/^bytes=/) } }),
    )
  })

  it('rejects full responses and sample counts above the phase limits', async () => {
    const fullResponse = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{}', { status: 200 }))
    await expect(captureSourceSamples(fullResponse)).rejects.toThrow('AUDIT_RANGE_REQUIRED')

    await expect(
      captureSourceSamples(fullResponse, {
        officerIds: Array.from({ length: 13 }, () => 'chasT089'),
        skillIds: [],
      }),
    ).rejects.toThrow('AUDIT_SOURCE_LIMIT_EXCEEDED')
  })

  it('captures a UTF-8 name from the former range gap before its later description', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        rangedResponse([0, 32767], 'var json_char={"chasT089":{"cht":"captured"}}', 567976),
      )
      .mockResolvedValueOnce(
        rangedResponse([47238, 88188], 'lang_js[1]={"skill200681":"多字节名称"}'),
      )
      .mockResolvedValueOnce(
        rangedResponse([92126, 178363], ',"skill200681des":"later description"}'),
      )

    await expect(
      captureSourceSamples(fetcher, {
        officerIds: ['chasT089'],
        skillIds: ['skill200681'],
      }),
    ).resolves.toMatchObject({
      skills: {
        skill200681: {
          name: '多字节名称',
          description: 'later description',
        },
      },
    })

    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('lang_1.js'),
      expect.objectContaining({ headers: { Range: 'bytes=47238-88188' } }),
    )
    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('lang_1.js'),
      expect.objectContaining({ headers: { Range: 'bytes=92126-178363' } }),
    )
  })

  it('rejects custom IDs outside the approved source selection before fetching', async () => {
    const fetcher = vi.fn<typeof fetch>()

    await expect(
      captureSourceSamples(fetcher, { officerIds: ['unapproved-officer'], skillIds: [] }),
    ).rejects.toThrow('AUDIT_SOURCE_ID_NOT_APPROVED:officer:unapproved-officer')
    await expect(
      captureSourceSamples(fetcher, { officerIds: [], skillIds: ['unapproved-skill'] }),
    ).rejects.toThrow('AUDIT_SOURCE_ID_NOT_APPROVED:skill:unapproved-skill')

    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects a truncated 206 payload despite a matching Content-Range', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(Buffer.from('var json_char={}', 'utf8'), {
        status: 206,
        headers: { 'content-range': 'bytes 0-32767/567976' },
      }),
    )

    await expect(
      captureSourceSamples(fetcher, { officerIds: ['chasT089'], skillIds: [] }),
    ).rejects.toThrow('AUDIT_RANGE_LENGTH_MISMATCH:bytes=0-32767')

    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
