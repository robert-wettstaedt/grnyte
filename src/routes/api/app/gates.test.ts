import { V1 } from '$lib/auth/app/v1'
/**
 * Every app API route is built by `appEndpoint`, so each one gets the JSON-only, version, Bearer
 * and error-shape rules. Static, like `src/lib/remote/gates.test.ts`.
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

/** The first argument of each `appEndpoint(...)` export, a literal key. */
const endpointKeys = (source: string): (string | undefined)[] =>
  ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true).statements.flatMap((statement) =>
    ts.isVariableStatement(statement)
      ? statement.declarationList.declarations.map((d) => {
          const key =
            d.initializer != null && ts.isCallExpression(d.initializer) ? d.initializer.arguments[0] : undefined
          return key != null && ts.isStringLiteralLike(key) ? key.text : undefined
        })
      : [],
  )

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

  it('keys each route by its directory under v1', () => {
    const v1 = join(ROOT, 'v1')
    const found = routeFiles(v1).map(
      (path) => [relative(v1, join(path, '..')), endpointKeys(readFileSync(path, 'utf8'))] as const,
    )
    expect(found.length).toBeGreaterThan(0)
    expect(found.filter(([dir, keys]) => keys.length !== 1 || keys[0] !== dir)).toEqual([])
    expect(found.map(([dir]) => dir).sort()).toEqual(Object.keys(V1).sort())
  })

  it('catches a bare handler', () => {
    expect(strayExports('export const POST: RequestHandler = async () => json({})')).toEqual(['POST'])
    expect(strayExports('export async function GET() {}')).toHaveLength(1)
    expect(strayExports('export const GET = appEndpoint({})')).toEqual([])
  })
})
