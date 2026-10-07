import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildDeployPackages,
  validatePackageRequires,
} from '../../tools/message-board/build-deploy-packages'
describe('永久業務自包含部署包', () => {
  it('兩個包都沒有包外 require，同一來源產物雜湊相同且預設停用', () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-permanent-package-'))
    try {
      const first = buildDeployPackages({
        sourceRoot: process.cwd(),
        outputRoot: join(root, 'one'),
      })
      const second = buildDeployPackages({
        sourceRoot: process.cwd(),
        outputRoot: join(root, 'two'),
      })
      expect(first.packages.map((item) => item.sha256)).toEqual(
        second.packages.map((item) => item.sha256),
      )
      for (const item of first.packages) {
        expect(validatePackageRequires(item.path)).toEqual([])
        expect(
          JSON.parse(readFileSync(join(item.path, 'package.json'), 'utf8')).dependencies,
        ).toEqual({ 'wx-server-sdk': '4.0.2' })
      }
      expect(first.packages.map((item) => item.name)).toEqual([
        'message-board',
        'message-board-events',
      ])
      expect(first.enabledByDefault).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
