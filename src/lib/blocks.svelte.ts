import { page } from '$app/state'
import { Query } from 'zero-svelte'

interface AreaStats {
  numOfRoutes: number
  grades: { grade: string | undefined }[]
}

export const getStatsOfAreas = (areaIds: number[]) => {
  const allRoutes = $derived(
    new Query(
      page.data.z.current.query.routes.related('block', (q) =>
        q.related('area', (q) =>
          q.related('parent', (q) => q.related('parent', (q) => q.related('parent', (q) => q.related('parent')))),
        ),
      ),
    ),
  )

  const routes = $derived.by(() => {
    return allRoutes.current
      .map((route) => {
        const areaFks = [
          route.block?.area?.parent?.parent?.parent?.parent?.id,
          route.block?.area?.parent?.parent?.parent?.id,
          route.block?.area?.parent?.parent?.id,
          route.block?.area?.parent?.id,
          route.block?.area?.id,
        ].filter((id) => id != null)
        return { ...route, areaFks }
      })
      .filter((route) => areaIds.some((id) => route.areaFks.includes(id)))
  })

  const allAreaIds = routes.flatMap((route) => route.areaFks ?? [])
  const distinctAreaIds = [...new Set(allAreaIds)]

  const areaStats = distinctAreaIds.reduce(
    (obj, areaId) => {
      const areaRoutes = routes.filter((route) => route.areaFks?.includes(areaId))

      const gradesObj = areaRoutes.map((route): AreaStats['grades'][0] => {
        const grade = page.data.grades.find((grade) => grade.id === (route.userGradeFk ?? route.gradeFk))
        const gradeValue = grade?.[page.data.user?.userSettings?.gradingScale ?? 'FB'] ?? undefined

        return { grade: gradeValue }
      })

      return {
        ...obj,
        [areaId]: {
          numOfRoutes: areaRoutes.length,
          grades: gradesObj,
        },
      }
    },
    {} as Record<number, AreaStats | undefined>,
  )

  return { ...allRoutes, current: areaStats }
}
