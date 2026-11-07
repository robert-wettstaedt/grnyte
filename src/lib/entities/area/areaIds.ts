/** One area's token in `routes.areaIds`. Delimited both sides so `^1$` never matches inside `^12$`. */
export const areaToken = (id: number) => `^${id}$`

/** `routes.areaIds`: the route's area chain as tokens, which `routes/queries.ts` matches with `%token%`. */
export const areaIdsOf = (areaFks: readonly number[]) => areaFks.map(areaToken).join(',')
