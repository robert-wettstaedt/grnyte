/** The slice of Zero's (unexported) AST this walk reads: tables, relations, `exists` subqueries. */
export type Ast = { alias?: string; related?: readonly { subquery: Ast }[]; table: string; where?: Condition }
type Condition = { conditions?: readonly Condition[]; related?: { subquery: Ast }; type: string }

/** One hop a query takes: `{ from: 'routes', via: 'tags', to: 'routesToTags' }`. */
type Edge = { from: string; to: string; via: string }

/** A query object's AST. Zero keeps it on the query but does not export the type. */
export function astOf(query: unknown): Ast {
  return (query as { ast: Ast }).ast
}

/**
 * What `reads` reach that `synced` does not put on the device, as tables and `table.relation` hops.
 * A table `synced` selects at the top level counts whole; one it only reaches through a relation
 * (a topo's image in `files`) counts only along that relation, so route files are not covered.
 */
export function uncovered(reads: Ast[], synced: Ast[]): string[] {
  const whole = new Set(synced.map((ast) => ast.table))
  const along = new Set(synced.flatMap((ast) => edgesOf(ast).map(key)))

  const missing = [
    ...reads.filter((ast) => !whole.has(ast.table)).map((ast) => ast.table),
    ...reads
      .flatMap((ast) => edgesOf(ast))
      .filter((edge) => !whole.has(edge.to) && !along.has(key(edge)))
      .map(key),
  ]

  return [...new Set(missing)]
}

function edgesOf(ast: Ast, into: Edge[] = []): Edge[] {
  const hop = (subquery: Ast) => {
    // `exists` subqueries carry a reserved prefix on the relationship name.
    into.push({ from: ast.table, to: subquery.table, via: (subquery.alias ?? '').replace(/^zsubq_/, '') })
    edgesOf(subquery, into)
  }
  const visit = (condition: Condition | undefined) => {
    if (condition?.related != null) hop(condition.related.subquery)
    condition?.conditions?.forEach(visit)
  }

  ast.related?.forEach(({ subquery }) => hop(subquery))
  visit(ast.where)

  return into
}

const key = (edge: Edge) => `${edge.from}.${edge.via}`
