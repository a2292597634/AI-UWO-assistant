/** 單一維護來源；worker 副本由 data:generate 產生，禁止手改。 */
const LEADS = [10800, 3600, 600]
const availableLeads = (now, start) => LEADS.filter((lead) => now < start - lead)
const occurrenceKey = (event) =>
  `${event.zoneId}:${event.eventTypeId}:${event.triggerAtUnixSeconds}`
function validOccurrence(reference, event) {
  if (!event || !Number.isSafeInteger(event.triggerAtUnixSeconds)) return false
  const zone = reference.zones.find((item) => item.id === event.zoneId)
  if (!zone) return false
  const hour =
    (event.triggerAtUnixSeconds - reference.anchorEpochSeconds - zone.delaySeconds) / 3600
  if (!Number.isInteger(hour)) return false
  return reference.eventTypes
    .filter((type) => (hour + 401 * zone.phaseHours) % type.periodHours === 0)
    .slice(0, 2)
    .some((type) => type.id === event.eventTypeId)
}
module.exports = { LEADS, availableLeads, occurrenceKey, validOccurrence }
