export type VisualGradeId = 'grade_2' | 'grade_3' | 'grade_4' | 'grade_5' | 'grade_6'

const NORMAL_GRADES: Record<string, VisualGradeId> = {
  '2': 'grade_2',
  '3': 'grade_3',
  '4': 'grade_4',
  '5': 'grade_5',
}

export function deriveVisualGradeId(source: { rank: string; boss?: number }): VisualGradeId {
  if (source.boss === 1) return 'grade_6'

  const grade = NORMAL_GRADES[source.rank]
  if (!grade) throw new Error(`VISUAL_GRADE_UNSUPPORTED: ${source.rank}`)

  return grade
}
