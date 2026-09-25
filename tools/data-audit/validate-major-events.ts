import { existsSync } from 'node:fs'
import type { AuditFinding } from './types'
import type { CanonicalMajorEventsDataset, CanonicalTradeDataset } from '../import/types'

const SOURCE_SNAPSHOT = 'voyage-tw-2026052501-trade-20260904'
const SOURCE_VERSION = '2026052501'
const SOURCE_MANIFEST_SHA256 = 'ccb1a0d53adf9d07322ee68c19cb2f1a772b76aeac660e30bd4c0ca72b3f5064'
const ANCHOR_EPOCH_SECONDS = 1670889600

const expectedEventTypes: ReadonlyArray<{
  id: string
  name: string
  periodHours: number
  tradeTypeIds: readonly string[]
}> = [
  {
    id: 'pop1',
    name: '奢侈',
    periodHours: 379,
    tradeTypeIds: ['tradetype17', 'tradetype13', 'tradetype15'],
  },
  {
    id: 'pop2',
    name: '繁榮',
    periodHours: 337,
    tradeTypeIds: ['tradetype18', 'tradetype16', 'tradetype14'],
  },
  {
    id: 'pop3',
    name: '開發',
    periodHours: 311,
    tradeTypeIds: ['tradetype09', 'tradetype08', 'tradetype03', 'tradetype06'],
  },
  {
    id: 'pop4',
    name: '贊助',
    periodHours: 269,
    tradeTypeIds: ['tradetype10', 'tradetype13', 'tradetype14'],
  },
  {
    id: 'pop5',
    name: '戰爭',
    periodHours: 241,
    tradeTypeIds: ['tradetype03', 'tradetype20', 'tradetype19'],
  },
  {
    id: 'pop6',
    name: '洪水',
    periodHours: 223,
    tradeTypeIds: ['tradetype09', 'tradetype01', 'tradetype12'],
  },
  {
    id: 'pop7',
    name: '傳染病',
    periodHours: 199,
    tradeTypeIds: ['tradetype11', 'tradetype04', 'tradetype05'],
  },
  {
    id: 'pop8',
    name: '節慶',
    periodHours: 179,
    tradeTypeIds: ['tradetype07', 'tradetype01', 'tradetype02'],
  },
]

const expectedZones: ReadonlyArray<{
  id: string
  name: string
  phaseHours: number
  delaySeconds: number
}> = [
  { id: 'zone_37', name: '北海', phaseHours: 0, delaySeconds: 0 },
  { id: 'zone_41', name: '東地中海', phaseHours: -1, delaySeconds: 60 },
  { id: 'zone_57', name: '南歐&西地中海', phaseHours: -2, delaySeconds: 0 },
  { id: 'zone_21', name: '西非', phaseHours: -3, delaySeconds: 60 },
  { id: 'zone_22', name: '南非', phaseHours: -4, delaySeconds: 60 },
  { id: 'zone_23', name: '東非', phaseHours: -5, delaySeconds: 180 },
  { id: 'zone_58', name: '阿拉伯&西印度', phaseHours: -6, delaySeconds: 180 },
  { id: 'zone_59', name: '東印度&印度支那', phaseHours: -7, delaySeconds: 240 },
  { id: 'zone_50', name: '南亞', phaseHours: -8, delaySeconds: 240 },
  { id: 'zone_53', name: '東亞', phaseHours: -9, delaySeconds: 240 },
  { id: 'zone_54', name: '東北亞', phaseHours: -10, delaySeconds: 300 },
  { id: 'zone_33', name: '大洋洲', phaseHours: -11, delaySeconds: 360 },
  { id: 'zone_63', name: '大洋洲東部', phaseHours: -12, delaySeconds: 360 },
  { id: 'zone_34', name: '北極海', phaseHours: -13, delaySeconds: 390 },
  { id: 'zone_18', name: '西南美', phaseHours: -14, delaySeconds: 600 },
  { id: 'zone_60', name: '美東', phaseHours: -15, delaySeconds: 600 },
  { id: 'zone_20', name: '西北美', phaseHours: -16, delaySeconds: 480 },
  { id: 'zone_55', name: '太平洋', phaseHours: -17, delaySeconds: 420 },
]

const sourceReferenceForEvent = (id: string): string =>
  `map.js:popular() modulus; json.js:popular_trade.${id}; lang_1.js:${id}`

const sourceReferenceForZone = (id: string): string =>
  `json.js:pop_zone.${id} (z,d); lang_1.js:${id}`

const finding = (
  code: string,
  entityType: string,
  entityId: string,
  path: string,
  observedValue: unknown,
  message: string,
): AuditFinding => ({
  severity: 'error',
  code,
  entityType,
  entityId,
  path,
  observedValue,
  message,
  suggestedAction: '依 voyage.tw 已核對的來源列修正大流行權威資料。',
})

const sourceReferenceText = (sourceRefs: unknown): string | null => {
  if (sourceRefs === null || typeof sourceRefs !== 'object' || Array.isArray(sourceRefs))
    return null
  const voyageTw = (sourceRefs as { voyageTw?: unknown }).voyageTw
  return typeof voyageTw === 'string' ? voyageTw : null
}

const equalOrderedValues = (actual: readonly unknown[], expected: readonly string[]): boolean =>
  actual.length === expected.length && actual.every((value, index) => value === expected[index])

export const validateMajorEvents = (
  dataset: CanonicalMajorEventsDataset,
  tradeDataset: CanonicalTradeDataset,
): AuditFinding[] => {
  const findings: AuditFinding[] = []
  if (dataset === null || typeof dataset !== 'object' || Array.isArray(dataset)) {
    return [
      finding(
        'INVALID_MAJOR_EVENT_DATASET',
        'majorEvents',
        'dataset',
        '/',
        dataset,
        '大流行權威資料必須是包含事件與海域集合的物件。',
      ),
    ]
  }
  const eventTypes = Array.isArray(dataset.eventTypes) ? dataset.eventTypes : []
  const zones = Array.isArray(dataset.zones) ? dataset.zones : []

  for (const [key, expected] of Object.entries({
    sourceSnapshot: SOURCE_SNAPSHOT,
    sourceVersion: SOURCE_VERSION,
    sourceManifestSha256: SOURCE_MANIFEST_SHA256,
    anchorEpochSeconds: ANCHOR_EPOCH_SECONDS,
  })) {
    const observed = dataset[key as keyof CanonicalMajorEventsDataset]
    if (observed !== expected) {
      findings.push(
        finding(
          'MAJOR_EVENT_SOURCE_METADATA',
          'majorEvents',
          'source',
          `/${key}`,
          observed,
          '來源快照、版本、清單雜湊與計算錨點必須一致。',
        ),
      )
    }
  }

  if (eventTypes.length !== expectedEventTypes.length) {
    findings.push(
      finding(
        'MAJOR_EVENT_TYPE_COUNT',
        'majorEvents',
        'eventTypes',
        '/eventTypes',
        eventTypes.length,
        '來源事件類型必須恰好包含八項。',
      ),
    )
  }

  const seenEventIds = new Set<string>()
  for (const [index, rawEvent] of eventTypes.entries()) {
    if (rawEvent === null || typeof rawEvent !== 'object' || Array.isArray(rawEvent)) {
      findings.push(
        finding(
          'INVALID_MAJOR_EVENT_RECORD',
          'majorEventType',
          '*',
          `/eventTypes/${index}`,
          rawEvent,
          '事件類型必須是符合 schema 的物件。',
        ),
      )
      continue
    }
    const event = rawEvent as CanonicalMajorEventsDataset['eventTypes'][number]
    const eventId = typeof event.id === 'string' ? event.id : '*'
    const expected = expectedEventTypes[index]
    if (eventId !== '*' && seenEventIds.has(eventId)) {
      findings.push(
        finding(
          'DUPLICATE_MAJOR_EVENT_ID',
          'majorEventType',
          eventId,
          `/eventTypes/${index}/id`,
          eventId,
          '事件 ID 必須在集合內唯一。',
        ),
      )
    }
    if (eventId !== '*') seenEventIds.add(eventId)

    if (expected === undefined) continue
    if (event.id !== expected.id) {
      findings.push(
        finding(
          'MAJOR_EVENT_SOURCE_ORDER',
          'majorEventType',
          eventId,
          `/eventTypes/${index}/id`,
          event.id,
          `此位置應為來源順序中的 ${expected.id}。`,
        ),
      )
    }
    for (const key of ['name', 'periodHours'] as const) {
      if (event[key] !== expected[key]) {
        findings.push(
          finding(
            'MAJOR_EVENT_SOURCE_ROW_MISMATCH',
            'majorEventType',
            eventId,
            `/eventTypes/${index}/${key}`,
            event[key],
            `事件 ${eventId} 的 ${key} 必須與來源列一致。`,
          ),
        )
      }
    }
    const tradeTypeIds = Array.isArray(event.tradeTypeIds) ? event.tradeTypeIds : []
    if (!equalOrderedValues(tradeTypeIds, expected.tradeTypeIds)) {
      findings.push(
        finding(
          'MAJOR_EVENT_SOURCE_MAPPING',
          'majorEventType',
          eventId,
          `/eventTypes/${index}/tradeTypeIds`,
          event.tradeTypeIds,
          '交易品類 ID 及順序必須與來源 mapping 一致。',
        ),
      )
    }
    if (sourceReferenceText(event.sourceRefs) !== sourceReferenceForEvent(expected.id)) {
      findings.push(
        finding(
          'MAJOR_EVENT_SOURCE_REFERENCE',
          'majorEventType',
          eventId,
          `/eventTypes/${index}/sourceRefs`,
          event.sourceRefs,
          '事件來源引用必須指向週期公式、mapping 和繁體中文名稱欄位。',
        ),
      )
    }

    for (const [typeIndex, rawTradeTypeId] of tradeTypeIds.entries()) {
      const tradeTypeId = typeof rawTradeTypeId === 'string' ? rawTradeTypeId : ''
      const match = /^tradetype(0[1-9]|1[0-9]|20)$/.exec(tradeTypeId)
      const canonicalId = match?.[1]
      if (
        canonicalId === undefined ||
        !tradeDataset.tradeTypes.some((tradeType) => tradeType.id === canonicalId)
      ) {
        findings.push(
          finding(
            'UNKNOWN_MAJOR_EVENT_TRADE_TYPE',
            'majorEventType',
            eventId,
            `/eventTypes/${index}/tradeTypeIds/${typeIndex}`,
            rawTradeTypeId,
            '事件交易品類必須正規化後參照 trade-goods.json 的 tradeTypes ID。',
          ),
        )
      }
    }
  }

  if (zones.length !== expectedZones.length) {
    findings.push(
      finding(
        'MAJOR_EVENT_ZONE_COUNT',
        'majorEvents',
        'zones',
        '/zones',
        zones.length,
        '來源海域必須恰好包含十八項。',
      ),
    )
  }

  const seenZoneIds = new Set<string>()
  for (const [index, rawZone] of zones.entries()) {
    if (rawZone === null || typeof rawZone !== 'object' || Array.isArray(rawZone)) {
      findings.push(
        finding(
          'INVALID_MAJOR_EVENT_RECORD',
          'majorEventZone',
          '*',
          `/zones/${index}`,
          rawZone,
          '海域必須是符合 schema 的物件。',
        ),
      )
      continue
    }
    const zone = rawZone as CanonicalMajorEventsDataset['zones'][number]
    const zoneId = typeof zone.id === 'string' ? zone.id : '*'
    const expected = expectedZones[index]
    if (zoneId !== '*' && seenZoneIds.has(zoneId)) {
      findings.push(
        finding(
          'DUPLICATE_MAJOR_EVENT_ZONE_ID',
          'majorEventZone',
          zoneId,
          `/zones/${index}/id`,
          zoneId,
          '海域 ID 必須在集合內唯一。',
        ),
      )
    }
    if (zoneId !== '*') seenZoneIds.add(zoneId)

    if (expected === undefined) continue
    if (zone.id !== expected.id) {
      findings.push(
        finding(
          'MAJOR_EVENT_SOURCE_ORDER',
          'majorEventZone',
          zoneId,
          `/zones/${index}/id`,
          zone.id,
          `此位置應為來源順序中的 ${expected.id}。`,
        ),
      )
    }
    for (const key of ['name', 'phaseHours', 'delaySeconds'] as const) {
      if (zone[key] !== expected[key]) {
        findings.push(
          finding(
            'MAJOR_EVENT_SOURCE_ROW_MISMATCH',
            'majorEventZone',
            zoneId,
            `/zones/${index}/${key}`,
            zone[key],
            `海域 ${zoneId} 的 ${key} 必須與來源列一致。`,
          ),
        )
      }
    }
    if (typeof zone.phaseHours === 'number' && (zone.phaseHours < -17 || zone.phaseHours > 0)) {
      findings.push(
        finding(
          'MAJOR_EVENT_PHASE_RANGE',
          'majorEventZone',
          zoneId,
          `/zones/${index}/phaseHours`,
          zone.phaseHours,
          '海域相位必須介於 -17 和 0 小時。',
        ),
      )
    }
    if (
      typeof zone.delaySeconds === 'number' &&
      (zone.delaySeconds < 0 || zone.delaySeconds > 600)
    ) {
      findings.push(
        finding(
          'MAJOR_EVENT_DELAY_RANGE',
          'majorEventZone',
          zoneId,
          `/zones/${index}/delaySeconds`,
          zone.delaySeconds,
          '海域觸發延遲必須介於 0 和 600 秒。',
        ),
      )
    }
    if (zone.regionIconId !== expected.id) {
      findings.push(
        finding(
          'MAJOR_EVENT_SOURCE_ROW_MISMATCH',
          'majorEventZone',
          zoneId,
          `/zones/${index}/regionIconId`,
          zone.regionIconId,
          '海域徽記 ID 必須對應同一來源 zone ID。',
        ),
      )
    }
    if (sourceReferenceText(zone.sourceRefs) !== sourceReferenceForZone(expected.id)) {
      findings.push(
        finding(
          'MAJOR_EVENT_SOURCE_REFERENCE',
          'majorEventZone',
          zoneId,
          `/zones/${index}/sourceRefs`,
          zone.sourceRefs,
          '海域來源引用必須指向 pop_zone 的相位／延遲和名稱欄位。',
        ),
      )
    }

    if (typeof zone.regionIconId === 'string' && /^zone_[0-9]+$/.test(zone.regionIconId)) {
      const assetName = zone.regionIconId.replace(/^zone_/, 'region-zone-') + '.png'
      if (!existsSync(`miniprogram/subpkg-trade/assets/major-events/${assetName}`)) {
        findings.push(
          finding(
            'UNKNOWN_MAJOR_EVENT_REGION_ICON',
            'majorEventZone',
            zoneId,
            `/zones/${index}/regionIconId`,
            zone.regionIconId,
            '每個來源海域都必須對應已生成的本地徽記素材。',
          ),
        )
      }
    } else {
      findings.push(
        finding(
          'UNKNOWN_MAJOR_EVENT_REGION_ICON',
          'majorEventZone',
          zoneId,
          `/zones/${index}/regionIconId`,
          zone.regionIconId,
          '徽記 ID 必須使用 zone_<數字> 格式。',
        ),
      )
    }
  }

  return findings
}
