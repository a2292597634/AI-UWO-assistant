/* global module, require */
/* eslint-disable @typescript-eslint/no-require-imports */
const {
  collections,
  checkedContext,
  metadata,
  safeCode,
  randomUUID,
  missingDocument,
} = require('./shared')

function createProbe(cloud, config) {
  return async () => {
    try {
      const current = checkedContext(cloud, config)
      if (
        !config.timerSource ||
        ['wx_client', 'wx_devtools'].includes(config.timerSource) ||
        current.SOURCE !== config.timerSource ||
        current.OPENID
      )
        throw { code: 'source-forbidden' }
      const db = cloud.database()
      const rows = (
        await db
          .collection(collections.events)
          .where({ runId: config.runId, matched: false })
          .limit(20)
          .get()
      ).data
      const leaseId = randomUUID()
      let matched = 0
      for (const event of rows) {
        if (event.candidateSha !== config.candidateSha) continue
        const updated = await db.runTransaction(async (tx) => {
          const trace = tx.collection(collections.traces).doc(event._id)
          let target
          try {
            target = (await trace.get()).data
          } catch (error) {
            if (missingDocument(error)) return false
            throw error
          }
          if (
            !target ||
            target.runId !== config.runId ||
            target.candidateSha !== config.candidateSha ||
            target.traceId !== event.traceId
          )
            return false
          const currentEvent = (await tx.collection(collections.events).doc(event._id).get()).data
          if (currentEvent.matched) return false
          await tx
            .collection(collections.results)
            .doc(event._id)
            .set({
              data: {
                runId: config.runId,
                candidateSha: config.candidateSha,
                assetId: target.assetId,
                traceId: event.traceId,
                errCode: event.errCode,
                suggest: event.suggest,
                leaseId,
              },
            })
          await tx
            .collection(collections.events)
            .doc(event._id)
            .update({ data: { matched: true, leaseId } })
          return true
        })
        if (updated) matched++
      }
      return { ok: true, data: metadata(config, current, { matched }) }
    } catch (error) {
      return { ok: false, code: safeCode(error) }
    }
  }
}
module.exports = { createProbe }
