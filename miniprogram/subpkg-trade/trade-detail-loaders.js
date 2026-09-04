var loaders = [
  function () { return require('./trade-details-0.js') },
  function () { return require('./trade-details-1.js') },
  function () { return require('./trade-details-2.js') },
  function () { return require('./trade-details-3.js') },
  function () { return require('./trade-details-4.js') },
  function () { return require('./trade-details-5.js') },
  function () { return require('./trade-details-6.js') },
  function () { return require('./trade-details-7.js') },
  function () { return require('./trade-details-8.js') },
  function () { return require('./trade-details-9.js') },
]

module.exports = function loadTradeDetail(id, index) {
  var shard = index[id]
  if (typeof shard !== "number" || !loaders[shard]) return null
  return loaders[shard]()[id] || null
}
