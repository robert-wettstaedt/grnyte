import type { Row } from './db/zero'

export const getGradeColor = (grade: Row<'grades'>) => {
  return grade.id == null ? '' : grade.id < 7 ? '#f59e0b' : grade.id < 14 ? '#b91c1c' : '#581c87'
}
