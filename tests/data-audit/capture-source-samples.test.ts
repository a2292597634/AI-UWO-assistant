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

const fixedRangeFetcher = (sources: Readonly<Record<string, string>>) =>
  vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = String(input)
    const range = String((init?.headers as Record<string, string>).Range)
    const [start, end] = range
      .replace('bytes=', '')
      .split('-')
      .map((value) => Number(value)) as [number, number]
    const sourceKind = url.includes('json_char.js') ? 'officer' : 'language'
    return rangedResponse(
      [start, end],
      sources[`${sourceKind}:${range}`] ?? '',
      sourceKind === 'officer' ? 567976 : 337759,
    )
  })

describe('captureSourceSamples', () => {
  it('uses bounded Range requests and projects only whitelisted IDs', async () => {
    const fetcher = fixedRangeFetcher({
      'officer:bytes=0-32767': 'var json_char={"chasT089":{"cht":"captured","skill":{"sk0":{}}}}',
      'officer:bytes=475136-479231': 'var skill_arr={"skill200681":{"d":null,"t":"menuskt2"}}',
      'language:bytes=47238-88188':
        'lang_js[1]={"skill200681":"name","skill200681des":"description","menuskt2":"Production purchase"}',
    })

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

  it('requests only the exact successful metadata ranges for the fixed skills', async () => {
    const fetcher = fixedRangeFetcher({
      'officer:bytes=0-32767': 'var json_char={"chasT089":{"cht":"captured"}}',
      'officer:bytes=475136-479231': 'var skill_arr={"skill200681":{"d":null,"t":"menuskt2"}}',
      'language:bytes=47238-88188':
        'lang_js[1]={"skill200681":"name","skill200681des":"description","menuskt2":"Production purchase"}',
    })

    await captureSourceSamples(fetcher, {
      officerIds: ['chasT089'],
      skillIds: ['skill200681'],
    })

    expect(
      fetcher.mock.calls
        .filter(([input]) => String(input).includes('json_char.js'))
        .map(([, init]) => String((init?.headers as Record<string, string>).Range)),
    ).toEqual([
      'bytes=0-32767',
      'bytes=446464-450559',
      'bytes=450560-454655',
      'bytes=454656-458751',
      'bytes=466944-471039',
      'bytes=471040-475135',
      'bytes=475136-479231',
      'bytes=479232-483327',
      'bytes=507904-511999',
      'bytes=512000-516095',
      'bytes=516096-520191',
      'bytes=520192-524287',
      'bytes=532480-536575',
      'bytes=536576-540671',
    ])
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
    const fetcher = fixedRangeFetcher({
      'officer:bytes=0-32767': 'var json_char={"chasT089":{"cht":"captured"}}',
      'officer:bytes=475136-479231': 'var skill_arr={"skill200681":{"d":null,"t":"menuskt2"}}',
      'language:bytes=47238-88188': 'lang_js[1]={"skill200681":"多字节名称"}',
      'language:bytes=92126-178363':
        ',"skill200681des":"later description","menuskt2":"Production purchase"}',
    })

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

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('lang_1.js'),
      expect.objectContaining({ headers: { Range: 'bytes=47238-88188' } }),
    )
    expect(fetcher).toHaveBeenCalledWith(
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
  it('captures category, image override, and exact fixed metadata range for a selected skill', async () => {
    const fetcher = fixedRangeFetcher({
      'officer:bytes=0-32767':
        'var json_char={"chasT089":{"cht":"captured","skill":{"sk0":{"skill200681":"10"}}}}',
      'officer:bytes=475136-479231':
        'var skill_arr={"skill200681":{"d":null,"t":"menuskt2","i":"skill200001"}}',
      'language:bytes=47238-88188':
        'lang_js[1]={"skill200681":"name","skill200681des":"description","menuskt2":"Production purchase"}',
    })

    await expect(
      captureSourceSamples(fetcher, {
        officerIds: ['chasT089'],
        skillIds: ['skill200681'],
      }),
    ).resolves.toMatchObject({
      skills: {
        skill200681: {
          sourceCategoryId: 'menuskt2',
          sourceCategoryName: 'Production purchase',
          imageOverrideId: 'skill200001',
          metadataSourceRange: 'bytes=475136-479231',
        },
      },
    })
  })
})
