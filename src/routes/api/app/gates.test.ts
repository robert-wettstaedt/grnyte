/**
 * Every app API route is built by `appEndpoint`, so each one gets the JSON-only, version, Bearer
 * and error-shape rules (design decision 1). Static, like `src/lib/remote/gates.test.ts`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const ROOT = join(process.cwd(), 'src/routes/api/app')

const routeFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? routeFiles(join(dir, entry.name))
      : entry.name === '+server.ts'
        ? [join(dir, entry.name)]
        : [],
  )

/** Each export that is not `export const X = appEndpoint(...)`, named for the failure message. */
const strayExports = (source: string): string[] =>
  ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true).statements.flatMap(strayIn)

function strayIn(statement: ts.Statement): string[] {
  if (ts.isExportDeclaration(statement) || ts.isExportAssignment(statement)) return [statement.getText().slice(0, 40)]
  const exported =
    ts.canHaveModifiers(statement) &&
    ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  if (!exported || ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) return []
  if (!ts.isVariableStatement(statement)) return [statement.getText().slice(0, 40)]
  return statement.declarationList.declarations
    .filter((d) => !builtByAppEndpoint(d.initializer))
    .map((d) => d.name.getText())
}

const builtByAppEndpoint = (init: ts.Expression | undefined): boolean =>
  init != null &&
  ts.isCallExpression(init) &&
  ts.isIdentifier(init.expression) &&
  init.expression.text === 'appEndpoint'

describe('app API routes', () => {
  it('export only handlers built by appEndpoint', () => {
    const found = Object.fromEntries(
      routeFiles(ROOT).map((path) => [relative(ROOT, path), strayExports(readFileSync(path, 'utf8'))]),
    )
    expect(Object.keys(found).length).toBeGreaterThan(0)
    expect(Object.entries(found).filter(([, stray]) => stray.length > 0)).toEqual([])
  })

  it('catches a bare handler', () => {
    expect(strayExports('export const POST: RequestHandler = async () => json({})')).toEqual(['POST'])
    expect(strayExports('export async function GET() {}')).toHaveLength(1)
    expect(strayExports('export const GET = appEndpoint({})')).toEqual([])
  })
})
