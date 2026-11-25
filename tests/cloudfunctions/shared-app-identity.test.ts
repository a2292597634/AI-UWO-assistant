import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const packages = [
  'fleet-config',
  'officer-custom',
  'officer-maintenance',
  'coupon-redemption',
  'major-event-reminder',
  'message-board/core',
]
const shared = {
  SOURCE: 'wx_devtools',
  APPID: 'wx8f961bcd8b26996a',
  ENV: 'cloud1-d7gxfuxfe813b4eaa',
  FROM_APPID: 'wxd0bc7afdc9cd334a',
  FROM_OPENID: 'new-user',
  OPENID: 'resource-user',
}
const native = {
  SOURCE: 'wx_client',
  APPID: 'wxd0bc7afdc9cd334a',
  ENV: 'uwo-staging-d4guwh8hyd3932655',
  OPENID: 'new-user',
}
describe.each(packages)('%s 的獨立新帳號身份', (name) => {
  const read = (context: object) =>
    require(`../../cloudfunctions/${name}/wechat-identity.js`).resolveWechatIdentity(context)
  it('新 AppID 使用有來源隔離的 owner，不接管資源方 OPENID', () => {
    expect(read(shared)).toEqual({
      appId: 'wxd0bc7afdc9cd334a',
      openId: 'new-user',
      ownerUid: 'wxd0bc7afdc9cd334a:new-user',
      shared: true,
    })
  })
  it('舊帳號維持原 owner，不遷移私人資料', () => {
    expect(read({ OPENID: 'old-user', APPID: 'wx8f961bcd8b26996a' })).toEqual({
      appId: 'wx8f961bcd8b26996a',
      openId: 'old-user',
      ownerUid: 'old-user',
      shared: false,
    })
  })
  it.each([{}, { FROM_APPID: '', FROM_OPENID: '' }])('新端直連沿用既有 owner', (fields) => {
    expect(read({ ...native, ...fields })).toEqual({
      appId: native.APPID,
      openId: native.OPENID,
      ownerUid: `${native.APPID}:${native.OPENID}`,
      shared: false,
    })
  })
  it.each([
    { ...native, APPID: 'foreign' },
    { ...native, ENV: 'foreign' },
    { ...native, SOURCE: 'scf' },
    { ...native, OPENID: '' },
    { ...native, FROM_OPENID: null },
    { ...native, FROM_APPID: 'foreign' },
  ])('拒絕不匹配的新端原生上下文', (context) => {
    expect(read(context)).toBeNull()
  })
  it.each([
    { ...shared, FROM_APPID: 'foreign' },
    { ...shared, APPID: 'foreign' },
    { ...shared, ENV: 'foreign' },
    { ...shared, SOURCE: 'wx_devtools,scf' },
    { ...shared, FROM_OPENID: '' },
    { ...shared, FROM_APPID: undefined },
  ])('缺失或不匹配的共享上下文拒絕身份', (context) => {
    expect(read(context)).toBeNull()
  })
})
