import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'

import {
  buildCustomOfficerMaster,
  downloadApprovedPortrait,
  fetchApprovedSubmissions,
  runSync,
  type SyncSubmissionRecord,
} from '../../tools/sync-custom-officers'

const temporaryDirectories: string[] = []

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

const approvedRecord = (
  submissionId: string,
  revision = 1,
  status: string = 'approved',
): SyncSubmissionRecord => ({
  submissionId,
  revision,
  status,
  canonicalData: {
    id: `officer_custom_${submissionId}`,
    name: `投稿${submissionId}`,
    sourceRefs: { submissionId },
  },
})

describe('custom officer sync', () => {
  it('同步只輸出 approved，pending/rejected 不進入 custom master', () => {
    const output = buildCustomOfficerMaster([
      approvedRecord('sub_a'),
      approvedRecord('sub_b', 1, 'pending'),
      approvedRecord('sub_c', 1, 'rejected'),
    ])

    expect(output.map((item) => item.sourceRefs)).toEqual([{ submissionId: 'sub_a' }])
  })

  it('同一投稿按 submissionId 與 revision 確定性輸出，重複執行結果相同', () => {
    const subARevision2 = approvedRecord('sub_a', 2)
    const first = buildCustomOfficerMaster([approvedRecord('sub_b'), subARevision2], [])
    const second = buildCustomOfficerMaster([subARevision2, approvedRecord('sub_b')], [])

    expect(second).toEqual(first)
    expect(first.map((item) => item.sourceRefs)).toEqual([
      { submissionId: 'sub_a' },
      { submissionId: 'sub_b' },
    ])
  })

  it('預設同步不標記 published，明確 datasetVersion 才呼叫標記 action', async () => {
    const markPublished = vi.fn()
    await runSync({ approved: [approvedRecord('sub_a')], markPublishedAction: markPublished })
    expect(markPublished).not.toHaveBeenCalled()

    await runSync({
      approved: [approvedRecord('sub_a')],
      markPublished: '1.0.1',
      markPublishedAction: markPublished,
    })
    expect(markPublished).toHaveBeenCalledWith('sub_a', 1, '1.0.1')
  })

  it('只用服務端回傳的 approved action 取得投稿', async () => {
    const invoke = vi.fn().mockResolvedValue({
      ok: true,
      data: [approvedRecord('sub_a')],
    })

    await expect(fetchApprovedSubmissions('sync-secret', invoke)).resolves.toHaveLength(1)
    expect(invoke).toHaveBeenCalledWith({
      action: 'listApprovedForSync',
      syncToken: 'sync-secret',
    })
  })

  it('下載頭像後轉為 PNG 並保留比例與尺寸限制', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'uwo-sync-portrait-'))
    temporaryDirectories.push(directory)
    const source = await sharp({
      create: {
        width: 2,
        height: 1,
        channels: 4,
        background: { r: 32, g: 64, b: 96, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer()
    const invoke = vi.fn().mockResolvedValue({
      ok: true,
      data: { tempFileURL: 'https://temporary.example/portrait.jpg' },
    })

    const result = await downloadApprovedPortrait(approvedRecord('sub_a'), 'sync-secret', {
      invoke,
      outputDir: directory,
      fetcher: async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () =>
          source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
      }),
    })

    expect(result.path).toBe(join(directory, 'officer_custom_sub_a.png'))
    expect(readFileSync(result.path).subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )
    expect(result.width).toBe(2)
    expect(result.height).toBe(1)
  })

  it('拒絕沒有透明背景的投稿頭像', async () => {
    const source = await sharp({
      create: { width: 2, height: 1, channels: 3, background: '#204060' },
    })
      .png()
      .toBuffer()
    const invoke = vi.fn().mockResolvedValue({
      ok: true,
      data: { tempFileURL: 'https://temporary.example/opaque.png' },
    })

    await expect(
      downloadApprovedPortrait(approvedRecord('sub_opaque'), 'sync-secret', {
        invoke,
        fetcher: async () => ({
          ok: true,
          status: 200,
          arrayBuffer: async () =>
            source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
        }),
      }),
    ).rejects.toThrow('投稿 sub_opaque 頭像必須保留透明背景')
  })
})
