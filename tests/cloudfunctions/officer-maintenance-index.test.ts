import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

describe('航海士維護雲函數入口身份邊界', () => {
  it('只採信 CloudBase OpenID，忽略 event 的偽造身份與管理員宣告', async () => {
    const filename = resolve('cloudfunctions/officer-maintenance/index.js')
    const localRequire = createRequire(filename)
    const exports: { main?: (event: unknown, context: unknown) => Promise<unknown> } = {}
    const cloud = {
      DYNAMIC_CURRENT_ENV: 'dynamic',
      init: () => undefined,
      getWXContext: () => ({ OPENID: 'ordinary-user' }),
      database: () => ({ collection: () => ({}) }),
    }
    runInNewContext(
      readFileSync(filename, 'utf8'),
      {
        exports,
        require: (request: string) => (request === 'wx-server-sdk' ? cloud : localRequire(request)),
        process: { env: { OFFICER_MAINTENANCE_ADMIN_OPENIDS: ' admin-user ' } },
        console: { log: () => undefined, error: () => undefined },
      },
      { filename },
    )
    await expect(
      exports.main!(
        {
          action: 'approve',
          OPENID: 'admin-user',
          openid: 'admin-user',
          ownerUid: 'admin-user',
          isAdmin: true,
        },
        {},
      ),
    ).resolves.toMatchObject({ ok: false, code: 'forbidden' })
    cloud.getWXContext = () => ({ OPENID: '' })
    await expect(
      exports.main!({ action: 'listMine', openid: 'owner-user' }, {}),
    ).resolves.toMatchObject({ ok: false, code: 'unauthenticated' })
  })

  it('錯誤回報 action 也只採信 CloudBase OpenID', async () => {
    const filename = resolve('cloudfunctions/officer-maintenance/index.js')
    const localRequire = createRequire(filename)
    const exports: { main?: (event: unknown, context: unknown) => Promise<unknown> } = {}
    const cloud = {
      DYNAMIC_CURRENT_ENV: 'dynamic',
      init: () => undefined,
      getWXContext: () => ({ OPENID: 'ordinary-user' }),
      database: () => ({ collection: () => ({}) }),
    }
    runInNewContext(
      readFileSync(filename, 'utf8'),
      {
        exports,
        require: (request: string) => (request === 'wx-server-sdk' ? cloud : localRequire(request)),
        process: { env: { OFFICER_MAINTENANCE_ADMIN_OPENIDS: 'admin-user' } },
        console: { log: () => undefined, error: () => undefined },
      },
      { filename },
    )

    await expect(
      exports.main!({ action: 'listReportsForAdmin', OPENID: 'admin-user', isAdmin: true }, {}),
    ).resolves.toMatchObject({ ok: false, code: 'forbidden' })
    cloud.getWXContext = () => ({ OPENID: '' })
    await expect(exports.main!({ action: 'createReport' }, {})).resolves.toMatchObject({
      ok: false,
      code: 'unauthenticated',
    })
  })
})
