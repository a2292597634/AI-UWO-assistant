import type { MaintenanceOfficerData, ReferenceCandidate } from '../contracts/officer-maintenance'
import { buildWorkOrderDiff } from '../domain/officer-maintenance'

const labels: Record<keyof MaintenanceOfficerData, string> = {
  name: '名稱',
  rarityId: '稀有度',
  visualGradeId: '視覺等級',
  typeId: '類型',
  genderId: '性別',
  jobId: '職業',
  nationalityId: '國家',
  languages: '語言',
  skills: '技能',
  recruitment: '招募資料',
  portraitId: '頭像 ID',
  displayOrder: '顯示排序',
  maintenanceNote: '維護備註',
}
const displayValue = (value: unknown): string =>
  value === null || value === undefined || value === ''
    ? '未設定'
    : typeof value === 'string'
      ? value
      : JSON.stringify(value)

/** 保留原始欄位值，另提供繁體欄名及可讀前後值。 */
export const buildMaintenanceDiff = (
  base: MaintenanceOfficerData | null,
  reviewed: MaintenanceOfficerData,
) => {
  const entries = base
    ? buildWorkOrderDiff(base, reviewed)
    : (Object.keys(labels) as (keyof MaintenanceOfficerData)[]).map((field) => ({
        field,
        before: null,
        after: reviewed[field],
      }))
  return entries.map((entry) => ({
    ...entry,
    label: labels[entry.field],
    beforeText: displayValue(entry.before),
    afterText: displayValue(entry.after),
  }))
}

/** 合併候選至已由頁面驗證的正式 ID；保留既有关聯等級，不產生正式 ID。 */
export const mergeMaintenanceCandidate = (
  data: MaintenanceOfficerData,
  candidates: readonly ReferenceCandidate[],
  key: string,
  id: string,
) => {
  const candidate = candidates.find((item) => item.key === key)
  if (!candidate || !id) return { reviewedData: data, referenceCandidates: candidates }
  let reviewedData = data
  if (candidate.kind === 'job') reviewedData = { ...data, jobId: id }
  if (candidate.kind === 'nationality') reviewedData = { ...data, nationalityId: id }
  if (candidate.kind === 'language' && !data.languages.some((item) => item.languageId === id))
    reviewedData = { ...data, languages: [...data.languages, { languageId: id, level: 1 }] }
  if (candidate.kind === 'skill' && !data.skills.some((item) => item.skillId === id))
    reviewedData = {
      ...data,
      skills: [
        ...data.skills,
        {
          skillId: id,
          kind: 'passive',
          sourceGroup: 'sk0',
          slot:
            Math.max(
              -1,
              ...data.skills.filter((item) => item.sourceGroup === 'sk0').map((item) => item.slot),
            ) + 1,
          unlockLevel: 1,
          level: 1,
        },
      ],
    }
  return { reviewedData, referenceCandidates: candidates.filter((item) => item.key !== key) }
}
