function missing(error) {
  return (
    ['DATABASE_DOCUMENT_NOT_EXIST', 'DOCUMENT_NOT_FOUND'].includes(error?.code) ||
    error?.message === 'not found' ||
    /^document\.get:fail.*(?:document.*does not exist|no document found)/i.test(
      error?.errMsg || error?.message || '',
    )
  )
}
function createRepository(db) {
  function port(database) {
    return {
      async get(collection, id) {
        try {
          return (await database.collection(collection).doc(id).get()).data || null
        } catch (error) {
          if (missing(error)) return null
          throw error
        }
      },
      async set(collection, id, row) {
        const data = { ...row }
        delete data._id
        await database.collection(collection).doc(id).set({ data })
      },
      async remove(collection, id) {
        await database.collection(collection).doc(id).remove()
      },
      async query(collection, input = {}) {
        const filters = { ...input.eq },
          field = input.field || 'orderKey'
        if (input.before !== undefined)
          filters[input.beforeField || field] = db.command.lt(input.before)
        if (input.after !== undefined && input.after !== null)
          filters[field] = db.command.gt(input.after)
        let query = database
          .collection(collection)
          .where(filters)
          .orderBy(field, input.order || 'desc')
        query = query.limit(input.limit || 20)
        return (await query.get()).data
      },
    }
  }
  return { ...port(db), transaction: (work) => db.runTransaction((tx) => work(port(tx))) }
}
module.exports = { createRepository }
