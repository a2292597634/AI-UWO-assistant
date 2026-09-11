import { describe, expect, it } from 'vitest'
import {
  analyzeMiniProgramPackage,
  readMiniProgramConfig,
} from '../../tools/quality/check-miniprogram-package-size'

const PROJECT_ROOT = process.cwd()

describe('Mini Program package boundaries', () => {
  it('keeps the fleet officer index out of the main package', () => {
    const config = readMiniProgramConfig(PROJECT_ROOT)
    const report = analyzeMiniProgramPackage({
      projectRoot: PROJECT_ROOT,
      miniprogramRoot: config.miniprogramRoot,
      subpackageRoots: config.subpackageRoots,
    })

    expect(config.subpackageRoots).toContain('subpkg-fleet')
    expect(report.largestFiles.some((file) => file.path === 'generated/fleet-officers.js')).toBe(
      false,
    )
  })
})
