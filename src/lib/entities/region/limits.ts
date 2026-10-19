// No imports: `schema.ts` reads this under tsx in `npm run migrate`, before paraglide is compiled.

/** The seat cap a new region starts with, and the `regions.max_members` column default. Per region,
 *  so it is raised for one region without moving anybody else. /help/faq publishes it, so it is the
 *  column's source rather than a literal in `schema.ts`. */
export const DEFAULT_MAX_MEMBERS = 10
