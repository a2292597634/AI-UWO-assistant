export interface OfficerVisualSource {
  visualGradeId: string
  typeId: string
  genderId: string
}

export interface OfficerVisualPaths {
  framePath: string
  rarityIconPath: string
  typeIconPath: string
  genderIconPath: string
}

const UI_ASSET_ROOT = '/assets/ui/'

const GRADE_SUFFIXES: Readonly<Record<string, string>> = {
  grade_2: '2',
  grade_3: '3',
  grade_4: '4',
  grade_5: '5',
  grade_6: '6',
}

const TYPE_ICON_PATHS: Readonly<Record<string, string>> = {
  type_class_1: `${UI_ASSET_ROOT}uwo-icon-class-1.png`,
  type_class_2: `${UI_ASSET_ROOT}uwo-icon-class-2.png`,
  type_class_3: `${UI_ASSET_ROOT}uwo-icon-class-3.png`,
}

const GENDER_ICON_PATHS: Readonly<Record<string, string>> = {
  gender_f: `${UI_ASSET_ROOT}gender-f.png`,
  gender_m: `${UI_ASSET_ROOT}gender-m.png`,
}

export function buildOfficerVisuals(source: Readonly<OfficerVisualSource>): OfficerVisualPaths {
  const gradeSuffix = GRADE_SUFFIXES[source.visualGradeId]

  return {
    framePath: gradeSuffix ? `${UI_ASSET_ROOT}uwo-bg-grade-${gradeSuffix}.png` : '',
    rarityIconPath: gradeSuffix ? `${UI_ASSET_ROOT}uwo-icon-grade-${gradeSuffix}.png` : '',
    typeIconPath: TYPE_ICON_PATHS[source.typeId] ?? '',
    genderIconPath: GENDER_ICON_PATHS[source.genderId] ?? '',
  }
}
