const C = require('./collections')
const { fail } = require('./validation')
const { validateOperationId, payloadHash } = require('./operation-policy')

function createOperations(ctx) {
  const ownerDefault = (actor) => ({
    ownerKey: actor.ownerKey,
    openId: actor.openId,
    profileRevision: 0,
    restricted: false,
    clearing: false,
    lastVisitAt: ctx.now(),
    lastSubmitAt: null,
    day: '',
    dailyCount: 0,
    minute: 0,
    attempts: 0,
  })
  async function owner(tx, actor) {
    return (await tx.get(C.owners, actor.ownerKey)) || ownerDefault(actor)
  }
  async function write(
    action,
    input,
    actor,
    work,
    { allowClearing = false, allowRestricted = false, admin = false } = {},
  ) {
    const id = ctx.hash(actor.ownerKey + ':' + action + ':' + input.operationId),
      hash = payloadHash(input)
    // 嘗試額度先獨立提交；業務交易失敗仍限流，業務資料本身完整回滾。
    const cached = await ctx.repo.transaction(async (tx) => {
      if (admin && !ctx.isAdmin(actor)) throw fail('forbidden')
      const existing = await tx.get(C.operations, id)
      if (existing) {
        if (existing.payloadHash !== hash) throw fail('operation-conflict')
        return existing.reference
      }
      if (!validateOperationId(input.operationId, ctx.now())) throw fail('operation-expired')
      const state = await owner(tx, actor),
        minute = Math.floor(ctx.now() / 60000)
      if (state.clearing && !allowClearing) throw fail('clearing')
      if (state.restricted && !allowRestricted) throw fail('restricted')
      if (state.minute !== minute) {
        state.minute = minute
        state.attempts = 0
        state.chargedOperations = []
      }
      const charged = (state.chargedOperations || []).find((item) => item.id === id)
      if (charged) {
        if (charged.hash !== hash) throw fail('operation-conflict')
        return null
      }
      if (state.attempts >= 5) throw fail('rate-limited')
      state.attempts++
      state.chargedOperations = [...(state.chargedOperations || []), { id, hash }]
      await tx.set(C.owners, actor.ownerKey, state)
      return null
    })
    if (cached) return cached
    return ctx.repo.transaction(async (tx) => {
      if (admin && !ctx.isAdmin(actor)) throw fail('forbidden')
      const existing = await tx.get(C.operations, id)
      if (existing) {
        if (existing.payloadHash !== hash) throw fail('operation-conflict')
        return existing.reference
      }
      if (!validateOperationId(input.operationId, ctx.now())) throw fail('operation-expired')
      const state = await owner(tx, actor)
      if (state.clearing && !allowClearing) throw fail('clearing')
      if (state.restricted && !allowRestricted) throw fail('restricted')
      state.lastVisitAt = ctx.now()
      const reference = await work(tx, state)
      await tx.set(C.owners, actor.ownerKey, state)
      await tx.set(C.operations, id, {
        ownerKey: actor.ownerKey,
        action,
        operationId: input.operationId,
        payloadHash: hash,
        reference,
        createdAt: ctx.now(),
        expiresAt: ctx.now() + 2592000000,
      })
      return reference
    })
  }
  return { write, owner, ownerDefault }
}
module.exports = { createOperations }
