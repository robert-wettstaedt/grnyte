import type { Row } from './db/zero'

export const getGradeColor = (grade: number | Row<'grades'>) => {
  const id = typeof grade === 'number' ? grade : grade.id

  return id == null ? '' : id < 7 ? '#f59e0b' : id < 14 ? '#b91c1c' : '#581c87'
}
