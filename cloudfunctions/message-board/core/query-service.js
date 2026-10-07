const { createHmac, timingSafeEqual } = require('node:crypto')
const C = require('./collections')
const { fail } = require('./validation')
const { publicDto, mineDto, profileDto } = require('./dto')

function createQueries(ctx) {
  const signing = (value) => createHmac('sha256', ctx.secret).update(value).digest('hex')
  const encode = (value) => {
    const body = Buffer.from(JSON.stringify(value)).toString('base64url')
    return body + '.' + signing(body)
  }
  function cursor(input, scope) {
    if (!input.cursor) return { scope, before: String(ctx.now() + 1).padStart(13, '0') + ':~' }
    if (typeof input.cursor !== 'string' || input.cursor.length > 1024) throw fail('cursor-invalid')
    const [body, sig, ...extra] = input.cursor.split('.')
    if (
      extra.length ||
      !/^[a-f0-9]{64}$/.test(sig || '') ||
      !timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(signing(body), 'hex'))
    )
      throw fail('cursor-invalid')
    let parsed
    try {
      parsed = JSON.parse(Buffer.from(body, 'base64url').toString())
    } catch {
      throw fail('cursor-invalid')
    }
    if (
      parsed.scope !== scope ||
      typeof parsed.before !== 'string' ||
      !/^\d{13}:[a-zA-Z0-9~-]{1,64}$/.test(parsed.before)
    )
      throw fail('cursor-invalid')
    return parsed
  }
  async function eligible(message) {
    if (message.status !== 'published') return false
    const owner = await ctx.repo.get(C.owners, message.ownerKey)
    return owner && !owner.clearing && (await ctx.publishable(message, owner))
  }
  async function list(kind, input, actor) {
    if (kind === 'mine' && (await ctx.repo.get(C.owners, actor.ownerKey))?.clearing)
      return { items: [], nextCursor: null }
    const limit = input.limit === undefined ? 20 : input.limit
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw fail('input-invalid')
    const scope = JSON.stringify([
      kind,
      kind === 'public' ? 'public' : actor.ownerKey,
      input.gameServerId || null,
      input.status || null,
    ])
    let page = cursor(input, scope),
      more = true
    const items = []
    const eq = {}
    if (kind === 'public') eq.status = 'published'
    if (kind === 'mine') eq.ownerKey = actor.ownerKey
    if (kind === 'admin') eq.status = input.status || 'pending-review'
    if (input.gameServerId) {
      if (!ctx.catalog.servers.some((server) => server.id === input.gameServerId))
        throw fail('server-invalid')
      eq.gameServerId = input.gameServerId
    }
    const field = kind === 'public' ? 'publishedKey' : 'orderKey'
    for (let batch = 0; batch < 5 && items.length < limit && more; batch++) {
      const rows = await ctx.repo.query(C.messages, { eq, before: page.before, field, limit: 20 })
      more = rows.length === 20
      for (const message of rows) {
        page = { scope, before: message[field] }
        if (message.deleted || (kind === 'public' && !(await eligible(message)))) continue
        if (kind === 'public') items.push(publicDto(message))
        else if (kind === 'mine') items.push(mineDto(message))
        else {
          const owner = await ctx.repo.get(C.owners, message.ownerKey)
          items.push({
            ...mineDto(message),
            canApprove: !!owner && !owner.restricted && (await ctx.publishable(message, owner)),
            needsManualReview:
              Object.values(message.safety).includes('review') && !message.manualReviewsComplete,
            authorRestricted: !!owner?.restricted,
            replySafety: message.replyCandidate?.safety || null,
          })
        }
        if (items.length === limit) {
          more = more || message !== rows[rows.length - 1]
          break
        }
      }
    }
    return { items, nextCursor: more ? encode(page) : null }
  }
  async function resolve(reference, actor, admin = false) {
    if (reference.kind === 'message') {
      const message = await ctx.repo.get(C.messages, reference.id)
      if (message && (await ctx.repo.get(C.owners, message.ownerKey))?.clearing)
        throw fail('not-found')
      if (!message || message.deleted || (!admin && message.ownerKey !== actor.ownerKey))
        throw fail('not-found')
      return mineDto(message)
    }
    if (reference.kind === 'profile') {
      const profile = await ctx.repo.get(C.profiles, reference.id),
        owner = await ctx.repo.get(C.owners, actor.ownerKey)
      if (!profile || profile.ownerKey !== actor.ownerKey || owner?.clearing)
        throw fail('profile-version-expired')
      return profileDto(profile, owner?.lastServerId || null)
    }
    if (reference.kind === 'clear')
      return { clearing: !!(await ctx.repo.get(C.owners, actor.ownerKey))?.clearing }
    if (reference.kind === 'report') return { reported: true }
    if (reference.kind === 'resolvedReport') return { resolved: true }
    if (reference.kind === 'asset') return { assetId: reference.id }
    throw fail('input-invalid')
  }
  return { list, resolve, eligible, encode, cursor }
}
module.exports = { createQueries }
