const { createHash } = require('node:crypto')
function validateOperationId(value, now) {
  if (typeof value !== 'string' || !/^\d{13}_[a-f0-9]{32}$/.test(value)) return false
  const created = Number(value.slice(0, 13))
  return created >= now - 86400000 && created <= now + 120000
}
function stable(value) {
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value))
    return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']'
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + stable(value[key]))
        .join(',') +
      '}'
    )
  throw new Error('input-invalid')
}
const payloadHash = (input) => createHash('sha256').update(stable(input)).digest('hex')
module.exports = { validateOperationId, payloadHash }
