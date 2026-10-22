import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import {
  downloadFullFile,
  downloadTradeSnapshot,
  downloadWithRanges,
} from '../../tools/import/download-source'

const roots: string[] = []
const root = () => {
  const p = mkdtempSync(join(tmpdir(), 'uwo-download-protection-'))
  roots.push(p)
  return p
}
afterEach(() => {
  for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true })
})
it('既有快照完整保留且發出請求前拒絕', async () => {
  const p = join(root(), 'json.js')
  writeFileSync(p, 'original')
  const fetcher = vi.fn<typeof fetch>(async () => new Response('replace'))
  await expect(downloadFullFile('https://fixture.invalid', p, fetcher)).rejects.toThrow(
    'IMPORT_DESTINATION_EXISTS',
  )
  expect(readFileSync(p, 'utf8')).toBe('original')
  expect(fetcher).not.toHaveBeenCalled()
})
it('整批下載後續失敗不留下部分檔案', async () => {
  const p = root()
  let n = 0
  await expect(
    downloadTradeSnapshot(p, async () => new Response('x', { status: ++n === 2 ? 503 : 200 })),
  ).rejects.toThrow('IMPORT_DOWNLOAD_STATUS')
  expect(readdirSync(p)).toEqual([])
})
it('非空目錄拒絕 range 與整批快照下載', async () => {
  const p = root()
  writeFileSync(join(p, 'keep'), 'x')
  const fetcher = vi.fn<typeof fetch>(async () => new Response('x'))
  await expect(downloadTradeSnapshot(p, fetcher)).rejects.toThrow('IMPORT_DESTINATION_EXISTS')
  await expect(downloadWithRanges('https://fixture.invalid', [[0, 0]], p, fetcher)).rejects.toThrow(
    'IMPORT_DESTINATION_EXISTS',
  )
  expect(fetcher).not.toHaveBeenCalled()
  expect(readdirSync(p)).toEqual(['keep'])
})
