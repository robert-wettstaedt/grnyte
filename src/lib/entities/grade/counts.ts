/** Routes per grade id (`gradeFk`), for the histogram and the donut. Ungraded routes are left out.
 *  A plain Map: callers rebuild it wholesale in a `$derived`, so per-key signals buy nothing. */
export const countRoutesByGrade = (routes: Iterable<{ gradeFk: null | number | undefined }>): Map<number, number> => {
  const counts = new Map<number, number>()
  for (const route of routes) {
    if (route.gradeFk != null) {
      counts.set(route.gradeFk, (counts.get(route.gradeFk) ?? 0) + 1)
    }
  }
  return counts
}
