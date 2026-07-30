var loaders = [
  function () { return require('./details-0.js') },
  function () { return require('./details-1.js') },
  function () { return require('./details-2.js') },
  function () { return require('./details-3.js') },
  function () { return require('./details-4.js') },
  function () { return require('./details-5.js') },
  function () { return require('./details-6.js') },
  function () { return require('./details-7.js') },
  function () { return require('./details-8.js') },
  function () { return require('./details-9.js') },
]

module.exports = function loadDetail(id, index) {
  var shard = index[id]
  if (typeof shard !== "number" || !loaders[shard]) return null
  return loaders[shard]()[id] || null
}
